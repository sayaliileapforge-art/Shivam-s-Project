/**
 * Imports Router
 *
 *   POST /api/imports                  — enqueue a CSV + ZIP bulk import job
 *   GET  /api/imports/:jobId/status    — poll job state and progress
 */

import { Router } from 'express';
import { createImportJob, getImportStatus } from '../controllers/importsController';

const router = Router();

/**
 * POST /api/imports
 *
 * Accepts multipart/form-data with:
 *   - csv       (file)   CSV file with record data
 *   - zip       (file)   ZIP archive containing matching images
 *   - projectId (string) MongoDB project ID
 *   - category  (string) data category, default "student"
 *   - mapping   (string) JSON-encoded { csvHeader: variableName } map (optional)
 *
 * Returns immediately with:
 *   { success, jobId, status: "queued", message }
 *
 * The actual processing happens in the background BullMQ worker.
 */
router.post('/', createImportJob);

/**
 * GET /api/imports/:jobId/status
 *
 * Returns:
 *   { success, jobId, state, progress, createdAt, processedAt, finishedAt,
 *     result? (on completed), failedReason? (on failed) }
 */
router.get('/:jobId/status', getImportStatus);

export default router;
