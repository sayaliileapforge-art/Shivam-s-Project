/**
 * Name and filename normalisation utilities shared across the upload pipeline
 * and the BullMQ worker so matching logic is consistent everywhere.
 *
 * The same functions exist inline in the original uploads.ts route; they are
 * extracted here so the worker can reuse them without code duplication.
 */

import path from 'path';

/**
 * Core normaliser: lowercase, keep only a–z and 0–9, drop everything else
 * (spaces, underscores, hyphens, apostrophes, dots, …).
 *
 * Examples:
 *   "Vanshika Katiyar" → "vanshikakatiyar"
 *   "O'Brien"          → "obrien"
 *   "ravi_kumar"       → "ravikumar"
 */
export function normalize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Extract a normalised key from an image filename for name-based matching.
 *
 * Steps:
 *  1. Strip file extension
 *  2. Strip a leading roll-number / serial prefix (digits + optional separator)
 *  3. Run normalize()
 *
 * Examples:
 *   "145_Vanshika_Katiyar.jpg"  → "vanshikakatiyar"
 *   "145__vanshika_katiyar.jpg" → "vanshikakatiyar"
 *   "12_Ravi_Kumar.jpeg"        → "ravikumar"
 *   "vanshika_katiyar.jpg"      → "vanshikakatiyar"
 *   "Img_001.png"               → "img"  (no useful name)
 */
export function normalizeFilename(filename: string): string {
  const noExt   = path.basename(filename, path.extname(filename));
  // Drop leading roll/serial numbers, e.g. "145_", "12__", "2024-01_"
  const noPrefix = noExt.replace(/^\d+[_\s.\-]*/g, '');
  return normalize(noPrefix);
}

/**
 * Extract a normalised student/record name from a DataRecord variables object.
 * Checks common column name variations (CSV headers vary by school).
 */
export function getRecordName(vars: Record<string, unknown>): string {
  const raw = String(
    vars['Name']         ??
    vars['name']         ??
    vars['StudentName']  ??
    vars['studentName']  ??
    vars['student_name'] ??
    vars['FullName']     ??
    vars['fullName']     ??
    vars['full_name']    ??
    '',
  ).trim();
  return raw.toLowerCase();
}
