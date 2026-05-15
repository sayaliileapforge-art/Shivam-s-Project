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
        return await sftpUploadFile(tmpPath, filename);
      } finally {
        await fs.promises.unlink(tmpPath).catch(() => {});
      }
    } else {
      // Local mode: write directly to uploads/templates/.
      const filePath = path.join(templatesUploadsDir, filename);
      await fs.promises.writeFile(filePath, buffer);
      const relativePath = `/uploads/templates/${filename}`;
      console.log(`[templates] ✓ Preview saved to disk: ${filename} (${Math.round(buffer.length / 1024)} KB) → ${relativePath}`);
      return relativePath;
    }
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

router.get('/', async (req: Request, res: Response) => {
  try {
    const requestedProductId = String(req.query.productId || '').trim();
    const requestedProjectId = String(req.query.projectId || '').trim();
    console.log('[templates] GET /api/templates', {
      productId: requestedProductId || null,
      projectId: requestedProjectId || null,
      query: req.query,
    });

    // Fetch templates by projectId or isGlobal (optional global flag)
    let filter: Record<string, any> = {};
    if (requestedProductId) {
      filter = {
        $or: [
          { productId: requestedProductId },
          { isGlobal: true }
        ]
      };
    } else if (requestedProjectId) {
      filter = {
        $or: [
          { projectId: requestedProjectId },
          { isGlobal: true }
        ]
      };
    }
    // Use lean() to avoid exceeding MongoDB M0's 32 MB in-memory limit when
    // templates contain large canvasJSON / base64 preview images.
    const rawTemplates = await ProductTemplate.find(filter).lean();
    const templates = rawTemplates.slice().sort(
      (a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    // Strip large binary fields from list responses.
    // • canvasJSON inside designData — fetched individually by GET /:id when needed.
    // • base64 data-URL preview images — they should have been persisted to disk;
    //   a base64 string in preview_image means the template predates the file-save
    //   pipeline. Strip it from the list response so the payload stays small; the
    //   individual GET /:id still returns the full value.
    const stripped = templates.map((t: any) => {
      const result: any = { ...t };

      // Strip canvasJSON from inside designData
      if (result.designData && typeof result.designData === 'object') {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { canvasJSON: _cj, canvasJson: _cj2, ...restDesignData } = result.designData;
        result.designData = restDesignData;
      }

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
    const uploadedImageUrl = file ? await persistMulterFile(file.path, file.filename) : '';
    const resolvedTemplateName = String(title || templateName || '').trim();
    const normalizedPreview = uploadedImageUrl || await persistPreviewImage(
      resolvePreviewImage({ preview_image, previewImageUrl, imageUrl }),
      resolvedTemplateName.replace(/\s+/g, '_') || 'preview',
    );

    if (!productId || !resolvedTemplateName || !normalizedPreview) {
      res.status(400).json({ success: false, error: 'productId, title/templateName, and image are required' });
      return;
    }
    const isProductObjectId = isValidObjectId(productId);

    if (userId && !isValidObjectId(String(userId))) {
      res.status(400).json({ success: false, error: 'Invalid userId' });
      return;
    }

    if (isProductObjectId) {
      const productExists = await Product.exists({ _id: productId });
      const projectExists = productExists ? null : await Project.exists({ _id: productId });
      if (!productExists && !projectExists) {
        res.status(404).json({ success: false, error: 'Product or Project not found for template mapping' });
        return;
      }
    }

    // Pre-check: avoid E11000 by detecting the duplicate before attempting to save
    if (isProductObjectId) {
      const existing = await ProductTemplate.findOne({
        productId,
        templateName: resolvedTemplateName,
      }).lean();
      if (existing) {
        res.status(200).json({ success: true, data: { ...existing, alreadyExists: true } });
        return;
      }
    }

    const template = new ProductTemplate({
      ...(isProductObjectId ? { productId } : { projectId: String(productId) }),
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
      productId,
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
        const { productId, title, templateName } = req.body;
        const resolvedName = String(title || templateName || '').trim();
        const existing = await ProductTemplate.findOne({
          productId,
          templateName: resolvedName,
        }).lean();
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

    const rawPreview = resolvePreviewImage(req.body as Record<string, any>)
      || existingTemplate.preview_image
      || existingTemplate.previewImageUrl
      || '';
    const templateHint = String(
      (req.body as any).templateName || (req.body as any).title ||
      existingTemplate.templateName || 'preview'
    ).replace(/\s+/g, '_');
    const normalizedPreview = await persistPreviewImage(rawPreview, templateHint);

    const updatePayload: Record<string, any> = {
      ...req.body,
      preview_image: normalizedPreview || undefined,
      previewImageUrl: normalizedPreview || undefined,
    };

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
    const cache = { data, expiresAt: Date.now() + 5 * 60 * 1000 };
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf-8');
    console.log(`✓ Gallery cache warmed: ${data.length} template(s)`);
  } catch (err) {
    console.warn('! warmGalleryCache failed (non-fatal):', (err as Error).message);
  }
}
