/**
 * Temp-file cleanup utilities used by the BullMQ worker.
 *
 * The worker writes uploaded files and extracted ZIP entries to a per-import
 * temp directory under OS.tmpdir()/bulk-imports/{importId}/.  These helpers
 * delete that tree on both success and failure, preventing disk leaks.
 *
 * fs.promises.rm({ recursive, force }) is available from Node 14.14+ and is
 * preferred over the older rimraf / fs-extra patterns.
 */

import fs from 'fs';
import { createLogger } from './logger';

const log = createLogger('FileCleanup');

/**
 * Recursively delete a directory and all its contents.
 * Silent on ENOENT — safe to call even if the directory was already removed.
 */
export async function cleanupDir(dirPath: string): Promise<void> {
  try {
    await fs.promises.rm(dirPath, { recursive: true, force: true });
    log.debug(`Deleted directory: ${dirPath}`);
  } catch (err) {
    // Non-fatal — log and continue so a cleanup error never masks the real job error.
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Failed to clean up directory "${dirPath}": ${msg}`);
  }
}

/**
 * Delete a single file.
 * Silent on ENOENT.
 */
export async function cleanupFile(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath);
    log.debug(`Deleted file: ${filePath}`);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== 'ENOENT') {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`Failed to clean up file "${filePath}": ${msg}`);
    }
  }
}
