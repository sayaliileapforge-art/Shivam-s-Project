/**
 * csvBinding.ts
 * Core CSV parsing, field extraction and variable-substitution utilities.
 * Used by the Designer Studio CSV data-binding feature.
 */

import Papa from "papaparse";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CsvRow = Record<string, string>;

export type CsvFieldType = "text" | "image" | "barcode";

export interface CsvField {
  key: string;          // raw header value, trimmed
  label: string;        // display label (capitalised)
  type: CsvFieldType;   // inferred from key name
}

export interface ParsedCsv {
  fields: CsvField[];
  rows: CsvRow[];
  fileName: string;
  errors: string[];
}

// ─── Field-type inference ─────────────────────────────────────────────────────

const IMAGE_KEY_PATTERNS = [
  /photo/i, /image/i, /img/i, /picture/i, /pic/i, /avatar/i, /logo/i, /icon/i,
];
const BARCODE_KEY_PATTERNS = [/barcode/i, /qr/i, /qrcode/i];

function inferFieldType(key: string): CsvFieldType {
  const normalised = key.trim().toLowerCase();
  if (BARCODE_KEY_PATTERNS.some((re) => re.test(normalised))) return "barcode";
  if (IMAGE_KEY_PATTERNS.some((re) => re.test(normalised))) return "image";
  return "text";
}

function toLabel(key: string): string {
  return key
    .trim()
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── CSV parsing ──────────────────────────────────────────────────────────────

/**
 * Parse a CSV File object. Returns a Promise resolving to {@link ParsedCsv}.
 */
export function parseCsvFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve) => {
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete(result) {
        const errors = result.errors.map((e) => e.message);

        // Reject files with no usable data after validation
        const rawFields = result.meta.fields ?? [];
        if (rawFields.length === 0) {
          resolve({ fields: [], rows: [], fileName: file.name, errors: ["CSV has no header row."] });
          return;
        }

        const fields: CsvField[] = rawFields
          .filter((k) => k.length > 0)
          .map((k) => ({ key: k, label: toLabel(k), type: inferFieldType(k) }));

        // Sanitise rows: ensure every field key exists (fill missing with "")
        const rows: CsvRow[] = (result.data as CsvRow[]).map((row) => {
          const clean: CsvRow = {};
          fields.forEach(({ key }) => {
            clean[key] = String(row[key] ?? "").trim();
          });
          return clean;
        });

        resolve({ fields, rows, fileName: file.name, errors });
      },
      error(err) {
        resolve({ fields: [], rows: [], fileName: file.name, errors: [err.message] });
      },
    });
  });
}

/**
 * Parse a raw CSV string (e.g. from clipboard or text area).
 */
export function parseCsvString(csvText: string, sourceName = "paste"): ParsedCsv {
  const result = Papa.parse<CsvRow>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const errors = result.errors.map((e) => e.message);
  const rawFields = result.meta.fields ?? [];

  if (rawFields.length === 0) {
    return { fields: [], rows: [], fileName: sourceName, errors: ["CSV has no header row."] };
  }

  const fields: CsvField[] = rawFields
    .filter((k) => k.length > 0)
    .map((k) => ({ key: k, label: toLabel(k), type: inferFieldType(k) }));

  const rows: CsvRow[] = (result.data as CsvRow[]).map((row) => {
    const clean: CsvRow = {};
    fields.forEach(({ key }) => {
      clean[key] = String(row[key] ?? "").trim();
    });
    return clean;
  });

  return { fields, rows, fileName: sourceName, errors };
}

// ─── Variable substitution helpers ───────────────────────────────────────────

/**
 * Replace `{{key}}` placeholders in a template string with values from a row.
 * Keys are matched case-insensitively.
 */
export function substituteVariables(
  template: string,
  row: CsvRow,
  fallback = ""
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, key) => {
    const normalised = key.trim().toLowerCase();
    const match = Object.entries(row).find(([k]) => k.trim().toLowerCase() === normalised);
    return match ? match[1] : fallback;
  });
}

/**
 * Build a `VariableRenderInput`-compatible map from a single CSV row.
 * Passes all row values as `userVariables`.
 */
export function rowToRenderInput(row: CsvRow): { userVariables: Record<string, string> } {
  return { userVariables: { ...row } };
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  missingFields: string[];
  warnings: string[];
}

/**
 * Check that all required variable keys exist in the CSV fields.
 * `requiredKeys` should be the set of `{{key}}` tokens found in the template.
 */
export function validateCsvFields(
  requiredKeys: string[],
  availableFields: CsvField[]
): ValidationResult {
  const available = new Set(availableFields.map((f) => f.key.toLowerCase()));
  const missing = requiredKeys.filter((k) => !available.has(k.toLowerCase()));
  const warnings: string[] = [];

  if (missing.length > 0) {
    warnings.push(
      `Template uses variables not found in CSV: ${missing.map((k) => `{{${k}}}`).join(", ")}`
    );
  }

  return { valid: missing.length === 0, missingFields: missing, warnings };
}

/**
 * Extract all `{{key}}` variable tokens used inside a Fabric canvas JSON string.
 */
export function extractTemplateVariables(canvasJson: string): string[] {
  const matches = canvasJson.matchAll(/\{\{([^}]+)\}\}/g);
  const keys = new Set<string>();
  for (const m of matches) {
    keys.add(m[1].trim().toLowerCase());
  }
  return Array.from(keys);
}

// ─── Sample CSV ───────────────────────────────────────────────────────────────

export const SAMPLE_CSV = `name,roll_no,class,phone,email,photo,barcode
Aanya Sharma,101,10-A,9876543210,aanya@example.com,https://i.pravatar.cc/150?img=1,101
Rohan Mehta,102,10-A,9876543211,rohan@example.com,https://i.pravatar.cc/150?img=2,102
Priya Nair,103,10-B,9876543212,priya@example.com,https://i.pravatar.cc/150?img=3,103
Kiran Patil,104,10-B,9876543213,kiran@example.com,https://i.pravatar.cc/150?img=4,104
Siddharth Joshi,105,10-C,9876543214,sid@example.com,https://i.pravatar.cc/150?img=5,105`;
