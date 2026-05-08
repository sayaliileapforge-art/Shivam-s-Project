/**
 * BullMQ Worker for the bulk-import-queue.
 *
 * Why a separate worker module?
 * ------------------------------
 * Keeping the Worker creation separate from the Queue and the Express server
 * means you can:
 *   a) run workers in a separate Node.js process / pod for horizontal scaling;
 *   b) independently scale API instances (queue producers) vs worker instances
 *      (queue consumers) in a Kubernetes / Render environment;
 *   c) test the processor function independently without starting the worker.
 *
 * Concurrency:
 *   concurrency: 3 means up to 3 import jobs run in parallel in this process.
 *   Each job streams its ZIP asynchronously so 3 concurrent jobs do not block
 *   each other.  Increase or decrease based on SFTP / disk I/O capacity.
 *
 * Queue Events:
 *   QueueEvents is a lightweight listener that receives job lifecycle events
 *   from Redis without using a Worker connection.  It is used here purely for
 *   logging — the status API reads job state directly from the Queue object.
 *
 * Graceful shutdown:
 *   worker.close() is called on SIGINT / SIGTERM so in-flight jobs are allowed
 *   to finish (up to 5 s) before the process exits.
 */

import { Worker, QueueEvents } from 'bullmq';
import path from 'path';
import os   from 'os';

import { redisConnectionOptions } from '../redis/connection';
import { BULK_IMPORT_QUEUE }      from '../queues/bulkImportQueue';
import { bulkImportProcessor }    from '../processors/bulkImportProcessor';
import { cleanupDir }             from '../utils/fileCleanup';
import { createLogger }           from '../utils/logger';

const log = createLogger('Worker');

// ─── Concurrency ─────────────────────────────────────────────────────────────
// How many jobs to process simultaneously in this worker instance.
// Override with BULK_IMPORT_CONCURRENCY env var for easy tuning.
const CONCURRENCY = parseInt(process.env.BULK_IMPORT_CONCURRENCY ?? '3', 10);

// ─── Worker ───────────────────────────────────────────────────────────────────
export const bulkImportWorker = new Worker(
  BULK_IMPORT_QUEUE,
  bulkImportProcessor,
  {
    connection:  redisConnectionOptions,
    concurrency: CONCURRENCY,
    // Lock duration: how long a job can be "active" before BullMQ considers
    // the worker stalled.  Import jobs can take several minutes for large ZIPs.
    lockDuration: 5 * 60 * 1_000, // 5 minutes
    // Extend the lock automatically so long-running jobs don't get re-queued.
    lockRenewTime: 2 * 60 * 1_000, // renew every 2 minutes
  },
);

bulkImportWorker.on('active', (job) => {
  log.info(`Job active — id=${job.id} attempt=${job.attemptsMade + 1}`);
});

bulkImportWorker.on('completed', (job, result) => {
  log.info(
    `Job completed — id=${job.id}  saved=${result.savedRecords}  ` +
    `uploaded=${result.uploaded}  matched=${result.matched}  errors=${result.errors.length}`,
  );
});

bulkImportWorker.on('failed', async (job, err) => {
  if (!job) return;
  const isFinalAttempt = (job.attemptsMade ?? 0) >= (job.opts?.attempts ?? 1);
  log.error(
    `Job failed — id=${job.id}  attempt=${job.attemptsMade}  final=${isFinalAttempt}  error=${err.message}`,
  );

  // Clean up temp files only after the final failed attempt so that temp
  // files are available for retry attempts (avoids re-upload on transient SFTP errors).
  if (isFinalAttempt && job.data.importId) {
    const importDir = path.join(os.tmpdir(), 'bulk-imports', job.data.importId);
    log.info(`Cleaning up temp files after final failure: ${importDir}`);
    await cleanupDir(importDir);
  }
});

bulkImportWorker.on('error', (err) => {
  log.error(`Worker error: ${err.message}`);
});

bulkImportWorker.on('stalled', (jobId) => {
  log.warn(`Job stalled — id=${jobId} (will be retried)`);
});

// ─── Queue Events (lightweight monitoring / logging) ─────────────────────────
export const bulkImportQueueEvents = new QueueEvents(BULK_IMPORT_QUEUE, {
  connection: redisConnectionOptions,
});

bulkImportQueueEvents.on('progress', ({ jobId, data }) => {
  log.debug(`Progress — id=${jobId}  progress=${data}%`);
});

bulkImportQueueEvents.on('error', (err) => {
  log.error(`QueueEvents error: ${err.message}`);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal: string): Promise<void> {
  log.info(`Received ${signal} — closing worker gracefully…`);
  try {
    await bulkImportWorker.close();
    await bulkImportQueueEvents.close();
    log.info('Worker shutdown complete');
    process.exit(0);
  } catch (err) {
    log.error(`Error during shutdown: ${(err as Error).message}`);
    process.exit(1);
  }
}

process.once('SIGINT',  () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

log.info(`BulkImport worker started — concurrency=${CONCURRENCY} queue=${BULK_IMPORT_QUEUE}`);
