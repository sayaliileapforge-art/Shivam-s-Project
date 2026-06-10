import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import StudentPhoto from '../models/StudentPhoto';
import { photoProcessingQueue } from '../queues/photoProcessingQueue';
import { processStudentPhoto, deletePhotoFile } from '../services/photoProcessingService';
import { REDIS_ENABLED } from '../redis/connection';
import { createLogger } from '../utils/logger';

// Max jobs to enqueue in a single bulkAdd call (prevents Redis pipeline overflow)
const BULK_ENQUEUE_CHUNK = 50;

const log = createLogger('StudentPhotosRoute');
const router = Router();

const backendRootDir = path.resolve(__dirname, '../..');
const uploadsDir = process.env.UPLOADS_DIR?.trim()
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(backendRootDir, 'public', 'uploads');
const photosDir = path.join(uploadsDir, 'student-photos');
if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });

const backendLocalUrl = (
  process.env.BACKEND_URL?.trim() ?? `http://localhost:${process.env.PORT ?? '5000'}`
).replace(/\/$/, '');

// ── Multer ─────────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, photosDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const base = path.basename(file.originalname, ext)
      .trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80);
    const unique = `${Date.now()}_${base}${ext}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|bmp)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, WEBP, or BMP images are allowed'));
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function validateObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

/** Enqueue or fall back to synchronous processing when Redis is not available */
async function enqueueOrProcess(studentPhotoId: string, originalUrl: string, clientId: string, studentName = '') {
  if (REDIS_ENABLED && photoProcessingQueue) {
    const job = await photoProcessingQueue.add('process-photo', {
      studentPhotoId,
      originalPhotoUrl: originalUrl,
      clientId,
      studentName,
    });
    await StudentPhoto.findByIdAndUpdate(studentPhotoId, {
      processingStatus: 'queued',
      processingJobId: job.id,
    });
    log.info(`Enqueued photo processing job=${job.id} studentPhotoId=${studentPhotoId}`);
  } else {
    log.warn(`Redis unavailable — processing photo synchronously for studentPhotoId=${studentPhotoId}`);
    setImmediate(async () => {
      try {
        await StudentPhoto.findByIdAndUpdate(studentPhotoId, {
          processingStatus: 'processing',
          processingStartedAt: new Date(),
        });
        const { processedUrl } = await processStudentPhoto(originalUrl, studentPhotoId, studentName);
        const doc = await StudentPhoto.findById(studentPhotoId);
        if (!doc) return;
        const nextVersion = doc.history.length + 1;
        doc.processedPhoto = processedUrl;
        doc.primaryPhoto   = processedUrl;
        doc.isProcessed    = true;
        doc.isRestored     = false;
        doc.processingStatus = 'completed';
        doc.processingCompletedAt = new Date();
        doc.history.push({ version: nextVersion, url: processedUrl, type: 'processed', createdAt: new Date(), note: 'Processed synchronously' });
        await doc.save();
        log.info(`Synchronous processing complete for studentPhotoId=${studentPhotoId}`);
      } catch (err) {
        await StudentPhoto.findByIdAndUpdate(studentPhotoId, {
          processingStatus: 'failed',
          processingError: (err as Error).message,
        }).catch(() => {});
        log.error(`Synchronous processing failed for studentPhotoId=${studentPhotoId}: ${(err as Error).message}`);
      }
    });
  }
}

/**
 * Bulk-enqueue up to 500 photos in one pass.
 * Uses BullMQ addBulk (single Redis pipeline) + a single bulkWrite to set all
 * statuses to 'queued' — 300 photos go from ~300 round-trips to 2.
 */
async function enqueueBulk(
  items: Array<{ studentPhotoId: string; originalUrl: string; clientId: string; studentName?: string }>
) {
  if (!REDIS_ENABLED || !photoProcessingQueue) {
    // No Redis: fire all jobs concurrently via setImmediate (capped at BULK_ENQUEUE_CHUNK)
    for (const item of items) {
      await enqueueOrProcess(item.studentPhotoId, item.originalUrl, item.clientId, item.studentName ?? '');
    }
    return;
  }

  const allJobs: Array<{ id: string; studentPhotoId: string }> = [];

  // Split into chunks to avoid oversized Redis pipelines
  for (let i = 0; i < items.length; i += BULK_ENQUEUE_CHUNK) {
    const chunk = items.slice(i, i + BULK_ENQUEUE_CHUNK);
    const added = await photoProcessingQueue.addBulk(
      chunk.map(item => ({
        name: 'process-photo',
        data: {
          studentPhotoId: item.studentPhotoId,
          originalPhotoUrl: item.originalUrl,
          clientId: item.clientId,
          studentName: item.studentName ?? '',
        },
      }))
    );
    for (let j = 0; j < chunk.length; j++) {
      if (added[j]?.id) allJobs.push({ id: added[j].id!, studentPhotoId: chunk[j].studentPhotoId });
    }
  }

  // One bulkWrite to mark all as queued
  if (allJobs.length > 0) {
    await StudentPhoto.bulkWrite(
      allJobs.map(({ id, studentPhotoId }) => ({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(studentPhotoId) },
          update: { $set: { processingStatus: 'queued', processingJobId: id } },
        },
      }))
    );
    log.info(`Bulk-enqueued ${allJobs.length} photo processing jobs`);
  }
}

// ── POST /api/student-photos/upload-bulk ─────────────────────────────────────
// Bulk-upload up to 300 photos in one multipart request.
// Each file gets its own StudentPhoto doc; all jobs are batch-enqueued (2 DB round-trips total).
router.post('/upload-bulk', upload.array('photos', 300), async (req: Request, res: Response): Promise<void> => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files?.length) { res.status(400).json({ success: false, error: 'No photos uploaded' }); return; }

    const { clientId } = req.body;
    if (!clientId || !validateObjectId(clientId)) {
      files.forEach(f => fs.existsSync(f.path) && fs.unlinkSync(f.path));
      res.status(400).json({ success: false, error: 'Valid clientId is required' }); return;
    }

    // Parse per-file metadata arrays (optional)
    let studentNames: string[] = [];
    let dataRecordIds: string[] = [];
    try { studentNames = JSON.parse(req.body.studentNames ?? '[]'); } catch { /* ignore */ }
    try { dataRecordIds = JSON.parse(req.body.dataRecordIds ?? '[]'); } catch { /* ignore */ }

    const now = new Date();
    const insertDocs = files.map((file, i) => ({
      clientId: new mongoose.Types.ObjectId(clientId),
      dataRecordId: dataRecordIds[i] && validateObjectId(dataRecordIds[i])
        ? new mongoose.Types.ObjectId(dataRecordIds[i]) : undefined,
      studentName: studentNames[i]?.trim() || undefined,
      originalPhoto: `/uploads/student-photos/${file.filename}`,
      primaryPhoto:  `/uploads/student-photos/${file.filename}`,
      processingStatus: 'pending' as const,
      isProcessed: false,
      isRestored: false,
      history: [{ version: 1, url: `/uploads/student-photos/${file.filename}`, type: 'original' as const, createdAt: now, note: 'Uploaded by user' }],
      createdAt: now, updatedAt: now,
    }));

    // Single insertMany — one DB round-trip for all docs
    const inserted = await StudentPhoto.insertMany(insertDocs, { ordered: false });

    // Bulk-enqueue all jobs (2 more DB round-trips regardless of count)
    await enqueueBulk(
      inserted.map((doc, i) => ({
        studentPhotoId: String(doc._id),
        originalUrl: `/uploads/student-photos/${files[i].filename}`,
        clientId,
        studentName: studentNames[i]?.trim() ?? '',
      }))
    );

    log.info(`Bulk upload: ${inserted.length} photos created for clientId=${clientId}`);
    res.status(201).json({ success: true, count: inserted.length, data: inserted });
  } catch (err) {
    log.error(`Bulk upload error: ${(err as Error).message}`);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// ── POST /api/student-photos/upload ──────────────────────────────────────────
// Upload a new student photo. Saves as original + primary, then enqueues processing.
router.post('/upload', upload.single('photo'), async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file;
    if (!file) { res.status(400).json({ success: false, error: 'No photo file uploaded' }); return; }

    const { clientId, dataRecordId, studentName } = req.body;
    if (!clientId || !validateObjectId(clientId)) {
      fs.existsSync(file.path) && fs.unlinkSync(file.path);
      res.status(400).json({ success: false, error: 'Valid clientId is required' });
      return;
    }

    const originalUrl = `/uploads/student-photos/${file.filename}`;

    const doc = await StudentPhoto.create({
      clientId: new mongoose.Types.ObjectId(clientId),
      dataRecordId: dataRecordId && validateObjectId(dataRecordId)
        ? new mongoose.Types.ObjectId(dataRecordId) : undefined,
      studentName: studentName?.trim() || undefined,
      originalPhoto: originalUrl,
      primaryPhoto:  originalUrl,
      processingStatus: 'pending',
      isProcessed: false,
      isRestored:  false,
      history: [{
        version: 1,
        url: originalUrl,
        type: 'original',
        createdAt: new Date(),
        note: 'Uploaded by user',
      }],
    });

    const sName = studentName?.trim() ?? '';
    await enqueueOrProcess(String(doc._id), originalUrl, clientId, sName);

    log.info(`New student photo created id=${doc._id} clientId=${clientId}`);
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    log.error(`Upload error: ${(err as Error).message}`);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// ── GET /api/student-photos/:id ───────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!validateObjectId(req.params.id)) { res.status(400).json({ success: false, error: 'Invalid id' }); return; }
    const doc = await StudentPhoto.findById(req.params.id);
    if (!doc) { res.status(404).json({ success: false, error: 'Not found' }); return; }
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// ── GET /api/student-photos/client/:clientId ──────────────────────────────────
router.get('/client/:clientId', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!validateObjectId(req.params.clientId)) { res.status(400).json({ success: false, error: 'Invalid clientId' }); return; }
    const docs = await StudentPhoto.find({ clientId: req.params.clientId }).sort({ createdAt: -1 });
    res.json({ success: true, data: docs });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// ── GET /api/student-photos/:id/status ────────────────────────────────────────
router.get('/:id/status', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!validateObjectId(req.params.id)) { res.status(400).json({ success: false, error: 'Invalid id' }); return; }
    const doc = await StudentPhoto.findById(req.params.id).select(
      'processingStatus processingError processingJobId processingStartedAt processingCompletedAt primaryPhoto isProcessed isRestored'
    );
    if (!doc) { res.status(404).json({ success: false, error: 'Not found' }); return; }

    // If queued/processing and Redis available, also check job progress
    let jobProgress: number | null = null;
    if (doc.processingJobId && REDIS_ENABLED && photoProcessingQueue) {
      try {
        const job = await photoProcessingQueue.getJob(doc.processingJobId);
        jobProgress = job ? ((await job.progress) as number) ?? null : null;
      } catch { /* non-fatal */ }
    }

    res.json({ success: true, data: { ...doc.toObject(), jobProgress } });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// ── GET /api/student-photos/:id/original ─────────────────────────────────────
router.get('/:id/original', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!validateObjectId(req.params.id)) { res.status(400).json({ success: false, error: 'Invalid id' }); return; }
    const doc = await StudentPhoto.findById(req.params.id).select('originalPhoto');
    if (!doc) { res.status(404).json({ success: false, error: 'Not found' }); return; }
    res.json({ success: true, data: { url: doc.originalPhoto } });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// ── GET /api/student-photos/:id/processed ────────────────────────────────────
router.get('/:id/processed', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!validateObjectId(req.params.id)) { res.status(400).json({ success: false, error: 'Invalid id' }); return; }
    const doc = await StudentPhoto.findById(req.params.id).select('processedPhoto isProcessed');
    if (!doc) { res.status(404).json({ success: false, error: 'Not found' }); return; }
    res.json({ success: true, data: { url: doc.processedPhoto ?? null, isProcessed: doc.isProcessed } });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// ── POST /api/student-photos/:id/restore ─────────────────────────────────────
// Restore: deactivate processed photo, make original the primary again.
router.post('/:id/restore', async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  try {
    if (!validateObjectId(req.params.id)) { res.status(400).json({ success: false, error: 'Invalid id' }); return; }

    let updatedDoc: any;

    await session.withTransaction(async () => {
      const doc = await StudentPhoto.findById(req.params.id).session(session);
      if (!doc) throw new Error('Student photo not found');
      if (!doc.isProcessed && !doc.processedPhoto) throw new Error('No processed photo to restore from');

      const nextVersion = doc.history.length + 1;

      doc.primaryPhoto     = doc.originalPhoto;
      doc.isProcessed      = false;
      doc.isRestored       = true;
      doc.processingStatus = 'restored';
      doc.history.push({
        version: nextVersion,
        url: doc.originalPhoto,
        type: 'original',
        createdAt: new Date(),
        note: 'Restored to original by user',
      });

      await doc.save({ session });
      updatedDoc = doc.toObject();

      log.info(`Restored student photo id=${req.params.id} primaryPhoto=${doc.originalPhoto}`);
    });

    res.json({ success: true, data: updatedDoc });
  } catch (err) {
    log.error(`Restore error: ${(err as Error).message}`);
    res.status(500).json({ success: false, error: (err as Error).message });
  } finally {
    await session.endSession();
  }
});

// ── POST /api/student-photos/:id/reprocess ───────────────────────────────────
// Re-trigger processing (e.g. after a failed job).
router.post('/:id/reprocess', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!validateObjectId(req.params.id)) { res.status(400).json({ success: false, error: 'Invalid id' }); return; }
    const doc = await StudentPhoto.findById(req.params.id);
    if (!doc) { res.status(404).json({ success: false, error: 'Not found' }); return; }

    // Delete stale processed photo file if it exists
    if (doc.processedPhoto) await deletePhotoFile(doc.processedPhoto);

    await StudentPhoto.findByIdAndUpdate(req.params.id, {
      processedPhoto: undefined,
      processingStatus: 'pending',
      processingError: undefined,
      processingJobId: undefined,
    });

    await enqueueOrProcess(req.params.id, doc.originalPhoto, String(doc.clientId));
    res.json({ success: true, message: 'Reprocessing enqueued' });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// ── DELETE /api/student-photos/:id ───────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!validateObjectId(req.params.id)) { res.status(400).json({ success: false, error: 'Invalid id' }); return; }
    const doc = await StudentPhoto.findByIdAndDelete(req.params.id);
    if (!doc) { res.status(404).json({ success: false, error: 'Not found' }); return; }

    // Clean up files (non-fatal)
    if (doc.originalPhoto)  await deletePhotoFile(doc.originalPhoto);
    if (doc.processedPhoto) await deletePhotoFile(doc.processedPhoto);

    res.json({ success: true, message: 'Student photo deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;
