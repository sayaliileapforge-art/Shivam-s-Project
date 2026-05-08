/**
 * Imports Controller
 *
 * Handles the two import-related HTTP endpoints:
 *
 *   POST /api/imports         — accept CSV + ZIP, save to temp dir, enqueue job
 *   GET  /api/imports/:jobId/status — return job state, progress, result, error
 *
 * Why the controller is separate from the route file:
 * ---------------------------------------------------
 * Keeping HTTP handling (parsing, validation, response shaping) out of the
 * route definitions makes the code easier to test and keeps route files slim.
 */

import { Request, Response } from 'express';
import multer                 from 'multer';
import path                   from 'path';
import os                     from 'os';
import fs                     from 'fs';
import { v4 as uuidv4 }       from 'uuid';
import { bulkImportQueue }    from '../queues/bulkImportQueue';
import type { BulkImportJobData } from '../processors/bulkImportProcessor';
import { createLogger }       from '../utils/logger';

const log = createLogger('ImportsController');

// ─── Multer — disk storage (not memory) ──────────────────────────────────────
// We save directly to a per-import temp directory.  Disk storage avoids
// buffering large ZIPs in memory before the job even starts.
function buildTempStorage(importId: string) {
  const tempDir = path.join(os.tmpdir(), 'bulk-imports', importId);
  fs.mkdirSync(tempDir, { recursive: true });

  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tempDir),
    filename:    (_req, file, cb) => {
      // Preserve original extension so downstream services can detect the type.
      const ext  = path.extname(file.originalname).toLowerCase();
      const safe = file.fieldname === 'csv' ? `import${ext || '.csv'}` : `archive${ext || '.zip'}`;
      cb(null, safe);
    },
  });
}

const acceptedCsvMimes  = new Set(['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel']);
const acceptedZipMimes  = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/x-zip',
  'application/octet-stream',
]);

// ─── POST /api/imports ────────────────────────────────────────────────────────

export async function createImportJob(req: Request, res: Response): Promise<void> {
  const importId = uuidv4();
  const upload   = multer({
    storage: buildTempStorage(importId),
    limits:  { fileSize: 600 * 1024 * 1024 }, // 600 MB per file
    fileFilter: (_req, file, cb) => {
      if (file.fieldname === 'csv') {
        if (acceptedCsvMimes.has(file.mimetype) || /\.csv$/i.test(file.originalname)) {
          cb(null, true);
        } else {
          cb(new Error('Field "csv" must be a CSV file'));
        }
      } else if (file.fieldname === 'zip') {
        if (acceptedZipMimes.has(file.mimetype) || /\.zip$/i.test(file.originalname)) {
          cb(null, true);
        } else {
          cb(new Error('Field "zip" must be a ZIP file'));
        }
      } else {
        cb(new Error(`Unexpected field: ${file.fieldname}`));
      }
    },
  });

  // Parse the multipart form — fields: csv, zip, projectId, category, mapping
  try {
    await new Promise<void>((resolve, reject) => {
      upload.fields([
        { name: 'csv', maxCount: 1 },
        { name: 'zip', maxCount: 1 },
      ])(req, res, (err) => { if (err) reject(err); else resolve(); });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`Multer error: ${msg}`);
    res.status(400).json({ success: false, error: `File upload error: ${msg}` });
    return;
  }

  const files = req.files as Record<string, Express.Multer.File[]> | undefined;

  if (!files?.csv?.[0]) {
    res.status(400).json({ success: false, error: 'Missing required field: csv' });
    return;
  }
  if (!files?.zip?.[0]) {
    res.status(400).json({ success: false, error: 'Missing required field: zip' });
    return;
  }

  const csvFile = files.csv[0];
  const zipFile = files.zip[0];

  // ── Body params ───────────────────────────────────────────────────────────
  const projectId = String(req.body.projectId ?? '').trim();
  const category  = String(req.body.category  ?? 'student').trim();

  // mapping is a JSON-encoded object: '{ "Student Name": "Name", … }'
  let mapping: Record<string, string> = {};
  const rawMapping = req.body.mapping as string | undefined;
  if (rawMapping) {
    try {
      mapping = JSON.parse(rawMapping);
    } catch {
      res.status(400).json({ success: false, error: 'Field "mapping" must be valid JSON' });
      return;
    }
  }

  if (!projectId) {
    res.status(400).json({ success: false, error: 'Missing required field: projectId' });
    return;
  }

  // ── Enqueue job ───────────────────────────────────────────────────────────
  const jobData: BulkImportJobData = {
    userId:          (req as Request & { user?: { id: string } }).user?.id,
    csvFilePath:     csvFile.path,
    zipFilePath:     zipFile.path,
    projectId,
    category,
    mapping,
    importId,
    originalCsvName: csvFile.originalname,
    originalZipName: zipFile.originalname,
  };

  const job = await bulkImportQueue.add('bulk-import', jobData, {
    // Job ID is the importId so clients can predict the ID without querying.
    jobId: importId,
  });

  log.info(
    `Job enqueued — id=${job.id} project=${projectId} ` +
    `csv=${csvFile.originalname} zip=${zipFile.originalname}`,
  );

  res.status(202).json({
    success: true,
    jobId:   job.id,
    status:  'queued',
    message: 'Import job queued. Poll /api/imports/:jobId/status for updates.',
  });
}

// ─── GET /api/imports/:jobId/status ───────────────────────────────────────────

export async function getImportStatus(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;

  const job = await bulkImportQueue.getJob(jobId);

  if (!job) {
    res.status(404).json({ success: false, error: `Job not found: ${jobId}` });
    return;
  }

  const state    = await job.getState();      // 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'
  const progress = job.progress;              // 0–100 or object

  const response: Record<string, unknown> = {
    success:     true,
    jobId:       job.id,
    state,
    progress,
    createdAt:   new Date(job.timestamp).toISOString(),
    processedAt: job.processedOn  ? new Date(job.processedOn).toISOString()  : null,
    finishedAt:  job.finishedOn   ? new Date(job.finishedOn).toISOString()   : null,
  };

  if (state === 'completed') {
    response.result = job.returnvalue;
  }

  if (state === 'failed') {
    response.failedReason = job.failedReason;
    response.attemptsMade = job.attemptsMade;
  }

  res.json(response);
}
