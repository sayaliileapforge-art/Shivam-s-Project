/**
 * CSV Service — read, validate and parse CSV files from disk.
 *
 * Uses csv-parse (synchronous API) which is safe inside a BullMQ worker
 * because the worker runs in a separate async task; blocking the event loop
 * briefly for CSV parsing is acceptable here.  For very large CSVs (> 100 MB)
 * consider switching to the streaming API.
 *
 * Field mapping:
 *   The `mapping` parameter is a plain object { csvHeader: variableName }.
 *   Example: { "Student Name": "Name", "Roll No": "rollNo" }
 *   Columns not present in the mapping are kept with their original header.
 */

import fs   from 'fs';
import { parse } from 'csv-parse/sync';
import { createLogger } from '../utils/logger';

const log = createLogger('CsvService');

export interface CsvParseResult {
  headers:  string[];
  rows:     Record<string, string>[];
  rowCount: number;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Validate that a CSV file is readable and has at least one data row.
 * Throws a descriptive Error on any validation failure so the job fails
 * early (before the expensive ZIP extraction) and the failure reason is
 * surfaced in the status API.
 */
export async function validateCsvFile(csvPath: string): Promise<void> {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(csvPath);
  } catch {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  if (stat.size === 0) {
    throw new Error('CSV file is empty (0 bytes)');
  }

  // Read only the first 8 KB — enough to validate headers and one row.
  const fd      = await fs.promises.open(csvPath, 'r');
  const sample  = Buffer.alloc(8_192);
  const { bytesRead } = await fd.read(sample, 0, 8_192, 0);
  await fd.close();

  const preview = sample.subarray(0, bytesRead).toString('utf-8');

  const rows: Record<string, string>[] = parse(preview, {
    columns:             true,
    skip_empty_lines:    true,
    trim:                true,
    bom:                 true,
    relax_column_count:  true,
    to:                  3, // parse at most 3 rows for validation
  });

  if (rows.length === 0) {
    throw new Error('CSV file has a header row but no data rows');
  }
  const headers = Object.keys(rows[0]);
  if (headers.length === 0) {
    throw new Error('CSV file has no column headers');
  }

  log.info(`CSV validated — headers: [${headers.join(', ')}]`);
}

/**
 * Parse a CSV file from disk and optionally remap column headers.
 *
 * @param csvPath  Absolute path to the CSV file on disk.
 * @param mapping  Optional field mapping { csvHeader → variableName }.
 *                 Columns absent from the mapping are kept as-is.
 */
export async function parseCsvFile(
  csvPath:  string,
  mapping:  Record<string, string> = {},
): Promise<CsvParseResult> {
  const content = await fs.promises.readFile(csvPath, 'utf-8');

  const rawRows: Record<string, string>[] = parse(content, {
    columns:          true,
    skip_empty_lines: true,
    trim:             true,
    bom:              true,
  });

  if (rawRows.length === 0) {
    log.warn('CSV has no data rows after parsing');
    return { headers: [], rows: [], rowCount: 0 };
  }

  const headers      = Object.keys(rawRows[0]);
  const hasMappings  = Object.keys(mapping).length > 0;
  const rows         = hasMappings ? rawRows.map((r) => applyMapping(r, mapping)) : rawRows;

  log.info(`Parsed ${rows.length} rows × ${headers.length} columns`);
  return { headers, rows, rowCount: rows.length };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Rename CSV columns according to the mapping.
 * Columns not present in the mapping are kept with their original name.
 */
function applyMapping(
  row:     Record<string, string>,
  mapping: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [csvCol, value] of Object.entries(row)) {
    const targetKey = mapping[csvCol] ?? csvCol;
    out[targetKey]  = value;
  }
  return out;
}
