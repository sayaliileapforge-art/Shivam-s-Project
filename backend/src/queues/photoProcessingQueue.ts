import { Queue } from 'bullmq';
import { redisConnectionOptions, REDIS_ENABLED } from '../redis/connection';

export const PHOTO_PROCESSING_QUEUE = 'photo-processing-queue';

export interface PhotoProcessingJobData {
  studentPhotoId: string;
  originalPhotoUrl: string;
  clientId: string;
  studentName?: string;
}

export const photoProcessingQueue: Queue<PhotoProcessingJobData> | null = REDIS_ENABLED
  ? (() => {
      const q = new Queue<PhotoProcessingJobData>(PHOTO_PROCESSING_QUEUE, {
        connection: redisConnectionOptions,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 3_000 },
          removeOnComplete: { count: 200, age: 7 * 24 * 3_600 },
          removeOnFail:     { count: 100, age: 30 * 24 * 3_600 },
        },
      });
      q.on('error', (err) => {
        console.error(`[Queue:${PHOTO_PROCESSING_QUEUE}] ${err.message}`);
      });
      return q;
    })()
  : null;

if (!REDIS_ENABLED) {
  console.warn('[PhotoQueue] Redis not configured — photo processing queue disabled. Processing will run synchronously.');
}
