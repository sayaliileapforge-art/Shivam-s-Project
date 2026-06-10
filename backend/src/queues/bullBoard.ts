/**
 * Bull Board Dashboard Setup
 *
 * Bull Board provides a web UI for monitoring BullMQ queues at runtime.
 * It shows job counts, states, progress, return values and failure reasons.
 *
 * Access in development: http://localhost:5000/admin/queues
 *
 * Security:
 *   In production, protect this route with authentication middleware.
 *   This module exports the raw Express Router so server.ts can optionally
 *   wrap it in an auth guard before mounting.
 *
 * Setup:
 *   - @bull-board/api        core server-side adapter logic
 *   - @bull-board/api/bullMQAdapter  BullMQ-specific adapter (sub-path export)
 *   - @bull-board/express    Express middleware generator
 */

import { Router }              from 'express';
import { REDIS_ENABLED }       from '../redis/connection';
import { bulkImportQueue }     from '../queues/bulkImportQueue';
import { photoProcessingQueue } from '../queues/photoProcessingQueue';

let bullBoardRouter: Router;

if (REDIS_ENABLED && bulkImportQueue) {
  // Redis is available — set up the full Bull Board UI.
  const { createBullBoard }  = require('@bull-board/api');
  const { BullMQAdapter }    = require('@bull-board/api/bullMQAdapter');
  const { ExpressAdapter }   = require('@bull-board/express');

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [
      new BullMQAdapter(bulkImportQueue),
      ...(photoProcessingQueue ? [new BullMQAdapter(photoProcessingQueue)] : []),
    ],
    serverAdapter,
  });

  bullBoardRouter = serverAdapter.getRouter() as Router;
} else {
  // Redis not configured — return a minimal router that explains why the
  // dashboard is unavailable instead of crashing or spamming error logs.
  const r = Router();
  r.use((_req, res) => {
    res.status(503).json({ error: 'Queue dashboard unavailable: Redis is not configured.' });
  });
  bullBoardRouter = r;
}

export { bullBoardRouter };
