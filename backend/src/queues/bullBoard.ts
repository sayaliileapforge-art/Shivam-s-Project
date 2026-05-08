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

import { createBullBoard }       from '@bull-board/api';
import { BullMQAdapter }         from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter }        from '@bull-board/express';
import { bulkImportQueue }       from '../queues/bulkImportQueue';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(bulkImportQueue),
  ],
  serverAdapter,
});

/**
 * Express Router for the Bull Board UI.
 *
 * Mount BEFORE the API 404 handler in server.ts:
 *   app.use('/admin/queues', bullBoardRouter);
 */
export const bullBoardRouter = serverAdapter.getRouter();
