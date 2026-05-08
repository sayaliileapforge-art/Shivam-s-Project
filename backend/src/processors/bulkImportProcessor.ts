/**
 * Bulk Import Job Processor
 *
 * This function is executed by the BullMQ Worker for every job in the
 * "bulk-import-queue".  It orchestrates the full import pipeline:
 *
 *   Step 1 ( 10%) — Validate CSV file
 *   Step 2 ( 30%) — Stream-extract images from ZIP
 *   Step 3 ( 50%) — Parse CSV and match rows to image filenames
 *   Step 4 ( 70%) — Upload matched images to SFTP / local disk
 *   Step 5 ( 80%) — Save DataRecords to MongoDB
 *   Step 6 ( 95%) — Clean up temp files
 *   Step 7 (100%) — Done
 *
 * Partial failure handling:
 *   If one image fails to upload, the row is still saved to the DB (without a
 *   photo URL) and the error is recorded in the job result.  The job itself
 *   only fails hard on unrecoverable errors (CSV invalid, ZIP unreadable, DB
 *   unreachable), triggering BullMQ's retry/backoff logic.
 *
 * Retry behaviour (configured on the queue in bulkImportQueue.ts):
 *   3 attempts with 2 s / 4 s / 8 s exponential backoff.
 *   Temp files are preserved between retries so a transient SFTP failure
 *   doesn't force a full re-upload of all images.
 *   On the final failed attempt, the worker event handler cleans temp files.
 *
 * Progress updates:
 *   job.updateProgress(n) writes `n` into Redis.  Callers poll
 *   GET /api/imports/:jobId/status to read the latest value.
 */

import { Job }    from 'bullmq';
import path       from 'path';
import os         from 'os';
import { createLogger }         from '../utils/logger';
import { cleanupDir }           from '../utils/fileCleanup';
import { validateCsvFile, parseCsvFile }    from '../services/csvService';
import { extractImagesFromZip }             from '../services/zipService';
import { uploadImage }                      from '../services/imageUploadService';
import { matchRowsWithImages, saveDataRecords } from '../services/dbService';

// ─── Job data & result types ──────────────────────────────────────────────

export interface BulkImportJobData {
  /** ID of the authenticated user who triggered the import (optional). */
  userId?: string;
  /** Absolute path to the temporary CSV file on disk. */
  csvFilePath: string;
  /** Absolute path to the temporary ZIP file on disk. */
  zipFilePath: string;
  /** MongoDB project ID that the records will be associated with. */
  projectId: string;
  /** Data category stored on each DataRecord, e.g. "student". */
  category: string;
  /**
   * Field mapping: maps CSV column headers to variable names stored in DB.
   * Example: { "Student Name": "Name", "Roll No": "rollNo" }
   * Columns not in the mapping are stored with their original header.
   * Pass an empty object to use CSV headers as-is.
   */
  mapping: Record<string, string>;
  /** UUID for this import run — used as temp directory name. */
  importId: string;
  /** Original CSV filename (for logging / status display). */
  originalCsvName: string;
  /** Original ZIP filename (for logging / status display). */
  originalZipName: string;
}

export interface BulkImportJobResult {
  /** Total CSV data rows (excluding header). */
  total:        number;
  /** Images successfully uploaded (SFTP or local). */
  uploaded:     number;
  /** CSV rows that were matched to an image file. */
  matched:      number;
  /** CSV rows with no matching image (saved without photo). */
  unmatched:    number;
  /** DataRecords saved to MongoDB. */
  savedRecords: number;
  /** Non-fatal per-item errors (image upload failures, partial DB inserts). */
  errors:       string[];
}

// ─── Processor ────────────────────────────────────────────────────────────

/**
 * Main processor function passed to new Worker(…, bulkImportProcessor, …).
 *
 * BullMQ calls this with the Job object.  Returning a value marks the job
 * "completed" and stores the value as job.returnvalue.  Throwing marks it
 * "failed" and triggers the retry/backoff logic.
 */
export async function bulkImportProcessor(
  job: Job<BulkImportJobData>,
): Promise<BulkImportJobResult> {
  const { csvFilePath, zipFilePath, projectId, category, mapping, importId } = job.data;
  const log     = createLogger(`Worker:${job.id}`);
  const errors: string[] = [];

  // The extracted images land in a sub-directory of the import's temp folder.
  const extractDir = path.join(os.tmpdir(), 'bulk-imports', importId, 'extracted');

  log.info(
    `Job started — importId=${importId} project=${projectId} ` +
    `csv=${job.data.originalCsvName} zip=${job.data.originalZipName}`,
  );

  // ── Step 1: Validate CSV ────────────────────────────────────────────────
  // Fail fast before the expensive ZIP extraction if the CSV is malformed.
  await job.updateProgress(10);
  log.info('Step 1/6: Validating CSV');
  await validateCsvFile(csvFilePath);

  // ── Step 2: Extract ZIP ─────────────────────────────────────────────────
  // Uses unzipper streaming — memory usage stays low even for 500 MB+ ZIPs.
  await job.updateProgress(30);
  log.info('Step 2/6: Extracting ZIP');
  const extractedImages = await extractImagesFromZip(zipFilePath, extractDir);
  log.info(`Extracted ${extractedImages.length} image(s)`);

  // ── Step 3: Parse CSV + match rows with images ──────────────────────────
  await job.updateProgress(50);
  log.info('Step 3/6: Parsing CSV and matching images');
  const { rows, rowCount } = await parseCsvFile(csvFilePath, mapping);
  const imageFilenames     = extractedImages.map((img) => img.filename);
  const imageFileMap       = new Map(extractedImages.map((img) => [img.filename, img.filePath]));
  const matches            = matchRowsWithImages(rows, imageFilenames);

  const matchedCount   = matches.filter((m) => m.matchedImage).length;
  const unmatchedCount = matches.length - matchedCount;
  log.info(`Matched ${matchedCount}/${rowCount} rows to images (${unmatchedCount} unmatched)`);

  // ── Step 4: Upload images ───────────────────────────────────────────────
  // Process one image at a time to avoid saturating SFTP connections.
  // Per-image failures are non-fatal: the row is saved without a photo URL.
  await job.updateProgress(70);
  log.info('Step 4/6: Uploading images');
  let uploadedCount = 0;
  const enrichedRows: Record<string, string>[] = [];

  for (const { row, matchedImage } of matches) {
    if (!matchedImage) {
      enrichedRows.push(row);
      continue;
    }

    const tempPath = imageFileMap.get(matchedImage);
    if (!tempPath) {
      enrichedRows.push(row);
      continue;
    }

    try {
      const photoUrl = await uploadImage(tempPath, matchedImage);
      enrichedRows.push({ ...row, photo: photoUrl });
      uploadedCount++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Image upload failed for "${matchedImage}": ${msg}`);
      log.error(`Upload failed for "${matchedImage}": ${msg}`);
      // Keep row without photo rather than aborting the whole import.
      enrichedRows.push(row);
    }
  }

  // ── Step 5: Save records to MongoDB ────────────────────────────────────
  await job.updateProgress(80);
  log.info('Step 5/6: Saving DataRecords to MongoDB');
  const { saved: savedRecords, errors: dbErrors } = await saveDataRecords(
    projectId,
    category,
    enrichedRows,
  );
  errors.push(...dbErrors);

  // ── Step 6: Clean up temp files ─────────────────────────────────────────
  // Remove the entire per-import temp directory (CSV, ZIP, extracted images).
  await job.updateProgress(95);
  log.info('Step 6/6: Cleaning up temp files');
  await cleanupDir(path.join(os.tmpdir(), 'bulk-imports', importId));

  // ── Done ─────────────────────────────────────────────────────────────────
  await job.updateProgress(100);

  const result: BulkImportJobResult = {
    total:        rowCount,
    uploaded:     uploadedCount,
    matched:      matchedCount,
    unmatched:    unmatchedCount,
    savedRecords,
    errors,
  };

  log.info(
    `Job completed — ${savedRecords} records saved, ${uploadedCount} images uploaded` +
    (errors.length ? `, ${errors.length} non-fatal errors` : ''),
  );

  return result;
}
