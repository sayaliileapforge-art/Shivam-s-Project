/**
 * Centralised Multer configuration.
 * All vendor-uploaded files (attachments, order images, CSV) are stored in
 * public/uploads/ so they are served under the /uploads URL prefix.
 */
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, uploadDir);
  },
  filename(_req, file, cb) {
    // Sanitise original name (strip special chars, keep extension)
    const ext  = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${Date.now()}-${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB per file
});

module.exports = upload;
