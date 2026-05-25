import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import multer from 'multer';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import ProductTemplate from '../models/ProductTemplate';
import Product from '../models/Product';
import Project from '../models/Project';
import TemplateSelection from '../models/TemplateSelection';
import TemplateGalleryMeta from '../models/TemplateGalleryMeta';
import { emitRealtimeEvent } from '../realtime';

const router = Router();

function resolveUploadsDir(): string {
  const configured = process.env.UPLOADS_DIR?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.resolve(__dirname, '..', '..', 'uploads');
}

const uploadsDir = resolveUploadsDir();
// Template preview images go into a dedicated subdirectory.
const templatesUploadsDir = path.join(uploadsDir, 'templates');
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 5) || 5;
const maxUploadBytes = maxUploadMb * 1024 * 1024;

// SFTP config — mirrors imageUploadService.ts so uploads from local dev go straight to Hostinger.
const sftpHost   = process.env.SFTP_HOST?.trim()        ?? '';
const sftpPort   = parseInt(process.env.SFTP_PORT        ?? '22', 10);
const sftpUser   = process.env.SFTP_USERNAME?.trim()    ?? '';
const sftpPass   = process.env.SFTP_PASSWORD?.trim()    ?? '';
const remoteBase = (process.env.SFTP_REMOTE_DIR?.trim() ?? '/public_html/uploads').replace(/\/+$/, '');
const publicBase = (process.env.SFTP_PUBLIC_URL?.trim() ?? '').replace(/\/+$/, '');
const sftpEnabled = Boolean(sftpHost && sftpUser && sftpPass && publicBase);

for (const dir of [uploadsDir, templatesUploadsDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const allowedMimeTypes = new Set(['image/jpeg', 'image/png']);
const mimeToExt: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, templatesUploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = mimeToExt[file.mimetype]
      || path.extname(file.originalname).toLowerCase()
      || '.jpg';
    cb(null, `${Date.now()}-${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: maxUploadBytes },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      const error = new Error('Only JPG and PNG images are allowed.');
      (error as NodeJS.ErrnoException).code = 'INVALID_FILE_TYPE';
      cb(error);
      return;
    }
    cb(null, true);
  },
});

/**
 * Build the public URL for a template image.
 * Returns a host-independent relative path in local mode, or a full SFTP URL when SFTP is enabled.
 */
function buildPublicImageUrl(_req: Request, filename: string): string {
  const relativePath = `/uploads/templates/${filename}`;
  const base = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, '');
  if (base) return `${base}${relativePath}`;
  return relativePath;
}

/**
 * Upload a file from `localPath` to the remote SFTP server under uploads/templates/.
 * Returns the full public URL on the remote host.
 * Throws on failure — callers should catch and fall back.
 */
async function sftpUploadFile(localPath: string, filename: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SftpClient = require('ssh2-sftp-client');
  const sftp = new SftpClient();
  await sftp.connect({ host: sftpHost, port: sftpPort, username: sftpUser, password: sftpPass });
  try {
    const remoteTemplatesDir = `${remoteBase}/templates`;
    await sftp.mkdir(remoteTemplatesDir, true).catch(() => {});
    await sftp.put(fs.createReadStream(localPath), `${remoteTemplatesDir}/${filename}`);
    const url = `${publicBase}/uploads/templates/${filename}`;
    console.log(`[templates] ✓ SFTP uploaded: ${filename} → ${url}`);
    return url;
  } finally {
    await sftp.end().catch(() => {});
  }
}

/**
 * If `previewValue` is a base64 data URL, persist it permanently:
 *   - SFTP mode  (SFTP_HOST set): writes to OS temp dir then SFTP-uploads to Hostinger.
 *   - Local mode (no SFTP)      : writes to uploads/templates/ on disk.
 * Returns the public URL/relative-path to store in MongoDB.
 * Already-URL / already-path values pass through unchanged (idempotent).
 */
async function persistPreviewImage(previewValue: string, filenameHint = 'preview'): Promise<string> {
  if (!previewValue || !previewValue.startsWith('data:image/')) {
    return previewValue;
  }
  try {
    const match = /^data:(image\/[a-z+]+);base64,(.+)$/is.exec(previewValue);
    if (!match) return previewValue;
    const ext    = match[1].toLowerCase() === 'image/jpeg' ? '.jpg' : '.png';
    const buffer = Buffer.from(match[2], 'base64');
    const safe   = filenameHint.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
    const filename = `preview-${safe}${ext}`;

    if (sftpEnabled) {
      // Save to a temp file, SFTP-upload, then clean up.
      const tmpPath = path.join(os.tmpdir(), `tmp-${Date.now()}-${filename}`);
      await fs.promises.writeFile(tmpPath, buffer);
      try {
        const remoteUrl = await sftpUploadFile(tmpPath, filename);
        console.log(`[templates] ✓ Preview SFTP-uploaded: ${filename} → ${remoteUrl}`);
        return remoteUrl;
      } catch (sftpErr) {
        console.warn('[templates] SFTP upload failed, falling back to local disk:', (sftpErr as Error).message);
        // Fall through to local-disk save below so the preview is never lost.
      } finally {
        await fs.promises.unlink(tmpPath).catch(() => {});
      }
    }
    // Local mode (or SFTP fallback): write directly to uploads/templates/.
    const filePath = path.join(templatesUploadsDir, filename);
    await fs.promises.writeFile(filePath, buffer);
    const relativePath = `/uploads/templates/${filename}`;
    console.log(`[templates] ✓ Preview saved to disk: ${filename} (${Math.round(buffer.length / 1024)} KB) → ${relativePath}`);
    return relativePath;
  } catch (err) {
    console.warn('[templates] ! persistPreviewImage failed (non-fatal):', (err as Error).message);
    return previewValue; // fall back so the template save itself does not fail
  }
}

/**
 * After multer has saved a file locally to templatesUploadsDir, optionally SFTP-upload it.
 * Returns the permanent public URL/relative-path.
 */
async function persistMulterFile(localFilePath: string, filename: string): Promise<string> {
  if (sftpEnabled) {
    try {
      return await sftpUploadFile(localFilePath, filename);
    } catch (err) {
      console.warn('[templates] SFTP upload failed, falling back to local path:', (err as Error).message);
    }
  }
  return `/uploads/templates/${filename}`;
}

function handleUploadError(error: unknown, res: Response): void {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ success: false, error: `Image too large. Max ${maxUploadMb}MB.` });
      return;
    }
    res.status(400).json({ success: false, error: error.message });
    return;
  }
  if ((error as NodeJS.ErrnoException)?.code === 'INVALID_FILE_TYPE') {
    res.status(400).json({ success: false, error: 'Only JPG and PNG images are allowed.' });
    return;
  }
  res.status(500).json({ success: false, error: 'Image upload failed.' });
}

const maybeUploadImage = (req: Request, res: Response, next: NextFunction) => {
  if (req.is('multipart/form-data')) {
    upload.single('image')(req, res, (error) => {
      if (error) {
        handleUploadError(error, res);
        return;
      }
      next();
    });
    return;
  }
  next();
};

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

function sanitizePreviewValue(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^data:/i.test(raw) && !/^data:image\//i.test(raw)) {
    return '';
  }
  return raw;
}

function resolvePreviewImage(payload: Record<string, any>): string {
  return sanitizePreviewValue(String(payload.preview_image || payload.previewImageUrl || payload.imageUrl || '').trim());
}

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

// ── In-memory server-side response cache ─────────────────────────────────────
// Keyed by the serialised query string (e.g. "" / "projectId=abc").
// TTL: 30 s — balances freshness vs. Atlas M0 query latency (~200-400 ms).
const _serverCache = new Map<string, { data: any[]; expiresAt: number }>();
const SERVER_CACHE_TTL = 5 * 60_000; // 5 minutes

function getServerCache(key: string): any[] | null {
  const entry = _serverCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _serverCache.delete(key); return null; }
  return entry.data;
}

function setServerCache(key: string, data: any[]): void {
  _serverCache.set(key, { data, expiresAt: Date.now() + SERVER_CACHE_TTL });
}

export function invalidateServerCache(): void {
  _serverCache.clear();
}

/** Read the pre-warmed gallery-cache.json (written at server startup). */
function readGalleryCacheFile(): any[] | null {
  try {
    const CACHE_FILE = path.join(__dirname, '..', '..', 'tmp', 'gallery-cache.json');
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as { data: any[]; expiresAt: number };
    if (!Array.isArray(parsed.data) || Date.now() > parsed.expiresAt) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

router.post('/upload-image', (req: Request, res: Response) => {
  upload.single('image')(req, res, async (error) => {
    if (error) {
      handleUploadError(error, res);
      return;
    }

    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      res.status(400).json({ success: false, error: 'Image file is required.' });
      return;
    }

    const url = await persistMulterFile(file.path, file.filename);
    res.status(201).json({
      success: true,
      data: {
        url,
        filename: file.filename,
      },
    });
  });
});

// ── Lightweight metadata-only endpoint ───────────────────────────────────────
// Returns only the fields needed to render gallery cards (no designData).
// Supports pagination via ?page=1&limit=24 and optional projectId/productId filter.
const META_PROJECTION = '_id templateName category tags preview_image previewImageUrl isGlobal isActive productId projectId createdAt updatedAt';

router.get('/meta', async (req: Request, res: Response) => {
  try {
    const requestedProductId = String(req.query.productId || '').trim();
    const requestedProjectId = String(req.query.projectId || '').trim();
    const page  = Math.max(1, parseInt(String(req.query.page  || '1'),  10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '24'), 10)));
    const skip  = (page - 1) * limit;

    const cacheKey = `meta:${requestedProductId || requestedProjectId || '__all__'}:${page}:${limit}`;
    const cached = getServerCache(cacheKey);
    if (cached) {
      res.setHeader('Cache-Control', 'private, max-age=300, stale-while-revalidate=600');
      res.setHeader('X-Cache', 'HIT');
      res.json({ success: true, data: cached, meta: { page, limit, total: cached.length } });
      return;
    }

    let filter: Record<string, any> = {};
    if (requestedProductId) {
      // Only return templates that belong to this product — never inject global gallery templates.
      filter = { productId: requestedProductId };
    } else if (requestedProjectId) {
      // Also check productId for backward compatibility with templates saved before projectId was introduced.
      // NOTE: do NOT restrict by isGlobal here — a project-owned template that is also
      // marked public should still appear in its own project's template list.
      const isValidObjId = isValidObjectId(requestedProjectId);
      if (isValidObjId) {
        filter = {
          $or: [
            { projectId: requestedProjectId },
            { productId: new mongoose.Types.ObjectId(requestedProjectId) },
          ],
        };
      } else {
        filter = { projectId: requestedProjectId };
      }
    } else {
      // Gallery: only return global/public templates.
      filter = { isGlobal: true };
    }

    const [total, rawTemplates] = await Promise.all([
      ProductTemplate.countDocuments(filter),
      ProductTemplate.find(filter)
        .select(META_PROJECTION)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const data = rawTemplates.map((t: any) => {
      const result: any = { ...t };
      // Sanitize preview fields — strip base64 data URIs from list payloads
      if (typeof result.preview_image === 'string' && result.preview_image.startsWith('data:')) {
        result.preview_image = null;
      }
      if (typeof result.previewImageUrl === 'string' && result.previewImageUrl.startsWith('data:')) {
        result.previewImageUrl = null;
      }
      return result;
    });

    setServerCache(cacheKey, data);

    res.setHeader('Cache-Control', 'private, max-age=300, stale-while-revalidate=600');
    res.setHeader('X-Cache', 'MISS');
    res.json({ success: true, data, meta: { page, limit, total } });
  } catch (error) {
    const err = error as Error;
    console.error('[templates] GET /api/templates/meta failed', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const requestedProductId = String(req.query.productId || '').trim();
    const requestedProjectId = String(req.query.projectId || '').trim();
    console.log('[templates] GET /api/templates', {
      productId: requestedProductId || null,
      projectId: requestedProjectId || null,
      query: req.query,
    });

    // Cache key based on the query parameters
    const cacheKey = requestedProductId
      ? `productId:${requestedProductId}`
      : requestedProjectId
        ? `projectId:${requestedProjectId}`
        : '__all__';

    // Bypass server cache when the client explicitly requests fresh data (e.g. after an
    // SSE-triggered re-fetch or a forced refresh). The 'cache' fetch option sets the
    // Cache-Control request header to 'no-cache' in those cases.
    const clientWantsNoCache = String(req.headers['cache-control'] || '').toLowerCase().includes('no-cache');

    // 1. Check in-memory server cache first (fastest path)
    const cached = clientWantsNoCache ? null : getServerCache(cacheKey);
    if (cached) {
      res.setHeader('Cache-Control', 'private, max-age=300, stale-while-revalidate=600');
      res.setHeader('X-Cache', 'HIT');
      res.json({ success: true, data: cached, meta: { total: cached.length } });
      return;
    }

    // 2. For the unfiltered gallery call, try the pre-warmed gallery-cache.json file
    if (cacheKey === '__all__') {
      const fileCached = readGalleryCacheFile();
      if (fileCached) {
        setServerCache(cacheKey, fileCached);
        res.setHeader('Cache-Control', 'private, max-age=300, stale-while-revalidate=600');
        res.setHeader('X-Cache', 'FILE');
        res.json({ success: true, data: fileCached, meta: { total: fileCached.length } });
        return;
      }
    }

    // 3. Try the lightweight TemplateGalleryMeta collection first — it has no designData
    //    and has proper indexes so queries return in <100 ms even on Atlas M0.
    let metaFilter: Record<string, any> = {};
    if (requestedProductId) {
      // Only return templates that belong to this product — never inject global gallery templates.
      metaFilter = { productId: requestedProductId };
    } else if (requestedProjectId) {
      // Return templates that belong to this project.
      // Also check productId for backward compatibility with older templates that were
      // saved using productId = <project_id> before the projectId field was introduced.
      // NOTE: do NOT restrict by isGlobal — a project template marked as public should
      // still appear in its own project.
      const isValidObjId = isValidObjectId(requestedProjectId);
      if (isValidObjId) {
        metaFilter = {
          $or: [
            { projectId: requestedProjectId },
            { productId: new mongoose.Types.ObjectId(requestedProjectId) },
          ],
        };
      } else {
        metaFilter = { projectId: requestedProjectId };
      }
    } else {
      // Gallery (no filter): only show global/public templates.
      metaFilter = { isGlobal: true };
    }

    try {
      const metaDocs = await TemplateGalleryMeta
        .find(metaFilter)
        .sort({ updatedAt: -1 })
        .lean();

      if (metaDocs.length > 0) {
        // Remap templateId → _id so the frontend receives the canonical ProductTemplate ObjectId.
        const remapped = metaDocs.map((t: any) => {
          const result: any = { ...t, _id: (t.templateId ?? t._id).toString() };
          if (typeof result.preview_image   === 'string' && result.preview_image.startsWith('data:'))   result.preview_image = null;
          if (typeof result.previewImageUrl === 'string' && result.previewImageUrl.startsWith('data:')) result.previewImageUrl = null;
          return result;
        });

        console.log('[templates] Served from TemplateGalleryMeta', { count: remapped.length, cacheKey });
        setServerCache(cacheKey, remapped);
        res.setHeader('Cache-Control', 'private, max-age=300, stale-while-revalidate=600');
        res.setHeader('X-Cache', 'META');
        res.json({ success: true, data: remapped, meta: { total: remapped.length } });
        return;
      }
    } catch (metaErr) {
      console.warn('[templates] TemplateGalleryMeta query failed, falling back to ProductTemplate:', (metaErr as Error).message);
    }

    // 4. Fallback: query ProductTemplate directly (slower — designData excluded via projection)
    let filter: Record<string, any> = {};
    if (requestedProductId) {
      // Only return templates that belong to this product — never inject global gallery templates.
      filter = { productId: requestedProductId };
    } else if (requestedProjectId) {
      // Also check productId for backward compatibility (old templates saved with productId = project id).
      // NOTE: do NOT restrict by isGlobal — a project-owned template marked public must
      // still appear in its own project's template list.
      const isValidObjId = isValidObjectId(requestedProjectId);
      if (isValidObjId) {
        filter = {
          $or: [
            { projectId: requestedProjectId },
            { productId: new mongoose.Types.ObjectId(requestedProjectId) },
          ],
        };
      } else {
        filter = { projectId: requestedProjectId };
      }
    } else {
      // Gallery (no filter): only return global/public templates — never show project-specific ones.
      filter = { isGlobal: true };
    }
    const rawTemplates = await ProductTemplate
      .find(filter)
      .select('-designData')
      .sort({ updatedAt: -1 })
      .lean();

    // Strip large binary fields from list responses.
    // • base64 data-URL preview images — strip so payload stays small.
    const stripped = rawTemplates.map((t: any) => {
      const result: any = { ...t };

      // Replace base64 preview fields with null so the thumbnail <img> gets a
      // 404 (graceful broken-image) rather than rendering a massive inline data URL.
      if (typeof result.preview_image === 'string' && result.preview_image.startsWith('data:')) {
        result.preview_image = null;
      }
      if (typeof result.previewImageUrl === 'string' && result.previewImageUrl.startsWith('data:')) {
        result.previewImageUrl = null;
      }

      return result;
    });

    console.log('[templates] Templates found', {
      count: stripped.length,
      ids: stripped.map((template: any) => String(template._id)),
    });

    // Store in server cache for subsequent requests
    setServerCache(cacheKey, stripped);

    // For the global gallery: also refresh the gallery-cache.json file so the
    // next cold-start (or TTL expiry) doesn't hit MongoDB again.
    if (cacheKey === '__all__') {
      setImmediate(() => { warmGalleryCache().catch(() => {}); });
    }

    res.setHeader('Cache-Control', 'private, max-age=300, stale-while-revalidate=600');
    res.setHeader('X-Cache', 'MISS');
    res.json({
      success: true,
      data: stripped,
      meta: {
        total: stripped.length
      },
    });
  } catch (error) {
    const err = error as Error;
    console.error('[templates] GET /api/templates failed', {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/product/:productId', async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    if (!isValidObjectId(productId)) {
      res.status(400).json({ success: false, error: 'Invalid productId' });
      return;
    }

    const { category, search } = req.query;
    const filter: Record<string, any> = { productId, isActive: true };
    if (category) filter.category = category;
    if (search) filter.templateName = { $regex: String(search), $options: 'i' };

    console.log('[templates] Querying /api/templates/product/:productId', {
      productId,
      filter,
      database: mongoose.connection.name,
      collection: 'producttemplates',
    });

    const rawTemplates = await ProductTemplate.find(filter).lean();
    const templates = rawTemplates.slice().sort(
      (a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    console.log('[templates] Query result', {
      productId,
      count: templates.length,
      templateIds: templates.map((t: any) => String(t._id)),
    });
    res.json({ success: true, data: templates });
  } catch (error) {
    const err = error as Error;
    console.error('[templates] GET /api/templates/product/:productId failed', {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      res.status(400).json({ success: false, error: 'Invalid template id' });
      return;
    }

    const template = await ProductTemplate.findById(id);
    if (!template) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }

    const data = template.toJSON() as Record<string, any>;
    const normalizedPreview = sanitizePreviewValue(String(data.preview_image || data.previewImageUrl || ''));
    data.preview_image = normalizedPreview || null;
    data.previewImageUrl = normalizedPreview || null;

    res.json({ success: true, data });
  } catch (error) {
    const err = error as Error;
    console.error('[templates] GET /api/templates/:id failed', {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', maybeUploadImage, async (req: Request, res: Response) => {
  try {
    const {
      productId,
      projectId: explicitProjectId,
      userId,
      title,
      templateName,
      description,
      imageUrl,
      previewImageUrl,
      preview_image,
      designFileUrl,
      designData,
      category = 'Other',
      tags = [],
      isActive = true,
      isGlobal,
      isPublic,
    } = req.body;

    // When an explicit projectId is provided, use it — this ensures templates created
    // from within a project are stored with projectId (not productId) so the project-
    // scoped GET /api/templates?projectId=xxx query can find them correctly.
    const resolvedProjectId = String(explicitProjectId || '').trim();
    const resolvedProductId = String(productId || '').trim();
    // At least one must be provided for the template to be associated with something.
    const ownerRef = resolvedProjectId || resolvedProductId;

    const file = (req as Request & { file?: Express.Multer.File }).file;
    const uploadedImageUrl = file ? await persistMulterFile(file.path, file.filename) : '';
    const resolvedTemplateName = String(title || templateName || '').trim();
    const normalizedPreview = uploadedImageUrl || await persistPreviewImage(
      resolvePreviewImage({ preview_image, previewImageUrl, imageUrl }),
      resolvedTemplateName.replace(/\s+/g, '_') || 'preview',
    );

    if (!resolvedTemplateName || !normalizedPreview) {
      res.status(400).json({ success: false, error: 'title/templateName and image are required' });
      return;
    }

    if (userId && !isValidObjectId(String(userId))) {
      res.status(400).json({ success: false, error: 'Invalid userId' });
      return;
    }

    // Validate the ownerRef exists (project takes priority)
    if (resolvedProjectId && isValidObjectId(resolvedProjectId)) {
      const projectExists = await Project.exists({ _id: resolvedProjectId });
      if (!projectExists) {
        res.status(404).json({ success: false, error: 'Project not found for template mapping' });
        return;
      }
    } else if (resolvedProductId && isValidObjectId(resolvedProductId)) {
      const productExists = await Product.exists({ _id: resolvedProductId });
      const projectExists = productExists ? null : await Project.exists({ _id: resolvedProductId });
      if (!productExists && !projectExists) {
        res.status(404).json({ success: false, error: 'Product or Project not found for template mapping' });
        return;
      }
    }

    const isProductObjectId = !resolvedProjectId && isValidObjectId(resolvedProductId);

    // Pre-check: avoid E11000 by detecting the duplicate before attempting to save
    if (resolvedProjectId) {
      const existing = await ProductTemplate.findOne({
        projectId: resolvedProjectId,
        templateName: resolvedTemplateName,
      }).lean();
      if (existing) {
        res.status(200).json({ success: true, data: { ...existing, alreadyExists: true } });
        return;
      }
    } else if (isProductObjectId) {
      const existing = await ProductTemplate.findOne({
        productId: resolvedProductId,
        templateName: resolvedTemplateName,
      }).lean();
      if (existing) {
        res.status(200).json({ success: true, data: { ...existing, alreadyExists: true } });
        return;
      }
    }

    // Determine how to store the owner reference.
    // projectId takes explicit priority (project-scoped template).
    // Falls back to productId for actual product templates.
    // If neither is set (e.g., standalone gallery duplicate), no owner field is set.
    const ownerFields = resolvedProjectId
      ? { projectId: resolvedProjectId }
      : isProductObjectId
        ? { productId: resolvedProductId }
        : resolvedProductId
          ? { projectId: resolvedProductId }   // non-ObjectId project ref stored as string
          : {};                                  // standalone global template (no owner)

    const template = new ProductTemplate({
      ...ownerFields,
      createdBy: userId ? new mongoose.Types.ObjectId(String(userId)) : undefined,
      isGlobal: [true, 'true', 1, '1'].includes(isGlobal)
        || [true, 'true', 1, '1'].includes(isPublic),
      templateName: resolvedTemplateName,
      description: typeof description === 'string' ? description.trim() : undefined,
      preview_image: normalizedPreview,
      previewImageUrl: normalizedPreview,
      designFileUrl,
      designData: parseJsonField<Record<string, any>>(designData, {}),
      category,
      tags: parseJsonField<string[]>(tags, []),
      isActive,
    });

    console.log('[templates] Saving template', {
      ownerRef,
      templateName: template.templateName,
      collection: 'producttemplates',
      database: mongoose.connection.name,
    });

    const savedTemplate = await template.save();
    console.log('[templates] Template saved successfully', {
      _id: String(savedTemplate._id),
      templateName: savedTemplate.templateName,
      createdAt: savedTemplate.createdAt,
    });

    // Keep TemplateGalleryMeta in sync for fast gallery/project reads (non-blocking).
    TemplateGalleryMeta.findOneAndUpdate(
      { templateId: savedTemplate._id },
      {
        templateId: savedTemplate._id,
        productId: savedTemplate.productId,
        projectId: savedTemplate.projectId != null ? String(savedTemplate.projectId) : undefined,
        templateName: savedTemplate.templateName,
        description: savedTemplate.description,
        category: savedTemplate.category,
        previewImageUrl: savedTemplate.previewImageUrl,
        preview_image: savedTemplate.preview_image,
        designFileUrl: savedTemplate.designFileUrl,
        isGlobal: savedTemplate.isGlobal ?? false,
        isActive: savedTemplate.isActive ?? true,
        tags: savedTemplate.tags,
      },
      { upsert: true }
    ).catch(() => {});

    invalidateServerCache();

    emitRealtimeEvent({
      type: 'template:created',
      templateId: String(savedTemplate._id),
      projectId: savedTemplate.projectId,
      productId: savedTemplate.productId ? String(savedTemplate.productId) : undefined,
      isGlobal: savedTemplate.isGlobal === true,
    });

    res.status(201).json({ success: true, data: savedTemplate });
  } catch (error) {
    const err = error as Error & { code?: number };
    // MongoDB duplicate key error (E11000) — template already attached to this project
    if (err.code === 11000) {
      // Find the existing template and return it so the caller can use it
      try {
        const { productId, projectId: bodyProjectId, title, templateName } = req.body;
        const resolvedName = String(title || templateName || '').trim();
        const resolvedProjId = String(bodyProjectId || '').trim();
        const existing = await ProductTemplate.findOne(
          resolvedProjId
            ? { projectId: resolvedProjId, templateName: resolvedName }
            : { productId, templateName: resolvedName }
        ).lean();
        // Embed alreadyExists inside data so templateApi handleResponse passes it through
        res.status(200).json({ success: true, data: { ...(existing ?? {}), alreadyExists: true } });
        return;
      } catch {
        res.status(200).json({ success: true, data: { alreadyExists: true } });
        return;
      }
    }
    console.error('[templates] Template save failed', {
      error: err.message,
      stack: err.stack,
      mongoError: (error as any).code,
      mongoMessage: (error as any).message,
    });
    res.status(400).json({ success: false, error: err.message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      res.status(400).json({ success: false, error: 'Invalid template id' });
      return;
    }

    const existingTemplate = await ProductTemplate.findById(id);
    if (!existingTemplate) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }

    const previewPayload = req.body as Record<string, any>;
    const requestedPreview = resolvePreviewImage(previewPayload);
    const hasPreviewField = (
      Object.prototype.hasOwnProperty.call(previewPayload, 'preview_image')
      || Object.prototype.hasOwnProperty.call(previewPayload, 'previewImageUrl')
      || Object.prototype.hasOwnProperty.call(previewPayload, 'imageUrl')
    );
    const rawPreview = requestedPreview
      || existingTemplate.preview_image
      || existingTemplate.previewImageUrl
      || '';
    const templateHint = String(
      (req.body as any).templateName || (req.body as any).title ||
      existingTemplate.templateName || 'preview'
    ).replace(/\s+/g, '_');
    const normalizedPreview = await persistPreviewImage(rawPreview, templateHint);

    // If design content changed but the client did not provide a fresh data URL
    // preview, the existing URL can stay stale (e.g. old "No Design" image).
    // Clear preview fields to force frontend background regeneration from canvasJSON.
    const hasDesignUpdate = Object.prototype.hasOwnProperty.call(previewPayload, 'designData');
    const hasFreshPreviewDataUrl = requestedPreview.startsWith('data:image/');
    const shouldClearStalePreview = hasDesignUpdate && hasPreviewField && !hasFreshPreviewDataUrl;

    const updatePayload: Record<string, any> = {
      ...req.body,
      preview_image: shouldClearStalePreview ? null : (normalizedPreview || undefined),
      previewImageUrl: shouldClearStalePreview ? null : (normalizedPreview || undefined),
    };

    // Safety guard: if this template belongs to a specific project it is a
    // project-private copy and must never become a global gallery template,
    // regardless of what the client sends.
    const templateProjectId = existingTemplate.projectId
      ? String(existingTemplate.projectId).trim()
      : "";
    if (templateProjectId) {
      updatePayload.isGlobal = false;
      updatePayload.isPublic = false;
    }

    console.log('[templates] Updating template', {
      _id: id,
      database: mongoose.connection.name,
      updateFields: Object.keys(updatePayload),
    });

    const template = await ProductTemplate.findByIdAndUpdate(id, updatePayload, { new: true });
    console.log('[templates] Template updated successfully', {
      _id: id,
      updatedAt: template?.updatedAt,
    });

    if (template) {
      // Keep TemplateGalleryMeta in sync — AWAITED so cache invalidation and SSE fire
      // only after the meta collection is consistent. Previously this was fire-and-forget,
      // which created a race where a frontend re-fetch (triggered by the SSE) could query
      // TemplateGalleryMeta before the upsert committed and receive the old thumbnail.
      await TemplateGalleryMeta.findOneAndUpdate(
        { templateId: template._id },
        {
          templateId: template._id,
          productId: template.productId,
          projectId: template.projectId != null ? String(template.projectId) : undefined,
          templateName: template.templateName,
          description: template.description,
          category: template.category,
          previewImageUrl: template.previewImageUrl,
          preview_image: template.preview_image,
          designFileUrl: template.designFileUrl,
          isGlobal: template.isGlobal ?? false,
          isActive: template.isActive ?? true,
          tags: template.tags,
        },
        { upsert: true }
      ).catch(() => {});

      invalidateServerCache();
      emitRealtimeEvent({
        type: 'template:updated',
        templateId: String(template._id),
        projectId: template.projectId,
        productId: template.productId ? String(template.productId) : undefined,
        isGlobal: template.isGlobal === true,
      });
    }

    res.json({ success: true, data: template });
  } catch (error) {
    const err = error as Error;
    console.error('[templates] Template update failed', {
      error: err.message,
      stack: err.stack,
    });
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      res.status(400).json({ success: false, error: 'Invalid template id' });
      return;
    }

    const existing = await ProductTemplate.findById(id).lean<Record<string, any>>();
    if (!existing) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }

    await ProductTemplate.deleteOne({ _id: id });
    await TemplateGalleryMeta.deleteOne({ templateId: existing._id }).catch(() => {});

    invalidateServerCache();

    emitRealtimeEvent({
      type: 'template:deleted',
      templateId: String(existing._id),
      projectId: existing.projectId ? String(existing.projectId) : undefined,
      productId: existing.productId ? String(existing.productId) : undefined,
      isGlobal: existing.isGlobal === true,
    });

    res.json({ success: true, data: { _id: id } });
  } catch (error) {
    const err = error as Error;
    console.error('[templates] Template delete failed', {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/selection', async (req: Request, res: Response) => {
  try {
    const { userId, productId, templateId, action, metadata } = req.body;

    if (!productId || !templateId || !action) {
      res.status(400).json({ success: false, error: 'productId, templateId and action are required' });
      return;
    }
    if (!isValidObjectId(productId) || !isValidObjectId(templateId)) {
      res.status(400).json({ success: false, error: 'Invalid productId or templateId' });
      return;
    }

    const mappedTemplate = await ProductTemplate.findOne({ _id: templateId, productId, isActive: true });
    if (!mappedTemplate) {
      res.status(404).json({ success: false, error: 'Template is not linked to this product' });
      return;
    }

    const selection = new TemplateSelection({
      userId,
      productId,
      templateId,
      action,
      metadata: metadata ?? {},
    });

    await selection.save();
    res.status(201).json({ success: true, data: selection });
  } catch (error) {
    const err = error as Error;
    console.error('[templates] Template selection save failed', {
      error: err.message,
      stack: err.stack,
    });
    res.status(400).json({ success: false, error: err.message });
  }
});

// Migration endpoint: Sync localStorage project templates to MongoDB
router.post('/migration/sync-project-templates', async (req: Request, res: Response) => {
  try {
    const { projectId, templates } = req.body as {
      projectId: string;
      templates: Array<{
        id?: string;
        templateName: string;
        templateType?: string;
        canvas?: Record<string, any>;
        margin?: Record<string, any>;
        thumbnail?: string;
        isPublic?: boolean;
        applicableFor?: string[];
      }>;
    };

    if (!projectId || !Array.isArray(templates)) {
      res.status(400).json({
        success: false,
        error: 'projectId and templates array are required'
      });
      return;
    }

    console.log('[templates:migration] Starting sync', {
      projectId,
      count: templates.length,
      database: mongoose.connection.name,
    });

    const savedTemplates = [];
    const errors = [];

    for (const tpl of templates) {
      try {
        const isProjectObjectId = isValidObjectId(projectId);
        if (isProjectObjectId) {
          const productExists = await Product.exists({ _id: projectId });
          const projectExists = productExists ? null : await Project.exists({ _id: projectId });
          if (!productExists && !projectExists) {
            console.warn('[templates:migration] Product or Project not found:', { projectId });
            errors.push({ templateName: tpl.templateName, error: 'Product or Project not found' });
            continue;
          }
        }

        // Create template in MongoDB
        const persistedThumb = tpl.thumbnail
          ? await persistPreviewImage(tpl.thumbnail, String(tpl.templateName || 'preview').replace(/\s+/g, '_'))
          : '';
        const newTemplate = new ProductTemplate({
          ...(isProjectObjectId ? { productId: projectId } : { projectId: String(projectId) }),
          templateName: String(tpl.templateName).trim(),
          category: 'Other', // Default category
          preview_image: persistedThumb,
          previewImageUrl: persistedThumb,
          designData: {
            templateType: tpl.templateType,
            canvas: tpl.canvas,
            margin: tpl.margin,
            applicableFor: tpl.applicableFor,
          },
          isActive: tpl.isPublic !== false,
          tags: [`migrated_${new Date().toISOString().split('T')[0]}`],
        });

        await newTemplate.save();
        savedTemplates.push({
          _id: String(newTemplate._id),
          templateName: newTemplate.templateName,
        });

        console.log('[templates:migration] Template saved', {
          templateName: tpl.templateName,
          _id: String(newTemplate._id),
        });
      } catch (err) {
        const error = err as Error;
        console.error('[templates:migration] Template save failed', {
          templateName: tpl.templateName,
          error: error.message,
        });
        errors.push({
          templateName: tpl.templateName,
          error: error.message,
        });
      }
    }

    console.log('[templates:migration] Sync complete', {
      projectId,
      saved: savedTemplates.length,
      failed: errors.length,
    });

    res.json({
      success: true,
      message: `Migrated ${savedTemplates.length} templates to MongoDB`,
      data: {
        saved: savedTemplates,
        errors,
      },
    });
  } catch (error) {
    const err = error as Error;
    console.error('[templates:migration] Migration failed', {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

export async function warmGalleryCache(): Promise<void> {
  const CACHE_FILE = path.join(__dirname, '..', '..', 'tmp', 'gallery-cache.json');
  try {
    const rawDocs = await TemplateGalleryMeta.find({ isGlobal: true }).lean();
    const docs = rawDocs.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const seenNames = new Set<string>();
    const unique = docs.filter((t) => {
      const key = String((t as any).templateName || '').trim().toLowerCase();
      if (seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    });
    const data = unique.map((t: any) => ({ ...t, _id: t.templateId ?? t._id }));
    const cache = { data, expiresAt: Date.now() + 30 * 60 * 1000 }; // 30 minutes
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf-8');
    console.log(`✓ Gallery cache warmed: ${data.length} template(s)`);
  } catch (err) {
    console.warn('! warmGalleryCache failed (non-fatal):', (err as Error).message);
  }
}
