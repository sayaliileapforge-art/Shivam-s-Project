import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Product from '../models/Product';

const router = Router();

const uploadsRoot = path.resolve(process.cwd(), 'uploads');
const imageUploadDir = path.join(uploadsRoot, 'products', 'images');
const videoUploadDir = path.join(uploadsRoot, 'products', 'videos');

for (const dir of [imageUploadDir, videoUploadDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const imageMimeTypes = ['image/jpeg', 'image/png', 'image/svg+xml'];
const videoMimeTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'videoFile') {
      cb(null, videoUploadDir);
      return;
    }
    cb(null, imageUploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 11,
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'images' && imageMimeTypes.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    if (file.fieldname === 'videoFile' && videoMimeTypes.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

const youtubePattern = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{6,}/i;
const instagramPattern = /^(https?:\/\/)?(www\.)?instagram\.com\/[\w\-.]+\/?/i;

function parseArrayField(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item));
      return [String(value)].filter(Boolean);
    } catch {
      return [String(value)].filter(Boolean);
    }
  }
  return [];
}

function buildMediaUrl(kind: 'images' | 'videos', filename: string): string {
  return `/uploads/products/${kind}/${filename}`;
}

function buildProductPayload(req: Request): Record<string, any> {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  const uploadedImages = (files?.images ?? []).map((file) => buildMediaUrl('images', file.filename));
  const uploadedVideo = files?.videoFile?.[0] ? buildMediaUrl('videos', files.videoFile[0].filename) : undefined;

  const existingImages = parseArrayField(req.body.images);
  const applicableFor = parseArrayField(req.body.applicableFor) as Array<'Vendor' | 'Client' | 'Public'>;

  const mergedImages = [...existingImages, ...uploadedImages].filter(Boolean);
  const thumbnailIndex = Number(req.body.thumbnailIndex);
  const thumbnailFromIndex = Number.isFinite(thumbnailIndex) ? mergedImages[thumbnailIndex] : undefined;
  const thumbnailImage = req.body.thumbnailImage || thumbnailFromIndex || mergedImages[0] || '';

  return {
    name: String(req.body.name || '').trim(),
    description: String(req.body.description || '').trim(),
    descriptionHtml: String(req.body.descriptionHtml || '').trim(),
    sku: String(req.body.sku || `SKU-${Date.now()}`).trim(),
    category: String(req.body.category || 'general').trim(),
    price: Number(req.body.price ?? req.body.publicPrice ?? 0),
    cost: req.body.cost !== undefined ? Number(req.body.cost) : undefined,
    stock: req.body.stock !== undefined ? Number(req.body.stock) : 0,
    visibility: String(req.body.visibility || 'public'),
    isVisible: String(req.body.isVisible ?? 'true') !== 'false',
    applicableFor,
    width: req.body.width !== undefined ? Number(req.body.width) : undefined,
    height: req.body.height !== undefined ? Number(req.body.height) : undefined,
    unit: req.body.unit ? String(req.body.unit) : undefined,
    image: mergedImages[0] || undefined,
    images: mergedImages,
    thumbnailImage,
    videoUrl: String(req.body.videoUrl || uploadedVideo || '').trim() || undefined,
    youtubeLink: String(req.body.youtubeLink || '').trim() || undefined,
    instagramLink: String(req.body.instagramLink || '').trim() || undefined,
    vendorPrice: Number(req.body.vendorPrice ?? 0),
    clientPrice: Number(req.body.clientPrice ?? 0),
    publicPrice: Number(req.body.publicPrice ?? req.body.price ?? 0),
  };
}

function validateProductPayload(payload: Record<string, any>): string | null {
  if (!payload.name) return 'Product name is required';
  if (!payload.images || payload.images.length === 0) return 'At least one product image is required';
  if (!payload.applicableFor || payload.applicableFor.length === 0) return 'Select at least one Applicable For option';
  if (payload.youtubeLink && !youtubePattern.test(payload.youtubeLink)) return 'Invalid YouTube URL';
  if (payload.instagramLink && !instagramPattern.test(payload.instagramLink)) return 'Invalid Instagram URL';
  return null;
}

// Get all products
router.get('/', async (req: Request, res: Response) => {
  try {
    const { category, visibility, applicableFor, isVisible = 'true' } = req.query;
    const filter: Record<string, any> = {};
    if (category) filter.category = category;
    if (visibility) filter.visibility = visibility;
    if (applicableFor) filter.applicableFor = { $in: [applicableFor] };
    if (isVisible !== 'all') filter.isVisible = String(isVisible) === 'true';

    const products = await Product.find(filter);
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Get product by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      res.status(404).json({ success: false, error: 'Product not found' });
      return;
    }
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Create product
router.post('/', upload.fields([{ name: 'images', maxCount: 10 }, { name: 'videoFile', maxCount: 1 }]), async (req: Request, res: Response) => {
  try {
    const payload = buildProductPayload(req);
    const validationError = validateProductPayload(payload);
    if (validationError) {
      res.status(400).json({ success: false, error: validationError });
      return;
    }

    const product = new Product(payload);
    await product.save();
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// Update product
router.put('/:id', upload.fields([{ name: 'images', maxCount: 10 }, { name: 'videoFile', maxCount: 1 }]), async (req: Request, res: Response) => {
  try {
    const payload = buildProductPayload(req);
    const validationError = validateProductPayload(payload);
    if (validationError) {
      res.status(400).json({ success: false, error: validationError });
      return;
    }

    const product = await Product.findByIdAndUpdate(req.params.id, payload, { new: true });
    if (!product) {
      res.status(404).json({ success: false, error: 'Product not found' });
      return;
    }
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// Delete product
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      res.status(404).json({ success: false, error: 'Product not found' });
      return;
    }
    res.json({ success: true, message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Upload only endpoint for media previews
router.post('/media/upload', upload.fields([{ name: 'images', maxCount: 10 }, { name: 'videoFile', maxCount: 1 }]), async (req: Request, res: Response) => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const images = (files?.images ?? []).map((file) => buildMediaUrl('images', file.filename));
    const videoUrl = files?.videoFile?.[0] ? buildMediaUrl('videos', files.videoFile[0].filename) : null;
    res.json({ success: true, data: { images, videoUrl } });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

export default router;
