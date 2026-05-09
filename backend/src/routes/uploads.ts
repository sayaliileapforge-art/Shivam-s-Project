import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SftpClient = require('ssh2-sftp-client');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AdmZip = require('adm-zip');

const router = Router();

// ─── SFTP configuration ───────────────────────────────────────────────────────
const sftpHost   = process.env.SFTP_HOST?.trim()        ?? '';
const sftpPort   = parseInt(process.env.SFTP_PORT       ?? '22', 10);
const sftpUser   = process.env.SFTP_USERNAME?.trim()    ?? '';
const sftpPass   = process.env.SFTP_PASSWORD?.trim()    ?? '';
const remoteBase = (process.env.SFTP_REMOTE_DIR?.trim() ?? '/public_html/uploads').replace(/\/$/, '');
const publicBase = (process.env.SFTP_PUBLIC_URL?.trim() ?? '').replace(/\/$/, '');

const sftpEnabled = Boolean(sftpHost && sftpUser && sftpPass && publicBase);

if (sftpEnabled) {
  console.log(`[upload-images] SFTP mode → ${sftpHost}:${sftpPort}  remote: ${remoteBase}  public: ${publicBase}`);
} else {
  console.log('[upload-images] Local disk mode (SFTP_HOST not configured)');
}

// ─── Local disk fallback ──────────────────────────────────────────────────────
const backendRootDir  = path.resolve(__dirname, '../..');
// Store uploads under backend/public/uploads/ — Express serves this at /uploads
const localUploadsDir = process.env.UPLOADS_DIR?.trim()
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(backendRootDir, 'public', 'uploads');

if (!fs.existsSync(localUploadsDir)) fs.mkdirSync(localUploadsDir, { recursive: true });

// Absolute base URL used when building local-disk image URLs.
// Set BACKEND_URL in .env (e.g. http://localhost:5000) so stored URLs are
// always resolvable without relying on the Vite dev-proxy.
const backendLocalUrl = (
  process.env.BACKEND_URL?.trim()
  ?? `http://localhost:${process.env.PORT ?? '5000'}`
).replace(/\/$/, '');

if (!sftpEnabled) {
  console.log(`[upload-images] Local disk mode  dir: ${localUploadsDir}  url-base: ${backendLocalUrl}/uploads/`);
}

// ─── Multer ───────────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif|bmp)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files (JPEG, PNG, WEBP, GIF, BMP) are allowed'));
  },
});

function runMulter(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    upload.array('images', 1000)(req, res, (err) => {
      if (err) reject(err); else resolve();
    });
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Sanitise a filename for safe, predictable storage.
 * Rules: spaces → underscores; keep only a-z A-Z 0-9 _ . -; lowercase extension.
 * No timestamp prefix — the clean original name IS the identity, so the URL
 * stored in MongoDB always matches the file on disk / Hostinger.
 * If two files share the same sanitised name the second silently overwrites
 * the first (acceptable: re-uploading a student photo should replace the old one).
 */
function cleanFileName(originalName: string): string {
  const ext  = path.extname(originalName).toLowerCase() || '.jpg';
  const base = path.basename(originalName, ext)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '')
    .slice(0, 120);
  return `${base || 'image'}${ext}`;
}

async function saveToLocal(file: Express.Multer.File): Promise<string> {
  const filename = cleanFileName(file.originalname);
  const filePath = path.join(localUploadsDir, filename);
  await fs.promises.writeFile(filePath, file.buffer);
  const url = `${backendLocalUrl}/uploads/${filename}`;
  console.log(`[upload-images] File saved: ${filePath}  →  ${url}`);
  return url; // absolute URL — works without Vite proxy
}

/**
 * Upload a slice of files sequentially on ONE dedicated SFTP connection.
 * Sequential puts per connection are 100% reliable; parallelism comes from
 * running multiple connections concurrently (see uploadViaSftpPool).
 */
async function uploadSlice(
  files: Express.Multer.File[],
  baseIndex: number,
  results: string[],
): Promise<void> {
  const sftp = new SftpClient();
  await sftp.connect({ host: sftpHost, port: sftpPort, username: sftpUser, password: sftpPass });
  try {
    // Ensure remote directory exists (idempotent)
    await sftp.mkdir(remoteBase, true).catch(() => {});
    for (let i = 0; i < files.length; i++) {
      const file       = files[i];
      const filename   = cleanFileName(file.originalname);
      const remotePath = `${remoteBase}/${filename}`;
      await sftp.put(file.buffer, remotePath);
      const url = `${publicBase}/uploads/${filename}`;
      console.log(`[upload-images] SFTP uploaded: ${remotePath}  →  ${url}`);
      results[baseIndex + i] = url;
    }
  } finally {
    await sftp.end().catch(() => {});
  }
}

/**
 * Upload all files using a pool of SFTP connections.
 * Each connection handles an equal slice sequentially (safe + fast).
 * Pool size: min(5, number of files) — diminishing returns beyond 5 connections.
 */
async function uploadViaSftpPool(files: Express.Multer.File[]): Promise<string[]> {
  const POOL  = Math.min(5, files.length);
  const size  = Math.ceil(files.length / POOL);
  const results: string[] = new Array(files.length);

  await Promise.all(
    Array.from({ length: POOL }, (_, p) => {
      const start = p * size;
      const slice = files.slice(start, start + size);
      return slice.length ? uploadSlice(slice, start, results) : Promise.resolve();
    })
  );

  return results;
}

// ─── Route ────────────────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
  // Parse multipart — return JSON on multer error (not Express plain-text)
  try {
    await runMulter(req, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[upload-images] Multer error:', message);
    res.status(400).json({ success: false, error: `File parse error: ${message}` });
    return;
  }

  const files = (req.files as Express.Multer.File[]) ?? [];
  if (!files.length) {
    res.status(400).json({ success: false, error: 'No images uploaded' });
    return;
  }

  console.log(`[upload-images] Received ${files.length} file(s) — mode: ${sftpEnabled ? 'SFTP' : 'local'}`);

  try {
    let urls: string[];

    if (sftpEnabled) {
      urls = await uploadViaSftpPool(files);
    } else {
      urls = await Promise.all(files.map(saveToLocal));
    }

    console.log(`[upload-images] Upload complete — ${urls.length}/${files.length} file(s) saved successfully`);
    res.json({ success: true, urls });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[upload-images] Upload error:', message);
    res.status(500).json({ success: false, error: `Upload failed: ${message}` });
  }
});

// ─── ZIP Route ────────────────────────────────────────────────────────────────
// POST /api/upload-images/zip
//
// Accepts a single ZIP file (field: "zip"), extracts images, uploads each to
// Hostinger via SFTP, then auto-maps filenames → student names in MongoDB.
//
// Query / body params:
//   projectId  — MongoDB project ID (required for DB matching)
//   category   — data category, e.g. "student" (default: "student")
//
// Filename → name conversion:
//   "145__Vanshika_Katiyar.jpg"  →  "vanshika katiyar"
//   "12_Ravi_Kumar.jpeg"         →  "ravi kumar"
//
// Matching is done on the FRONTEND (same matchImages() engine as folder upload)
// so both paths are always in sync.
//
// Response:
//   { success, total, uploaded, files[{filename, url}], errors[] }

const zipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB ZIP max
  fileFilter: (_req, file, cb) => {
    const isZip =
      file.mimetype === 'application/zip' ||
      file.mimetype === 'application/x-zip-compressed' ||
      file.mimetype === 'application/octet-stream' ||
      /\.zip$/i.test(file.originalname);
    if (isZip) cb(null, true);
    else cb(new Error('Only ZIP files are allowed'));
  },
});

router.post('/zip', async (req: Request, res: Response): Promise<void> => {
  // ── 1. Parse ZIP upload ──────────────────────────────────────────────────
  try {
    await new Promise<void>((resolve, reject) => {
      zipUpload.single('zip')(req, res, (err) => { if (err) reject(err); else resolve(); });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[upload-images/zip] Multer error:', msg);
    res.status(400).json({ success: false, error: `File parse error: ${msg}` });
    return;
  }

  const zipFile = req.file;
  if (!zipFile) {
    res.status(400).json({ success: false, error: 'No ZIP file uploaded' });
    return;
  }

  // ── 2. Extract images from ZIP ───────────────────────────────────────────
  type ImageEntry = { filename: string; buffer: Buffer };
  let imageEntries: ImageEntry[];
  try {
    const zip = new AdmZip(zipFile.buffer) as {
      getEntries(): Array<{ isDirectory: boolean; entryName: string; name: string; getData(): Buffer }>;
    };
    imageEntries = zip.getEntries()
      .filter((e) =>
        !e.isDirectory &&
        // Only real image files — skip Mac resource-fork entries (._*) and __MACOSX/
        !e.entryName.startsWith('__MACOSX/') &&
        !e.name.startsWith('.') &&
        /\.(jpe?g|png|webp|gif|bmp)$/i.test(e.name)
      )
      .map((e) => ({
        // e.name is already the bare filename (no path), unlike e.entryName.
        // Using it directly avoids path.sep differences between Windows/Linux.
        filename: e.name,
        buffer:   e.getData(),
      }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ success: false, error: `ZIP extraction failed: ${msg}` });
    return;
  }

  if (!imageEntries.length) {
    res.status(400).json({ success: false, error: 'No image files found inside the ZIP' });
    return;
  }
  console.log(`[upload-images/zip] Extracted ${imageEntries.length} image(s)`);

  // ── 3. Upload all images to SFTP (or local disk) ─────────────────────────
  // Reuse the same pool uploader, wrapping raw buffers as minimal Multer File objects.
  const fakeFiles: Express.Multer.File[] = imageEntries.map((e) => ({
    fieldname: 'zip',
    originalname: e.filename,
    encoding: '7bit',
    mimetype: 'image/jpeg',
    buffer: e.buffer,
    size: e.buffer.length,
    stream: null as unknown as import('stream').Readable,
    destination: '',
    filename: e.filename,
    path: '',
  }));

  let uploadedUrls: string[];
  const errors: string[] = [];
  try {
    if (sftpEnabled) {
      try {
        uploadedUrls = await uploadViaSftpPool(fakeFiles);
        console.log(`[upload-images/zip] SFTP upload OK — ${uploadedUrls.length}/${imageEntries.length} image(s)`);
      } catch (sftpErr) {
        const sftpMsg = sftpErr instanceof Error ? sftpErr.message : String(sftpErr);
        console.error(`[upload-images/zip] SFTP failed (${sftpMsg}), falling back to local disk`);
        errors.push(`SFTP unavailable — saved locally instead: ${sftpMsg}`);
        uploadedUrls = await Promise.all(fakeFiles.map(saveToLocal));
        console.log(`[upload-images/zip] Local fallback OK — ${uploadedUrls.length} image(s) saved to disk`);
      }
    } else {
      uploadedUrls = await Promise.all(fakeFiles.map(saveToLocal));
      console.log(`[upload-images/zip] Local disk — ${uploadedUrls.length}/${imageEntries.length} image(s) saved`);
    }
    // Verify files actually exist on disk (local mode)
    if (!sftpEnabled) {
      uploadedUrls.forEach((url, i) => {
        const filename = path.basename(url);
        const diskPath = path.join(localUploadsDir, filename);
        const exists   = fs.existsSync(diskPath);
        console.log(`[upload-images/zip] Disk check: ${diskPath} — ${exists ? 'EXISTS' : 'MISSING'}`);
        if (!exists) errors.push(`${imageEntries[i].filename}: saved URL exists but file missing on disk`);
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[upload-images/zip] Upload error:', msg);
    res.status(500).json({ success: false, error: `Upload failed: ${msg}` });
    return;
  }

  // ── 4. Return extracted + uploaded file list ────────────────────────────
  // Matching is now done entirely on the frontend using the same matchImages()
  // engine as folder upload. This ensures identical matching behaviour for
  // both upload paths (no database-vs-memory discrepancy).
  const files: Array<{ filename: string; url: string }> = [];
  for (let i = 0; i < imageEntries.length; i++) {
    const url = uploadedUrls[i];
    if (!url) {
      errors.push(`${imageEntries[i].filename}: upload produced no URL`);
      continue;
    }
    files.push({ filename: imageEntries[i].filename, url });
  }

  console.log(`[upload-images/zip] ✅ Returning ${files.length} uploaded file(s) to frontend for matching`);

  res.json({
    success:  true,
    total:    imageEntries.length,
    uploaded: files.length,
    files,
    errors,
  });
});

export default router;

