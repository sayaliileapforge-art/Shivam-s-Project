import { Worker, QueueEvents } from 'bullmq';
import mongoose from 'mongoose';
import { redisConnectionOptions, REDIS_ENABLED } from '../redis/connection';
import { PHOTO_PROCESSING_QUEUE, PhotoProcessingJobData } from '../queues/photoProcessingQueue';
import { processStudentPhoto } from '../services/photoProcessingService';
import StudentPhoto from '../models/StudentPhoto';
import { createLogger } from '../utils/logger';

const log = createLogger('PhotoProcessingWorker');

export let photoWorker: Worker | null = null;
export let photoQueueEvents: QueueEvents | null = null;

// ─── Throughput tracking ───────────────────────────────────────────────────
// Each job calls the AI service's batch-async endpoint (which has its own
// shared CPU thread pool, ~4-12 workers). Logged periodically so worker
// throughput vs. AI-service capacity is visible when batches stall.
let completedSinceLastLog = 0;
let failedSinceLastLog = 0;
let lastThroughputLog = Date.now();
const THROUGHPUT_LOG_INTERVAL_MS = 30_000;

function maybeLogThroughput(log: ReturnType<typeof createLogger>) {
  const now = Date.now();
  if (now - lastThroughputLog < THROUGHPUT_LOG_INTERVAL_MS) return;
  const elapsedSec = (now - lastThroughputLog) / 1000;
  const rate = (completedSinceLastLog / elapsedSec).toFixed(2);
  log.info(
    `Throughput: ${completedSinceLastLog} completed, ${failedSinceLastLog} failed ` +
    `in ${elapsedSec.toFixed(0)}s (${rate}/s)`,
  );
  completedSinceLastLog = 0;
  failedSinceLastLog = 0;
  lastThroughputLog = now;
}

if (!REDIS_ENABLED) {
  log.warn('Redis not configured — photo processing worker disabled.');
} else {

photoWorker = new Worker<PhotoProcessingJobData>(
  PHOTO_PROCESSING_QUEUE,
  async (job) => {
    const { studentPhotoId, originalPhotoUrl, studentName } = job.data;
    log.info(`Starting photo processing job=${job.id} studentPhotoId=${studentPhotoId} attempt=${job.attemptsMade + 1}`);

    // Mark as processing
    await StudentPhoto.findByIdAndUpdate(studentPhotoId, {
      processingStatus: 'processing',
      processingStartedAt: new Date(),
      processingError: undefined,
    });

    await job.updateProgress(10);
    log.info(`Progress 10% job=${job.id} studentPhotoId=${studentPhotoId} (marked processing)`);

    const { processedUrl } = await processStudentPhoto(originalPhotoUrl, studentPhotoId, studentName ?? '');

    await job.updateProgress(90);
    log.info(`Progress 90% job=${job.id} studentPhotoId=${studentPhotoId} (AI processing done)`);

    // Persist results — fetch current doc for version history
    const doc = await StudentPhoto.findById(studentPhotoId);
    if (!doc) throw new Error(`StudentPhoto ${studentPhotoId} not found`);

    const nextVersion = doc.history.length + 1;

    doc.processedPhoto = processedUrl;
    doc.primaryPhoto   = processedUrl;
    doc.isProcessed    = true;
    doc.isRestored     = false;
    doc.processingStatus = 'completed';
    doc.processingCompletedAt = new Date();
    doc.processingError = undefined;
    doc.history.push({
      version: nextVersion,
      url: processedUrl,
      type: 'processed',
      createdAt: new Date(),
      note: `Processed by worker job ${job.id}`,
    });

    await doc.save();

    await job.updateProgress(100);
    log.info(`Photo processing complete job=${job.id} studentPhotoId=${studentPhotoId} url=${processedUrl}`);
    return { processedUrl };
  },
  {
    connection: redisConnectionOptions,
    // Each job hands off to the AI service's batch-async endpoint, which has
    // its own shared CPU thread pool (~4-12 workers, see _N_WORKERS in
    // image_processing.py). A high concurrency here oversubscribes that pool
    // — especially when a large interactive batch (AI Photo Studio "Batch")
    // is also running — and is what causes large batches to crawl/stall.
    concurrency: parseInt(process.env.PHOTO_WORKER_CONCURRENCY ?? '3', 10),
    lockDuration: 10 * 60 * 1_000,
    lockRenewTime: 4 * 60 * 1_000,
  }
);

photoWorker.on('completed', (job) => {
  completedSinceLastLog += 1;
  maybeLogThroughput(log);
  void job; // id already logged at "Photo processing complete" above
});

photoWorker.on('failed', async (job, err) => {
  if (!job) return;
  const isFinal = (job.attemptsMade ?? 0) >= (job.opts?.attempts ?? 1);
  log.error(
    `Photo processing failed job=${job.id} studentPhotoId=${job.data.studentPhotoId} ` +
    `attempt=${job.attemptsMade} final=${isFinal} error=${err.message}`,
  );
  if (isFinal) {
    failedSinceLastLog += 1;
    maybeLogThroughput(log);
  }
  // Failure is isolated to this job — other jobs in the batch continue processing.
  if (isFinal) {
    await StudentPhoto.findByIdAndUpdate(job.data.studentPhotoId, {
      processingStatus: 'failed',
      processingError: err.message,
    }).catch(() => {});
  }
});

photoWorker.on('stalled', (jobId) => {
  log.warn(`Photo processing job stalled — id=${jobId} (will be retried)`);
});

photoWorker.on('error', (err) => log.error(`Worker error: ${err.message}`));

photoQueueEvents = new QueueEvents(PHOTO_PROCESSING_QUEUE, { connection: redisConnectionOptions });
photoQueueEvents.on('error', (err) => log.error(`QueueEvents error: ${err.message}`));

async function shutdown(signal: string) {
  log.info(`${signal} — closing photo worker`);
  await photoWorker?.close().catch(() => {});
  await photoQueueEvents?.close().catch(() => {});
  process.exit(0);
}
process.once('SIGINT',  () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

log.info(`Photo processing worker started — queue=${PHOTO_PROCESSING_QUEUE}`);

} // end REDIS_ENABLED guard
