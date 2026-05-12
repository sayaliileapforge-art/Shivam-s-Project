import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import ProductTemplate from '../models/ProductTemplate';
import TemplateGalleryMeta from '../models/TemplateGalleryMeta';
import Product from '../models/Product';
import Project from '../models/Project';
import TemplateSelection from '../models/TemplateSelection';
import { emitRealtimeEvent } from '../realtime';

const router = Router();

function resolveUploadsDir(): string {
  const configured = process.env.UPLOADS_DIR?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.resolve(__dirname, '..', '..', 'public', 'uploads');
}

// Template preview images go into a dedicated subdirectory so they're easy to
// identify and back up independently of general asset uploads.
const uploadsBase = resolveUploadsDir();
const templatesUploadsDir = path.join(uploadsBase, 'templates');
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 5) || 5;
const maxUploadBytes = maxUploadMb * 1024 * 1024;

for (const dir of [uploadsBase, templatesUploadsDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[templates] Directory created: ${dir}`);
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
 * Build the public URL path for a template image.
 * Returns a RELATIVE path (/uploads/templates/filename) so the stored value
 * is host-independent and resolves correctly in dev (Vite proxy) and production
 * (same-origin Express static / Nginx). When PUBLIC_BASE_URL is set in .env
 * an absolute URL is returned instead — useful for multi-origin deployments.
 */
function buildPublicImageUrl(_req: Request, filename: string): string {
  const relativePath = `/uploads/templates/${filename}`;
  const base = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, '');
  if (base) {
    return `${base}${relativePath}`;
  }
  return relativePath;
}

/**
 * If `previewValue` is a base64 data URL, save it as a PNG file inside
 * backend/public/uploads/templates/ (or UPLOADS_DIR/templates/ on VPS) and
 * return the relative path `/uploads/templates/<filename>.png`.
 *
 * On VPS set UPLOADS_DIR to a directory OUTSIDE the app folder so the file
 * survives git pull / redeploy / container restart:
 *   UPLOADS_DIR=/var/data/saas_uploads
 *
 * Files that are already a path or empty are returned unchanged.
 * Errors are caught and logged — on failure the original value is kept so the
 * save does not fail just because preview persistence failed.
 */
async function persistPreviewImage(previewValue: string, filenameHint = 'preview'): Promise<string> {
  if (!previewValue || !previewValue.startsWith('data:image/')) {
    return previewValue; // already a path, absolute URL, or empty — pass through
  }
  try {
    const match = /^data:(image\/[a-z+]+);base64,(.+)$/is.exec(previewValue);
    if (!match) return previewValue;
    const ext = match[1].toLowerCase() === 'image/jpeg' ? '.jpg' : '.png';
    const buffer = Buffer.from(match[2], 'base64');
    const safe = filenameHint.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
    const filename = `preview-${safe}${ext}`;
    const filePath = path.join(templatesUploadsDir, filename);
    await fs.promises.writeFile(filePath, buffer);
    const relativePath = `/uploads/templates/${filename}`;
    console.log(`[templates] ✓ Preview image saved to disk: ${filename}  (${Math.round(buffer.length / 1024)} KB)  →  ${relativePath}`);
    return relativePath;
  } catch (err) {
    console.warn('[templates] ! persistPreviewImage failed (non-fatal):', (err as Error).message);
    return previewValue; // fall back to the data URL so the save itself doesn't fail
  }
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

function resolvePreviewImage(payload: Record<string, any>): string {
  return String(payload.preview_image || payload.previewImageUrl || payload.imageUrl || '').trim();
}

/**
 * Normalise preview fields on plain objects returned by .lean() queries.
 * The Mongoose toJSON transform only runs on hydrated documents, not lean results.
 */
function normalizeLeanTemplate(t: Record<string, any>): Record<string, any> {
  const preview = t.preview_image || t.previewImageUrl || '';
  if (preview) {
    t.preview_image = preview;
    t.previewImageUrl = preview;
  }
  return t;
}

// Fields included in gallery list responses — excludes designData (can be megabytes of canvas JSON).
// Full designData is only fetched when a specific template is opened (GET /:id or project-specific list).
const GALLERY_SELECT_FIELDS =
  '_id productId projectId templateName description category ' +
  'previewImageUrl preview_image designFileUrl isGlobal isActive tags createdAt updatedAt';

/**
 * Upsert the lightweight gallery metadata mirror for a template.
 * Called non-blocking after each template create/update so the TemplateGalleryMeta
 * collection stays in sync without blocking the HTTP response.
 */
async function syncGalleryMeta(t: Record<string, any>): Promise<void> {
  try {
    await TemplateGalleryMeta.findOneAndUpdate(
      { templateId: t._id },
      {
        templateId: t._id,
        productId: t.productId,
        projectId: t.projectId,
        templateName: t.templateName,
        description: t.description,
        category: t.category,
        previewImageUrl: t.previewImageUrl,
        preview_image: t.preview_image,
        designFileUrl: t.designFileUrl,
        isGlobal: t.isGlobal ?? false,
        isActive: t.isActive ?? true,
        tags: t.tags,
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.warn('[templates] syncGalleryMeta failed (non-fatal):', (err as Error).message);
  }
}


// Atlas M0 reads 5 multi-MB documents from cold storage on every request (~50-60 s).
// By caching the result we pay that cost only once per TTL (5 minutes) and serve
// subsequent requests instantly from memory.
interface GalleryCache { data: Array<Record<string, any>>; expiresAt: number }
let galleryCache: GalleryCache | null = null;
const GALLERY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// File-based gallery cache — survives backend restarts and Atlas M0 sleep periods.
const GALLERY_CACHE_FILE = path.join(__dirname, '..', '..', 'tmp', 'gallery-cache.json');

function loadGalleryCacheFromFile(): void {
  try {
    if (fs.existsSync(GALLERY_CACHE_FILE)) {
      const raw = fs.readFileSync(GALLERY_CACHE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as GalleryCache;
      if (parsed && Array.isArray(parsed.data)) {
        galleryCache = parsed;
        console.log(`✓ Gallery file cache loaded: ${parsed.data.length} template(s)`);
      }
    }
  } catch (e) {
    console.warn('! Gallery file cache load failed (non-fatal):', (e as Error).message);
  }
}

function saveGalleryCacheToFile(cache: GalleryCache): void {
  try {
    const dir = path.dirname(GALLERY_CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(GALLERY_CACHE_FILE, JSON.stringify(cache), 'utf-8');
  } catch (e) {
    console.warn('! Gallery file cache save failed (non-fatal):', (e as Error).message);
  }
}

// Load file cache immediately so first requests are served from disk if Atlas is asleep
loadGalleryCacheFromFile();

// Shared promise for the in-flight cache warm-up — ensures only ONE Atlas query runs
// at a time even if multiple HTTP requests or the background warmup arrive concurrently.
let warmupInFlight: Promise<void> | null = null;

const WARMUP_TIMEOUT_MS = 90_000; // abort warmup query after 90 s (Atlas M0 cold read limit)

/** Pre-warm (or re-warm) the gallery cache. Concurrent calls share the same query. */
export function warmGalleryCache(): Promise<void> {
  if (warmupInFlight) return warmupInFlight; // deduplicate concurrent callers
  warmupInFlight = (async () => {
    try {
      // Read from lean TemplateGalleryMeta (no designData) — fast even on Atlas M0 cold storage
      const metaPromise = TemplateGalleryMeta
        .find({ isGlobal: true })
        .sort({ updatedAt: -1 })
        .lean<Array<Record<string, any>>>();
      const warmupTimeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('warmup timed out after 60000ms')), 60000)
      );
      const metaDocs = await Promise.race([metaPromise, warmupTimeoutPromise]);
      const seenNames = new Set<string>();
      const unique = metaDocs.filter((t) => {
        const key = String(t.templateName || '').trim().toLowerCase();
        if (seenNames.has(key)) return false;
        seenNames.add(key);
        return true;
      });
      const data = unique.map((t) => ({ ...t, _id: t.templateId ?? t._id }));
      galleryCache = { data, expiresAt: Date.now() + GALLERY_CACHE_TTL_MS };
      saveGalleryCacheToFile(galleryCache);
      console.log(`✓ Gallery cache warm: ${data.length} template(s)`);
    } catch (err) {
      console.warn('! Gallery cache warmup failed (non-fatal):', (err as Error).message);
    } finally {
      warmupInFlight = null;
    }
  })();
  return warmupInFlight;
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

router.post('/upload-image', (req: Request, res: Response) => {
  upload.single('image')(req, res, (error) => {
    if (error) {
      console.error('[templates] upload-image failed:', (error as Error).message);
      handleUploadError(error, res);
      return;
    }

    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      res.status(400).json({ success: false, error: 'Image file is required.' });
      return;
    }

    const url = buildPublicImageUrl(req, file.filename);
    console.log(`[templates] ✓ upload-image saved: ${file.path}  →  ${url}`);
    res.status(201).json({
      success: true,
      data: {
        url,
        filename: file.filename,
      },
    });
  });
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

    const isGalleryMode = !requestedProductId && !requestedProjectId;

    // ─── Gallery fast path: read from the lean TemplateGalleryMeta collection ───
    // These documents contain no designData so they are tiny (<2 KB each) and
    // Atlas M0 serves them from memory in <100 ms even from cold storage.
    if (isGalleryMode) {
      // Try the lean TemplateGalleryMeta collection first (tiny docs, fast on Atlas M0).
      // On error (Atlas offline), fall back to the in-memory galleryCache if available.
      let metaDocs: Array<Record<string, any>> | null = null;
      try {
        const GALLERY_META_TIMEOUT_MS = 5000; // 5s — if Atlas doesn't respond, use file cache
        const metaPromise = TemplateGalleryMeta
          .find({ isGlobal: true })
          .sort({ updatedAt: -1 })
          .lean<Array<Record<string, any>>>();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`gallery meta timeout after ${GALLERY_META_TIMEOUT_MS}ms`)), GALLERY_META_TIMEOUT_MS)
        );
        metaDocs = await Promise.race([metaPromise, timeoutPromise]);
      } catch (metaErr) {
        console.warn('[templates] TemplateGalleryMeta read failed, trying cache:', (metaErr as Error).message);
        if (galleryCache && Date.now() < galleryCache.expiresAt + 7 * 24 * 60 * 60 * 1000) {
          // Serve stale cache (up to 7 days) when Atlas is offline
          console.log('[templates] Gallery served from stale cache', { count: galleryCache.data.length });
          res.setHeader('Cache-Control', 'no-store');
          res.json({ success: true, data: galleryCache.data, meta: { total: galleryCache.data.length } });
          return;
        }
        throw metaErr; // no cache — let outer catch handle it
      }
      const seenNames = new Set<string>();
      const unique = metaDocs.filter((t) => {
        const key = String(t.templateName || '').trim().toLowerCase();
        if (seenNames.has(key)) return false;
        seenNames.add(key);
        return true;
      });
      // Remap templateId → _id so frontend code using ._id continues to work
      const data = unique.map((t) => ({
        ...t,
        _id: t.templateId ?? t._id,
      }));
      // Populate in-memory cache so fallback works during Atlas offline periods
      galleryCache = { data, expiresAt: Date.now() + GALLERY_CACHE_TTL_MS };
      saveGalleryCacheToFile(galleryCache);
      console.log('[templates] Gallery served from TemplateGalleryMeta', { count: data.length });
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, data, meta: { total: data.length } });
      return;
    }

    // Fetch templates by projectId or productId
    let filter: Record<string, any> = {};
    if (requestedProductId) {
      const productConditions: Record<string, any>[] = [
        { productId: requestedProductId },
      ];
      if (isValidObjectId(requestedProductId)) {
        productConditions.push({ productId: new mongoose.Types.ObjectId(requestedProductId) });
      }
      filter = { $or: productConditions };
    } else if (requestedProjectId) {
      // Match both projectId (string field) AND productId (ObjectId field) for backward compat —
      // older templates stored the projectId in productId before this fix was applied.
      // Do NOT include isGlobal:true here — global templates belong to the Template Gallery,
      // not to individual project template lists. Including them would fetch all global
      // templates (with large designData blobs) for every project, causing slow loads.
      const projectConditions: Record<string, any>[] = [
        { projectId: requestedProjectId },
      ];
      if (isValidObjectId(requestedProjectId)) {
        projectConditions.push({ productId: new mongoose.Types.ObjectId(requestedProjectId) });
      }
      filter = { $or: projectConditions };
    } else {
      // Gallery mode (no productId / projectId): only return public global templates.
      // Results are served from the in-memory cache above after the first DB hit.
      filter = { isGlobal: true };
    }

    // Gallery mode: exclude designData (can be megabytes of canvas JSON per template) and use
    // lean() for 3-5x faster query execution. Full designData is fetched on-demand via GET /:id.
    // Project/product mode: return full documents (including designData) so the frontend can render
    // previews immediately, but still use lean() for lower memory overhead.
    // Atlas M0 free tier has a 32 MB in-memory sort limit. Any query whose filter is not
    // covered by a compound index triggers an in-memory sort on the full documents (including
    // the large designData blobs) and OOMs.
    //   • Gallery uses filter={isGlobal:true} + sort={updatedAt:-1}: fully covered by the
    //     {isGlobal:1,updatedAt:-1} compound index — no in-memory sort, no OOM.
    //   • Project/product uses $or (no single compound index covers all branches) — skip sort
    //     to avoid OOM; the order doesn't matter for project template lists.
    // Non-gallery queries: let the query run until the frontend AbortController fires (45 s).
    // A hard backend timeout shorter than the Atlas M0 cold-storage wake time (60-120 s) would
    // return a 500 before Atlas is ready, causing the frontend to clear the template list.
    // The frontend abort produces an AbortError which already preserves template state.
    const rawTemplates = isGalleryMode
      ? await ProductTemplate
          .find(filter)
          .select(GALLERY_SELECT_FIELDS)
          .sort({ updatedAt: -1 })
          .lean<Array<Record<string, any>>>()
      : await ProductTemplate.find(filter).lean<Array<Record<string, any>>>();

    // Normalize preview fields — Mongoose toJSON transform doesn't run on lean() results.
    const normalizedTemplates = rawTemplates.map(normalizeLeanTemplate);

    // Deduplicate by name only in gallery mode (no productId / projectId filter).
    // When fetching project-specific templates, all records must be returned regardless of name
    // so that a project copy with the same name as the global template is not silently dropped.
    const seenNames = new Set<string>();
    const templates = isGalleryMode
      ? normalizedTemplates.filter((t) => {
          const key = String(t.templateName || '').trim().toLowerCase();
          if (seenNames.has(key)) return false;
          seenNames.add(key);
          return true;
        })
      : normalizedTemplates;

    // Populate the gallery cache for subsequent fast-path responses.
    if (isGalleryMode) {
      galleryCache = { data: templates, expiresAt: Date.now() + GALLERY_CACHE_TTL_MS };
    }

    console.log('[templates] Templates found', {
      count: templates.length,
      ids: templates.map((template) => String(template._id)),
    });

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      data: templates,
      meta: {
        total: templates.length
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

    const templates = await ProductTemplate.find(filter).sort({ updatedAt: -1 }).lean<Array<Record<string, any>>>();
    const normalizedTemplates = templates.map(normalizeLeanTemplate);
    res.setHeader('Cache-Control', 'no-store');
    console.log('[templates] Query result', {
      productId,
      count: normalizedTemplates.length,
      templateIds: normalizedTemplates.map((t) => String(t._id)),
    });
    res.json({ success: true, data: normalizedTemplates });
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

    // Use a timeout race so Atlas M0 cold-storage reads don't hang indefinitely.
    // 120 s gives Atlas M0 enough time to fully wake from cold storage
    // (typically 15-90 s; the frontend retries if this fires).
    const TEMPLATE_FETCH_TIMEOUT_MS = 120_000;
    const fetchPromise = ProductTemplate.findById(id).lean<Record<string, any>>();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Template fetch timed out after ${TEMPLATE_FETCH_TIMEOUT_MS}ms`)), TEMPLATE_FETCH_TIMEOUT_MS)
    );
    const template = await Promise.race([fetchPromise, timeoutPromise]);

    if (!template) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: template });
  } catch (error) {
    const err = error as Error;
    const isTimeout = err.message?.includes('timed out');
    console.error('[templates] GET /api/templates/:id failed', {
      error: err.message,
      stack: isTimeout ? undefined : err.stack,
    });
    res.status(isTimeout ? 504 : 500).json({ success: false, error: err.message });
  }
});

router.post('/', maybeUploadImage, async (req: Request, res: Response) => {
  try {
    const {
      productId,
      projectId: bodyProjectId,
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

    const file = (req as Request & { file?: Express.Multer.File }).file;
    const uploadedImageUrl = file ? buildPublicImageUrl(req, file.filename) : '';
    const rawPreview = uploadedImageUrl || resolvePreviewImage({ preview_image, previewImageUrl, imageUrl });
    // If preview is a base64 data URL, persist it as an actual file on disk so
    // MongoDB stores a small path instead of megabytes of image data.
    const normalizedPreview = await persistPreviewImage(rawPreview, String(title || templateName || 'preview').trim());
    const resolvedTemplateName = String(title || templateName || '').trim();

    if (!productId || !resolvedTemplateName) {
      res.status(400).json({ success: false, error: 'productId and title/templateName are required' });
      return;
    }

    if (userId && !isValidObjectId(String(userId))) {
      res.status(400).json({ success: false, error: 'Invalid userId' });
      return;
    }

    const isProductObjectId = isValidObjectId(productId);
    let isActualProduct = false;
    let isActualProject = false;

    if (isProductObjectId) {
      const productExists = await Product.exists({ _id: productId });
      if (productExists) {
        isActualProduct = true;
      } else {
        const projectExists = await Project.exists({ _id: productId });
        if (!projectExists) {
          res.status(404).json({ success: false, error: 'Product or Project not found for template mapping' });
          return;
        }
        isActualProject = true;
      }
    }

    // Resolve final projectId: explicit bodyProjectId wins, otherwise derive from productId when it's a project
    const resolvedProjectId = String(bodyProjectId || (isActualProject ? productId : '') || '').trim();

    // ── Idempotency check: if a non-global template with the same projectId + name already exists, return it ──
    // NOTE: isGlobal: true templates are gallery templates — they must NOT be counted as project attachments
    // even if they share the same projectId (templates created for a project are stored with projectId set).
    if (resolvedProjectId) {
      const existing = await ProductTemplate.findOne({
        projectId: resolvedProjectId,
        templateName: resolvedTemplateName,
        isGlobal: { $ne: true },
      });
      if (existing) {
        console.log('[templates] Template already exists for project — returning existing', {
          _id: String(existing._id),
          templateName: existing.templateName,
          projectId: resolvedProjectId,
        });
        res.status(200).json({ success: true, data: existing, alreadyExists: true });
        return;
      }
    }

    const template = new ProductTemplate({
      ...(isActualProduct ? { productId: new mongoose.Types.ObjectId(String(productId)) } : {}),
      ...(resolvedProjectId ? { projectId: resolvedProjectId } : {}),
      createdBy: userId ? new mongoose.Types.ObjectId(String(userId)) : undefined,
      isGlobal: [true, 'true', 1, '1'].includes(isGlobal)
        || [true, 'true', 1, '1'].includes(isPublic),
      templateName: resolvedTemplateName,
      description: typeof description === 'string' ? description.trim() : undefined,
      preview_image: normalizedPreview || '',
      previewImageUrl: normalizedPreview || '',
      designFileUrl,
      designData: parseJsonField<Record<string, any>>(designData, {}),
      category,
      tags: parseJsonField<string[]>(tags, []),
      isActive,
    });

    console.log('[templates] Saving template', {
      resolvedProjectId: resolvedProjectId || null,
      isActualProduct,
      isActualProject,
      templateName: template.templateName,
      hasPreview: Boolean(normalizedPreview),
      previewType: normalizedPreview
        ? (normalizedPreview.startsWith('data:') ? 'dataURL' : 'path')
        : 'none',
      collection: 'producttemplates',
      database: mongoose.connection.name,
    });

    let savedTemplate: typeof template;
    try {
      savedTemplate = await template.save();
    } catch (saveError: any) {
      // Handle MongoDB duplicate key error (E11000) — return the existing document instead
      if (saveError?.code === 11000) {
        const dupFilter: Record<string, any> = { templateName: resolvedTemplateName, isGlobal: { $ne: true } };
        if (resolvedProjectId) dupFilter.projectId = resolvedProjectId;
        else if (isActualProduct) dupFilter.productId = new mongoose.Types.ObjectId(String(productId));
        const existingDup = await ProductTemplate.findOne(dupFilter);
        if (existingDup) {
          console.log('[templates] Duplicate key — returning existing template', {
            _id: String(existingDup._id),
            templateName: existingDup.templateName,
          });
          res.status(200).json({ success: true, data: existingDup, alreadyExists: true });
          return;
        }
      }
      throw saveError;
    }

    // Push template ref into Project.templates array
    if (resolvedProjectId && isValidObjectId(resolvedProjectId)) {
      await Project.findByIdAndUpdate(
        resolvedProjectId,
        { $addToSet: { templates: savedTemplate._id } },
        { new: false }
      ).catch((err: Error) => {
        console.warn('[templates] Failed to update Project.templates array', err.message);
      });
    }

    console.log('[templates] Template saved successfully', {
      _id: String(savedTemplate._id),
      templateName: savedTemplate.templateName,
      projectId: savedTemplate.projectId || null,
      createdAt: savedTemplate.createdAt,
    });

    emitRealtimeEvent({
      type: 'template:created',
      templateId: String(savedTemplate._id),
      projectId: savedTemplate.projectId || savedTemplate.productId?.toString(),
      productId: savedTemplate.productId?.toString(),
      isGlobal: savedTemplate.isGlobal === true,
    });

    // Non-blocking: sync lightweight gallery metadata (no designData)
    setImmediate(() => syncGalleryMeta(savedTemplate.toObject()));

    res.status(201).json({ success: true, data: savedTemplate });
  } catch (error) {
    const err = error as Error;
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

    const rawPreview = resolvePreviewImage(req.body as Record<string, any>)
      || existingTemplate.preview_image
      || existingTemplate.previewImageUrl
      || '';
    // Persist data URL previews as files; paths and empty strings pass through.
    const normalizedPreview = await persistPreviewImage(rawPreview, existingTemplate.templateName || id);

    const updatePayload: Record<string, any> = {
      ...req.body,
      preview_image: normalizedPreview || undefined,
      previewImageUrl: normalizedPreview || undefined,
    };

    console.log('[templates] Updating template', {
      _id: id,
      database: mongoose.connection.name,
      hasPreview: Boolean(normalizedPreview),
      previewType: normalizedPreview
        ? (normalizedPreview.startsWith('data:') ? 'dataURL' : 'path')
        : 'none',
      updateFields: Object.keys(updatePayload),
    });

    const template = await ProductTemplate.findByIdAndUpdate(id, updatePayload, { new: true });
    console.log('[templates] Template updated successfully', {
      _id: id,
      updatedAt: template?.updatedAt,
    });

    emitRealtimeEvent({
      type: 'template:updated',
      templateId: id,
      projectId: template?.projectId || template?.productId?.toString(),
      productId: template?.productId?.toString(),
      isGlobal: template?.isGlobal === true,
    });

    // Non-blocking: sync lightweight gallery metadata (no designData)
    if (template) setImmediate(() => syncGalleryMeta(template.toObject()));

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

// Unlink a template from a project without deleting the template document itself.
// Used by "Remove from project" in ProjectDetail — the template remains in the
// Template Gallery (if isGlobal) or as an orphaned record (if private).
router.patch('/:id/unlink', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const projectId = String((req.body as Record<string, unknown>).projectId || '').trim();

    if (!isValidObjectId(id)) {
      res.status(400).json({ success: false, error: 'Invalid template id' });
      return;
    }
    if (!projectId || !isValidObjectId(projectId)) {
      res.status(400).json({ success: false, error: 'Valid projectId is required' });
      return;
    }

    const template = await ProductTemplate.findById(id);
    if (!template) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }

    // Remove association fields so the template no longer appears in project queries.
    // isGlobal templates remain visible in the gallery via {isGlobal:true} filter.
    await ProductTemplate.findByIdAndUpdate(id, {
      $unset: { projectId: '', productId: '' },
    });

    // Remove from the project's template array.
    await Project.findByIdAndUpdate(
      projectId,
      { $pull: { templates: template._id } },
      { new: false }
    ).catch((err: Error) => {
      console.warn('[templates] Failed to pull from Project.templates on unlink', err.message);
    });

    console.log('[templates] Template unlinked from project', {
      templateId: id,
      projectId,
    });

    emitRealtimeEvent({
      type: 'template:updated',
      templateId: id,
      projectId,
      productId: template.productId?.toString(),
      isGlobal: template.isGlobal === true,
    });

    res.json({ success: true });
  } catch (error) {
    const err = error as Error;
    console.error('[templates] Template unlink failed', {
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

    const template = await ProductTemplate.findById(id);
    if (!template) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }

    await ProductTemplate.deleteOne({ _id: id });

    const projectIdCandidate = template.projectId || template.productId?.toString();
    if (projectIdCandidate && isValidObjectId(projectIdCandidate)) {
      await Project.findByIdAndUpdate(
        projectIdCandidate,
        { $pull: { templates: template._id } },
        { new: false }
      ).catch((err: Error) => {
        console.warn('[templates] Failed to update Project.templates array', err.message);
      });
    }

    emitRealtimeEvent({
      type: 'template:deleted',
      templateId: id,
      projectId: template.projectId || template.productId?.toString(),
      productId: template.productId?.toString(),
      isGlobal: template.isGlobal === true,
    });

    res.json({ success: true });
  } catch (error) {
    const err = error as Error;
    console.error('[templates] Template delete failed', {
      error: err.message,
      stack: err.stack,
    });
    res.status(400).json({ success: false, error: err.message });
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

    const savedTemplates: Array<{ _id: string; templateName: string; sourceId?: string }> = [];
    const errors: Array<{ templateName: string; error: string }> = [];

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
        const newTemplate = new ProductTemplate({
          ...(isProjectObjectId ? { productId: projectId } : { projectId: String(projectId) }),
          templateName: String(tpl.templateName).trim(),
          category: 'Other', // Default category
          preview_image: tpl.thumbnail || '',
          previewImageUrl: tpl.thumbnail || '',
          designData: {
            templateType: tpl.templateType,
            canvas: tpl.canvas,
            margin: tpl.margin,
            applicableFor: tpl.applicableFor,
            canvasJSON: (tpl as { canvasJSON?: string }).canvasJSON,
          },
          isActive: tpl.isPublic !== false,
          tags: [`migrated_${new Date().toISOString().split('T')[0]}`],
        });

        await newTemplate.save();
        savedTemplates.push({
          _id: String(newTemplate._id),
          templateName: newTemplate.templateName,
          sourceId: tpl.id,
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

// ─── Dedicated preview upload endpoint ───────────────────────────────────────
// POST /api/templates/:id/upload-preview
//
// Accepts either a multipart image file (field: "preview") or a JSON body with
// { preview_image: "<base64 data URL>" } and saves the image to disk.
// Returns the relative path that is stored in MongoDB.
//
// Used by the Designer Studio "Save" flow to decouple canvas capture from the
// full template save request (large canvases can exceed JSON body size limits).
const previewUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, or WEBP images allowed'));
  },
});

router.post('/:id/upload-preview', (req: Request, res: Response) => {
  previewUpload.single('preview')(req, res, async (err) => {
    if (err) {
      res.status(400).json({ success: false, error: (err as Error).message });
      return;
    }
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

      let previewPath: string;

      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (file) {
        // Multipart file upload — use stable templateId-based filename so re-uploads overwrite
        const ext = /jpeg/.test(file.mimetype) ? '.jpg' : '.png';
        const filename = `preview-${id}${ext}`;
        const filePath = path.join(templatesUploadsDir, filename);
        await fs.promises.writeFile(filePath, file.buffer);
        previewPath = `/uploads/templates/${filename}`;
        console.log(`[templates] ✓ upload-preview (file): ${filename}  (${Math.round(file.size / 1024)} KB)`);
      } else if (typeof (req.body as Record<string, any>).preview_image === 'string') {
        // JSON body with base64 data URL — use stable templateId-based filename
        previewPath = await persistPreviewImage(
          (req.body as Record<string, any>).preview_image as string,
          id
        );
      } else {
        res.status(400).json({ success: false, error: 'Provide a "preview" file or "preview_image" data URL' });
        return;
      }

      // Update MongoDB with the new path
      await ProductTemplate.findByIdAndUpdate(id, {
        preview_image: previewPath,
        previewImageUrl: previewPath,
      });
      // Also update TemplateGalleryMeta mirror (upsert so the record is created
      // even if syncGalleryMeta hasn't run yet for this template).
      await TemplateGalleryMeta.findOneAndUpdate(
        { templateId: id },
        { preview_image: previewPath, previewImageUrl: previewPath },
        { upsert: true },
      );

      // Invalidate in-memory gallery cache so the next GET /api/templates
      // rebuilds from MongoDB with the new preview URL.
      // Also update the file-based cache entry for this template so that
      // the new preview survives a backend restart / Render spin-down without
      // requiring a full gallery reload from Atlas.
      galleryCache = null;
      try {
        if (fs.existsSync(GALLERY_CACHE_FILE)) {
          const raw = fs.readFileSync(GALLERY_CACHE_FILE, 'utf-8');
          const parsed = JSON.parse(raw) as GalleryCache;
          if (parsed && Array.isArray(parsed.data)) {
            parsed.data = parsed.data.map((entry: Record<string, any>) => {
              const entryId = String(entry.templateId ?? entry._id ?? '');
              if (entryId === id) {
                return { ...entry, preview_image: previewPath, previewImageUrl: previewPath };
              }
              return entry;
            });
            saveGalleryCacheToFile(parsed);
          }
        }
      } catch {
        // Non-fatal — file cache patch failed, next gallery request will rebuild it.
      }

      console.log(`[templates] ✓ preview path persisted for ${id}: ${previewPath}`);
      res.json({ success: true, data: { previewPath } });
    } catch (routeErr) {
      console.error('[templates] upload-preview error:', (routeErr as Error).message);
      res.status(500).json({ success: false, error: (routeErr as Error).message });
    }
  });
});

// ─── Backfill endpoint ────────────────────────────────────────────────────────
// POST /api/templates/backfill-previews
//
// Scans ALL templates that have a base64 data URL stored in preview_image /
// previewImageUrl, saves each one as a file, and updates the DB record.
// Safe to run multiple times (already-migrated paths are skipped).
// ⚠️  Can be slow if many templates have large data URLs — run once after deploy.
router.post('/backfill-previews', async (_req: Request, res: Response) => {
  try {
    // Use a cursor with projection to avoid loading all large fields at once.
    // Process one document at a time so Atlas M0 doesn't time out on a full scan.
    const cursor = ProductTemplate.find({})
      .select('_id templateName preview_image previewImageUrl')
      .lean<Record<string, any>>()
      .cursor({ batchSize: 1 });

    const results: Array<{ id: string; name: string; path: string | null; error?: string }> = [];

    let scanned = 0;
    for await (const t of cursor) {
      scanned++;
      const raw: string = t.preview_image || t.previewImageUrl || '';
      if (!raw.startsWith('data:image/')) continue; // skip non-data-URL records

      try {
        const previewPath = await persistPreviewImage(raw, String(t.templateName || t._id));
        await ProductTemplate.findByIdAndUpdate(t._id, {
          preview_image: previewPath,
          previewImageUrl: previewPath,
        });
        await TemplateGalleryMeta.findOneAndUpdate(
          { templateId: t._id },
          { preview_image: previewPath, previewImageUrl: previewPath },
        );
        results.push({ id: String(t._id), name: String(t.templateName), path: previewPath });
        console.log(`[templates] ✓ backfill: ${t.templateName}  →  ${previewPath}`);
      } catch (bErr) {
        results.push({ id: String(t._id), name: String(t.templateName), path: null, error: (bErr as Error).message });
        console.warn(`[templates] ! backfill failed for ${t.templateName}:`, (bErr as Error).message);
      }
    }

    console.log(`[templates] backfill-previews done: scanned ${scanned}, migrated ${results.length}`);
    res.json({
      success: true,
      data: { processed: results.length, results },
    });
  } catch (err) {
    console.error('[templates] backfill-previews error:', (err as Error).message);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;
