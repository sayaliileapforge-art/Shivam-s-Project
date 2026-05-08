/**
 * ZIP Service — stream-extract image files from a ZIP archive to disk.
 *
 * Why streaming?
 * -------------
 * `adm-zip` (used in the existing /zip route) loads the entire archive into
 * memory before processing — fine for small ZIPs but catastrophic for large
 * archives (500 MB+) that may contain thousands of photos.
 *
 * `unzipper.Parse()` is a Transform stream that reads entries one at a time
 * and pipes each one directly to a WriteStream on disk.  Peak memory usage
 * is proportional to a single image buffer, not the whole archive.
 *
 * Deduplication:
 * If two entries inside the ZIP share the same basename (e.g. photos from
 * different subdirectories), the second is renamed with a numeric suffix to
 * prevent silent overwrites.
 */

import fs       from 'fs';
import path     from 'path';
import unzipper from 'unzipper';
import { createLogger } from '../utils/logger';

const log = createLogger('ZipService');

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|bmp)$/i;

export interface ExtractedImage {
  /** Basename of the file as extracted (after dedup rename if needed). */
  filename: string;
  /** Absolute path of the extracted file on disk. */
  filePath: string;
}

/**
 * Stream-extract all image files from a ZIP archive to `destDir`.
 *
 * The function returns only after ALL file writes have completed, so callers
 * can immediately read the returned paths.
 *
 * @param zipPath   Absolute path to the source ZIP file.
 * @param destDir   Directory where images will be written (created if absent).
 * @returns         Array of extracted image descriptors sorted by filename.
 */
export async function extractImagesFromZip(
  zipPath:  string,
  destDir:  string,
): Promise<ExtractedImage[]> {
  await fs.promises.mkdir(destDir, { recursive: true });

  const images:        ExtractedImage[]   = [];
  const writePromises: Promise<void>[]    = [];
  const seenFilenames                     = new Set<string>();

  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(zipPath)
      .pipe(unzipper.Parse({ forceStream: true }))
      .on('entry', (entry: unzipper.Entry) => {
        const entryPath: string = entry.path;
        const entryType: string = entry.type; // 'File' | 'Directory'

        // Skip directories and non-image files.
        if (entryType !== 'File' || !IMAGE_EXT_RE.test(entryPath)) {
          entry.autodrain(); // drain and discard
          return;
        }

        const basename = path.basename(entryPath);

        // Deduplicate: suffix conflicting names with _1, _2, …
        let filename = basename;
        let counter  = 1;
        while (seenFilenames.has(filename)) {
          const ext  = path.extname(basename);
          filename   = `${path.basename(basename, ext)}_${counter}${ext}`;
          counter++;
        }
        seenFilenames.add(filename);

        const filePath = path.join(destDir, filename);
        images.push({ filename, filePath });

        // Pipe entry bytes directly to disk — no intermediate buffer.
        const writePromise = new Promise<void>((res, rej) => {
          entry
            .pipe(fs.createWriteStream(filePath))
            .on('finish', res)
            .on('error', rej);
        });
        writePromises.push(writePromise);
      })
      .on('close', () => {
        // Wait for all concurrent write streams to flush before resolving.
        Promise.all(writePromises).then(() => resolve()).catch(reject);
      })
      .on('error', reject);
  });

  log.info(`Extracted ${images.length} image(s) from "${path.basename(zipPath)}" → ${destDir}`);
  return images.sort((a, b) => a.filename.localeCompare(b.filename));
}
