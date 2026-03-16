const IMPORT_KEY = "vendor_imported_records";

export interface ImportedRecord {
  id: string;
  name: string;
  motherName?: string;
  fatherName?: string;
  motherPhone?: string;
  guardianName?: string;
  rollNo?: string;
  group?: string;
  phone?: string;
  [key: string]: string | undefined;
}

export interface ImportBatch {
  id: string;
  filename: string;
  importedAt: string;
  recordCount: number;
  records: ImportedRecord[];
}

export function loadImportBatches(): ImportBatch[] {
  try {
    const raw = localStorage.getItem(IMPORT_KEY);
    return raw ? (JSON.parse(raw) as ImportBatch[]) : [];
  } catch {
    return [];
  }
}

export function saveImportBatch(batch: ImportBatch): void {
  const batches = loadImportBatches();
  localStorage.setItem(IMPORT_KEY, JSON.stringify([batch, ...batches]));
}

export function loadAllImportedRecords(): ImportedRecord[] {
  return loadImportBatches().flatMap((b) => b.records);
}
