const path   = require('path');
const fs     = require('fs');
const multer = require('multer');

// ── Determine public base URL ───────────────────────────────────────
function baseUrl() {
  return (process.env.SERVER_BASE_URL || 'http://72.62.241.170').replace(/\/$/, '');
}

// ── Storage: uploads/images/ ────────────────────────────────────────
const imagesDir = path.join(__dirname, '..', 'uploads', 'images');
if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, imagesDir),
  filename:    (_req, file, cb) => {
    const ext    = path.extname(file.originalname) || '.jpg';
    const safe   = file.originalname
      .replace(/[^a-zA-Z0-9._\-]/g, '_')
      .replace(ext, '');
    cb(null, `${Date.now()}_${safe}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

/** Middleware for single image upload (field name: "image") */
exports.uploadSingleMiddleware = upload.single('image');

/** Middleware for bulk image upload (field name: "images", up to 50) */
exports.uploadMultipleMiddleware = upload.array('images', 50);

// ── POST /api/upload/image ──────────────────────────────────────────
exports.uploadImage = (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided.' });
  }
  const url = `${baseUrl()}/uploads/images/${req.file.filename}`;
  return res.status(201).json({
    url,
    filename:     req.file.filename,
    originalName: req.file.originalname,
    size:         req.file.size,
    mimeType:     req.file.mimetype,
  });
};

// ── POST /api/upload/images ─────────────────────────────────────────
exports.uploadImages = (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No image files provided.' });
  }
  const files = req.files.map((f) => ({
    url:          `${baseUrl()}/uploads/images/${f.filename}`,
    filename:     f.filename,
    originalName: f.originalname,
    size:         f.size,
    mimeType:     f.mimetype,
  }));
  return res.status(201).json({ files });
};
