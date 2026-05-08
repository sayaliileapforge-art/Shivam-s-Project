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

const REDIS_HOST     = process.env.REDIS_HOST?.trim()     ?? '127.0.0.1';
const REDIS_PORT     = parseInt(process.env.REDIS_PORT    ?? '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD?.trim() || undefined;

export const redisConnectionOptions: RedisOptions = {
  host:                 REDIS_HOST,
  port:                 REDIS_PORT,
  ...(REDIS_PASSWORD ? { password: REDIS_PASSWORD } : {}),
  // Both settings are required by BullMQ — do not remove them.
  maxRetriesPerRequest: null,
  enableReadyCheck:     false,
  // Reconnect after brief delays rather than failing permanently.
  retryStrategy: (times: number) => Math.min(times * 500, 10_000),
};

export const redisInfo = `${REDIS_HOST}:${REDIS_PORT}`;
