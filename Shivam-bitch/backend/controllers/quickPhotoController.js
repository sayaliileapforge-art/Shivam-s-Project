const path = require('path');
const fs   = require('fs');
const multer = require('multer');
const QuickPhoto = require('../models/QuickPhoto');

const _baseUrl = () =>
  (process.env.SERVER_BASE_URL || 'http://72.62.241.170').replace(/\/$/, '');

// ── Upload directory ────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, '..', 'uploads', 'quick-photos');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ── Multer storage ──────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (req, _file, cb) => {
    const { schoolCode, className, rollNumber } = req.body;
    const padded = String(rollNumber || '0').padStart(3, '0');
    const safe   = (s) => String(s || '').replace(/[^a-zA-Z0-9_\-]/g, '_');
    const name   = `${safe(schoolCode)}_${safe(className)}_${padded}.jpg`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

/** Middleware: attach as router.post('/', authMiddleware, uploadMiddleware, uploadQuickPhoto) */
exports.uploadMiddleware = upload.single('image');

// ── POST /api/upload/quick-photo ────────────────────────────────────
exports.uploadQuickPhoto = async (req, res) => {
  try {
    const { schoolCode, className, rollNumber } = req.body;

    if (!schoolCode || !className || !rollNumber) {
      return res.status(400).json({
        error: 'schoolCode, className, and rollNumber are required.',
      });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required.' });
    }

    const padded   = String(rollNumber).padStart(3, '0');
    const imageUrl = `${_baseUrl()}/uploads/quick-photos/${req.file.filename}`;

    const photo = await QuickPhoto.create({
      schoolCode: schoolCode.trim(),
      className:  className.trim(),
      rollNumber: padded,
      imageUrl,
      imagePath: req.file.path,
      filename:  req.file.filename,
      uploadedBy: req.user?.id || null,
    });

    return res.status(201).json({
      id:         photo._id,
      schoolCode: photo.schoolCode,
      className:  photo.className,
      rollNumber: photo.rollNumber,
      imageUrl:   photo.imageUrl,
      filename:   photo.filename,
      createdAt:  photo.createdAt,
    });
  } catch (err) {
    console.error('[uploadQuickPhoto]', err);
    return res.status(500).json({ error: 'Failed to save photo.' });
  }
};

// ── GET /api/upload/quick-photos?schoolCode=X&className=Y ───────────
exports.getQuickPhotos = async (req, res) => {
  try {
    const { schoolCode, className } = req.query;

    const filter = {};
    if (schoolCode) filter.schoolCode = schoolCode.trim();
    if (className)  filter.className  = className.trim();

    const photos = await QuickPhoto.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    return res.json(photos);
  } catch (err) {
    console.error('[getQuickPhotos]', err);
    return res.status(500).json({ error: 'Failed to load photos.' });
  }
};
