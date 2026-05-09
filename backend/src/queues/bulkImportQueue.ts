/**
 * BullMQ Queue definition for bulk CSV + ZIP import processing.
 *
 * Why BullMQ?
 * -----------
 * Processing large CSV files and ZIP archives containing thousands of photos
 * can take minutes — far beyond the ~30 s timeout enforced by most load
 * balancers and HTTP clients.  BullMQ offloads the work to a background worker:
 *
 *   1. The API handler saves the uploaded files to a temp directory and
 *      immediately enqueues a job, returning a jobId to the client.
 *   2. A Worker process picks up the job from Redis and processes it
 *      asynchronously (validate CSV → extract ZIP → match → upload → save DB).
 *   3. The client polls GET /api/imports/:jobId/status to track progress.
 *
 * Job lifecycle:
 *   waiting → active → completed | failed
 *
 * Retry logic (exponential backoff):
 *   Attempt 1 — immediately
 *   Attempt 2 — after  2 s
 *   Attempt 3 — after  4 s
 *   After 3 failures the job moves to the "failed" state for inspection.
 *
 * Retention:
 *   Completed jobs: keep the last 100 or jobs from the past 7 days.
 *   Failed jobs:    keep the last  50 or jobs from the past 30 days.
 *   This prevents unbounded Redis memory growth while preserving enough
 *   history for debugging and audit.
 */

import { Queue } from 'bullmq';
import { redisConnectionOptions, REDIS_ENABLED } from '../redis/connection';
import type { BulkImportJobData } from '../processors/bulkImportProcessor';

/** The canonical queue name.  Import this constant wherever you reference the
 *  queue to avoid silent misspellings. */
export const BULK_IMPORT_QUEUE = 'bulk-import-queue';

/**
 * The BullMQ Queue instance, or null when Redis is not configured.
 * Always check for null before calling .add() in API routes.
 */
export const bulkImportQueue: Queue<BulkImportJobData> | null = REDIS_ENABLED
  ? (() => {
      const q = new Queue<BulkImportJobData>(BULK_IMPORT_QUEUE, {
        connection: redisConnectionOptions,
        defaultJobOptions: {
          // ── Retry with exponential backoff ──────────────────────────────────
          attempts: 3,
          backoff: {
            type:  'exponential',
            delay: 2_000, // 2 s, 4 s, 8 s
          },
          // ── Job retention (avoid unbounded Redis growth) ─────────────────────
          removeOnComplete: { count: 100, age: 7 * 24 * 3_600 },
          removeOnFail:     { count:  50, age: 30 * 24 * 3_600 },
        },
      });
      // Log queue-level errors (e.g. Redis disconnects) so they are visible in
      // server logs without crashing the process.
      q.on('error', (err) => {
        console.error(`[Queue:${BULK_IMPORT_QUEUE}] Error: ${err.message}`);
      });
      return q;
    })()
  : null;

if (!REDIS_ENABLED) {
  console.warn('[Queue] Redis not configured (REDIS_HOST not set) — BullMQ queue disabled. Bulk import jobs will not be processed.');
}
