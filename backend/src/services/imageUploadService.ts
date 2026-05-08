/**
 * Image Upload Service — upload a single image to the configured storage backend.
 *
 * Supports two backends (same configuration as the existing uploads.ts route):
 *
 *   SFTP mode  (SFTP_HOST is set): uploads to a remote Hostinger server
 *              via SSH2.  Uses fs.createReadStream() instead of buffering the
 *              entire file — memory-safe for large images.
 *
 *   Local mode (SFTP_HOST absent): copies the temp file to the local
 *              backend/public/uploads/ directory.
 *
 * The cleanFileName() helper produces the same sanitised names as the existing
 * route so URLs stored in MongoDB are consistent whether a file was uploaded
 * via the synchronous route or via a background job.
 */

import fs   from 'fs';
import path from 'path';
import { createLogger } from '../utils/logger';

const log = createLogger('ImageUploadService');

// ─── Storage configuration (mirrors uploads.ts) ──────────────────────────────
const sftpHost    = process.env.SFTP_HOST?.trim()        ?? '';
const sftpPort    = parseInt(process.env.SFTP_PORT       ?? '22', 10);
const sftpUser    = process.env.SFTP_USERNAME?.trim()    ?? '';
const sftpPass    = process.env.SFTP_PASSWORD?.trim()    ?? '';
const remoteBase  = (process.env.SFTP_REMOTE_DIR?.trim() ?? '/public_html/uploads').replace(/\/$/, '');
const publicBase  = (process.env.SFTP_PUBLIC_URL?.trim() ?? '').replace(/\/$/, '');

const backendLocalUrl = (
  process.env.BACKEND_URL?.trim() ?? `http://localhost:${process.env.PORT ?? '5000'}`
).replace(/\/$/, '');

const backendRootDir  = path.resolve(__dirname, '../..');
const localUploadsDir = process.env.UPLOADS_DIR?.trim()
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(backendRootDir, 'public', 'uploads');

export const sftpEnabled = Boolean(sftpHost && sftpUser && sftpPass && publicBase);

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Upload a single image from a temp file path to the configured storage.
 * Returns the public URL that should be stored in MongoDB.
 *
 * @param srcPath      Absolute path to the source file on disk.
 * @param originalName Original filename (used to derive the clean storage name).
 */
export async function uploadImage(srcPath: string, originalName: string): Promise<string> {
  const filename = cleanFileName(originalName);

  if (sftpEnabled) {
    return uploadViaSftp(srcPath, filename);
  }
  return saveToLocal(srcPath, filename);
}

/**
 * Sanitise a filename for safe, predictable storage — identical logic to
 * the cleanFileName() in the existing uploads.ts route.
 */
export function cleanFileName(originalName: string): string {
  const ext  = path.extname(originalName).toLowerCase() || '.jpg';
  const base = path.basename(originalName, ext)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '')
    .slice(0, 120);
  return `${base || 'image'}${ext}`;
}

// ─── Storage backends ─────────────────────────────────────────────────────

async function saveToLocal(srcPath: string, filename: string): Promise<string> {
  if (!fs.existsSync(localUploadsDir)) {
    fs.mkdirSync(localUploadsDir, { recursive: true });
  }
  const destPath = path.join(localUploadsDir, filename);
  await fs.promises.copyFile(srcPath, destPath);
  const url = `${backendLocalUrl}/uploads/${filename}`;
  log.debug(`Saved locally: ${destPath} → ${url}`);
  return url;
}

async function uploadViaSftp(srcPath: string, filename: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SftpClient = require('ssh2-sftp-client');
  const sftp = new SftpClient();
  await sftp.connect({ host: sftpHost, port: sftpPort, username: sftpUser, password: sftpPass });
  try {
    await sftp.mkdir(remoteBase, true).catch(() => {});
    const remotePath = `${remoteBase}/${filename}`;
    // Stream from disk — avoids buffering the entire image in memory.
    await sftp.put(fs.createReadStream(srcPath), remotePath);
    const url = `${publicBase}/uploads/${filename}`;
    log.debug(`SFTP uploaded: ${remotePath} → ${url}`);
    return url;
  } finally {
    await sftp.end().catch(() => {});
  }
}
