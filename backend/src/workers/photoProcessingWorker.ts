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

if (!REDIS_ENABLED) {
  log.warn('Redis not configured — photo processing worker disabled.');
} else {

photoWorker = new Worker<PhotoProcessingJobData>(
  PHOTO_PROCESSING_QUEUE,
  async (job) => {
    const { studentPhotoId, originalPhotoUrl, studentName } = job.data;
    log.info(`Starting photo processing job=${job.id} studentPhotoId=${studentPhotoId}`);

    // Mark as processing
    await StudentPhoto.findByIdAndUpdate(studentPhotoId, {
      processingStatus: 'processing',
      processingStartedAt: new Date(),
      processingError: undefined,
    });

    await job.updateProgress(10);

    const { processedUrl } = await processStudentPhoto(originalPhotoUrl, studentPhotoId, studentName ?? '');

    await job.updateProgress(90);

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
    concurrency: parseInt(process.env.PHOTO_WORKER_CONCURRENCY ?? '8', 10),
    lockDuration: 10 * 60 * 1_000,
    lockRenewTime: 4 * 60 * 1_000,
  }
);

photoWorker.on('failed', async (job, err) => {
  if (!job) return;
  log.error(`Photo processing failed job=${job.id} studentPhotoId=${job.data.studentPhotoId} error=${err.message}`);
  const isFinal = (job.attemptsMade ?? 0) >= (job.opts?.attempts ?? 1);
  if (isFinal) {
    await StudentPhoto.findByIdAndUpdate(job.data.studentPhotoId, {
      processingStatus: 'failed',
      processingError: err.message,
    }).catch(() => {});
  }
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
