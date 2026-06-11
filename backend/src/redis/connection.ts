/**
 * Shared IORedis connection options for BullMQ.
 *
 * Why a shared config object instead of a shared IORedis instance?
 * BullMQ internally creates its own IORedis connections per Queue and Worker.
 * Passing a plain options object (rather than an IORedis instance) lets BullMQ
 * manage connection lifecycles independently — avoiding issues where a single
 * shared connection is blocked while a Worker is processing jobs.
 *
 * Required settings for BullMQ:
 *   maxRetriesPerRequest: null  — disables IORedis's built-in per-request
 *     retry loop; BullMQ manages its own retry/backoff logic.
 *   enableReadyCheck: false     — prevents IORedis from emitting "ready" errors
 *     during BullMQ's own reconnection handling.
 *
 * Environment variables:
 *   REDIS_HOST      (default: 127.0.0.1)
 *   REDIS_PORT      (default: 6379)
 *   REDIS_PASSWORD  (optional)
 */

import type { RedisOptions } from 'ioredis';

const REDIS_HOST     = process.env.REDIS_HOST?.trim()     ?? '';
const REDIS_PORT     = parseInt(process.env.REDIS_PORT    ?? '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD?.trim() || undefined;

/**
 * True only when REDIS_HOST is explicitly set in the environment.
 * When false (e.g. Render free tier with no Redis service attached) all
 * BullMQ queues, workers and Bull Board are skipped entirely so that the
 * server does not flood logs with ECONNREFUSED errors.
 */
export const REDIS_ENABLED = Boolean(REDIS_HOST);

const resolvedHost = REDIS_HOST || '127.0.0.1';

export const redisConnectionOptions: RedisOptions = {
  host:                 resolvedHost,
  port:                 REDIS_PORT,
  ...(REDIS_PASSWORD ? { password: REDIS_PASSWORD } : {}),
  // Both settings are required by BullMQ — do not remove them.
  maxRetriesPerRequest: null,
  enableReadyCheck:     false,
  // When Redis is explicitly configured, reconnect with exponential backoff.
  // When not configured, return null immediately to stop all reconnection attempts.
  retryStrategy: REDIS_ENABLED
    ? (times: number) => Math.min(times * 500, 10_000)
    : () => null,
};

export const redisInfo = `${resolvedHost}:${REDIS_PORT}`;

/**
 * One-off connectivity check for BullMQ's Redis backend.
 * Logs success/failure so connection problems surface immediately at startup
 * instead of manifesting later as silently-stalled queue jobs.
 */
export async function checkRedisConnection(): Promise<void> {
  if (!REDIS_ENABLED) return;
  const { Redis: IORedis } = await import('ioredis');
  const client = new IORedis({
    ...redisConnectionOptions,
    lazyConnect: true,
    retryStrategy: () => null,
  });
  try {
    await client.connect();
    await client.ping();
    console.log(`[Redis] Connected to ${redisInfo} — BullMQ queues/workers active`);
  } catch (err) {
    console.error(`[Redis] Connection check failed for ${redisInfo}: ${(err as Error).message}`);
  } finally {
    client.disconnect();
  }
}
