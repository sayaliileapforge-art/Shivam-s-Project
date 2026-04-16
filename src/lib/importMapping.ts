export interface ImportSystemField {
  key: string;
  label: string;
  required: boolean;
}

export const SKIP_MAPPING_VALUE = "__skip__";

const OTHER_FIELD: ImportSystemField = {
  key: "other",
  label: "Other",
  required: false,
};

export const CORE_IMPORT_FIELDS: ImportSystemField[] = [
  // Order enforced by FIELD_DISPLAY_ORDER — always shown in this sequence.
  { key: "photo",          label: "Profile Picture",             required: false },
  { key: "name",           label: "Full Name",                   required: true  },
  { key: "schoolCode",     label: "School Code",                 required: true  },
  { key: "admissionNo",   label: "Admission Number",            required: false },
  { key: "rollNo",         label: "Roll Number",                 required: false },
  { key: "classCourse",   label: "Class / Course",              required: false },
  { key: "section",        label: "Section / Stream / Semester", required: false },
  { key: "dob",            label: "Date of Birth",               required: false },
  { key: "fatherName",     label: "Father Name",                 required: false },
  { key: "motherName",     label: "Mother Name",                 required: false },
  { key: "fatherMobile",   label: "Father Mobile Number",        required: false },
  { key: "address",        label: "Address",                     required: false },
  { key: "schoolHouse",   label: "School House",                required: false },
  { key: "modeOfTransport", label: "Mode of Transport",         required: false },
  // Additional fields (shown in accordion)
  { key: "fatherWhatsapp", label: "Father WhatsApp Number",      required: false },
  { key: "bloodGroup",     label: "Blood Group",                 required: false },
];

/**
 * Canonical field display order for the mapping screen UI.
 * session_year is intentionally excluded — it is auto-generated, not mapped from CSV.
 */
export const FIELD_DISPLAY_ORDER: ReadonlyArray<string> = [
  "photo", "name", "schoolCode",
  "admissionNo", "rollNo",
  "classCourse", "section", "dob",
  "fatherName", "motherName", "fatherMobile",
  "address", "schoolHouse", "modeOfTransport",
] as const;

/**
 * Fields that are auto-generated at import time and must NOT appear
 * in the CSV column-mapping UI.
 */
export const AUTO_GENERATED_FIELDS = new Set<string>(["sessionYear"]);

/** Auto-generate academic session string based on the April-1 boundary. */
export function getSessionYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  // New session starts on April 1
  const april = new Date(year, 3, 1); // month index 3 = April
  return now >= april ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

export const FIELD_ALIAS_BY_KEY: Record<string, string[]> = {
  schoolCode: ["school code", "schoolcode"],
  admissionNo: ["admission no", "admission number", "admissionnumber", "admission id", "admissionid", "adm no", "admno", "admission_number"],
  rollNo: ["roll no", "roll number", "rollno", "roll_number"],
  name: ["name", "full name", "student name", "first name", "firstname", "full_name"],
  photo: ["student photo", "photo", "profile pic", "profile picture", "profilepic", "link", "photo url", "photo_url", "student_photo", "image", "image url", "image_url", "avatar", "profile image", "profile_image", "picture", "picture url", "picture_path", "picture_url", "profile_picture"],
  classCourse: ["class", "class course", "course", "classcourse", "grade", "class_course", "std", "standard"],
  section: ["section", "stream", "semester", "section stream", "stream semester", "sec", "section_stream_semester", "div", "division"],
  dob: ["date of birth", "dob", "birthdate", "birth date", "dateofbirth", "date_of_birth", "born"],
  fatherName: ["father name", "fathers name", "father_name"],
  motherName: ["mother name", "mothers name", "mother_name"],
  fatherMobile: ["father mobile", "father mobile number", "father phone", "father number", "father mob no", "fathermobno", "mobile", "phone", "father_mobile"],
  fatherWhatsapp: ["father whatsapp", "father whatsapp number", "whatsapp", "whatsapp number", "father whatsapp no"],
  address: ["address"],
  modeOfTransport: ["mode of transport", "transport mode", "transport", "mode", "transport_mode"],
  schoolHouse: ["school house", "house", "school_house"],
  bloodGroup: ["blood group", "bloodgroup"],
  other: ["other", "others"],
};

export function normalise(value: string): string {
  return String(value || "").toLowerCase().replace(/[\s_-]/g, "");
}

export function sanitizeCell(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function isMappedColumn(value?: string): boolean {
  return Boolean(value && value !== SKIP_MAPPING_VALUE && value !== "__none__");
}

export function isSkippedColumn(value?: string): boolean {
  return value === SKIP_MAPPING_VALUE || value === "__none__";
}

function canonicalCoreKeyFromHeader(header: string): string | null {
  const normalized = normalise(header);
  for (const field of CORE_IMPORT_FIELDS) {
    const aliases = [field.key, field.label, ...(FIELD_ALIAS_BY_KEY[field.key] ?? [])];
    if (aliases.some((alias) => normalise(alias) === normalized)) {
      return field.key;
    }
  }
  return null;
}

export function buildProjectFields(headers: string[]): ImportSystemField[] {
  const coreKeySet = new Set(CORE_IMPORT_FIELDS.map((f) => normalise(f.key)));
  const seen = new Set(coreKeySet);

  // Dynamic fields: CSV headers that don't map to any core field
  const dynamicFields: ImportSystemField[] = headers
    .map((header) => String(header || "").trim())
    .filter(Boolean)
    .filter((header) => {
      const canonical = canonicalCoreKeyFromHeader(header);
      if (canonical) return false;
      const normalized = normalise(header);
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .map((header) => ({ key: header, label: header, required: false }));

  // Apply FIELD_DISPLAY_ORDER: ordered core fields first, then remaining core, then dynamic
  const orderedCore: ImportSystemField[] = [];
  const coreByKey = new Map(CORE_IMPORT_FIELDS.map((f) => [f.key, f]));

  for (const key of FIELD_DISPLAY_ORDER) {
    const field = coreByKey.get(key);
    if (field) orderedCore.push(field);
  }
  // Append any core fields not in FIELD_DISPLAY_ORDER (e.g. fatherWhatsapp, bloodGroup)
  for (const field of CORE_IMPORT_FIELDS) {
    if (!FIELD_DISPLAY_ORDER.includes(field.key)) {
      orderedCore.push(field);
    }
  }

  return [...orderedCore, ...dynamicFields, OTHER_FIELD];
}

function enforceMutualExclusion(mapping: Record<string, string>): Record<string, string> {
  const next = { ...mapping };
  const hasAdmission = isMappedColumn(next.admissionNo);
  const hasRoll = isMappedColumn(next.rollNo);

  if (hasAdmission && hasRoll) {
    delete next.rollNo;
  }

  return next;
}

export function normalizeMapping(mapping: Record<string, string>, fields: ImportSystemField[]): Record<string, string> {
  const normalized: Record<string, string> = {};
  const usedColumns = new Set<string>();

  for (const field of fields) {
    const selected = mapping[field.key];

    if (isSkippedColumn(selected)) {
      normalized[field.key] = SKIP_MAPPING_VALUE;
      continue;
    }

    if (!isMappedColumn(selected)) continue;

    const column = String(selected);
    if (usedColumns.has(column)) continue;

    usedColumns.add(column);
    normalized[field.key] = column;
  }

  return enforceMutualExclusion(normalized);
}

export function autoMap(headers: string[], fields: ImportSystemField[]): Record<string, string> {
  const mapping: Record<string, string> = {};

  for (const field of fields) {
    if (field.key === OTHER_FIELD.key) continue;

    const aliases = [field.key, field.label, ...(FIELD_ALIAS_BY_KEY[field.key] ?? [])];
    const match = headers.find((header) => {
      const normalizedHeader = normalise(header);
      return aliases.some((alias) => normalise(alias) === normalizedHeader);
    });

    if (match) {
      mapping[field.key] = match;
    }
  }

  return normalizeMapping(mapping, fields);
}

export function getDuplicateMappedColumns(mapping: Record<string, string>): string[] {
  const counts: Record<string, number> = {};

  for (const value of Object.values(mapping)) {
    if (!isMappedColumn(value)) continue;
    counts[value] = (counts[value] ?? 0) + 1;
  }

  return Object.keys(counts).filter((key) => counts[key] > 1);
}

export function getSelectableHeaders(headers: string[], mapping: Record<string, string>, fieldKey: string): string[] {
  const selectedByOthers = new Set(
    Object.entries(mapping)
      .filter(([key, value]) => key !== fieldKey && isMappedColumn(value))
      .map(([, value]) => String(value))
  );

  return headers.filter((header) => !selectedByOthers.has(header));
}

function getRowValueByAliases(row: Record<string, string>, aliases: string[]): string {
  for (const key of Object.keys(row)) {
    const normalizedKey = normalise(key);
    if (aliases.some((alias) => normalise(alias) === normalizedKey)) {
      return sanitizeCell(row[key]);
    }
  }
  return "";
}

export function mapRowToRecord(
  row: Record<string, string>,
  fields: ImportSystemField[],
  mapping: Record<string, string>
): Record<string, string> {
  const rec: Record<string, string> = {};

  for (const field of fields) {
    const mappedColumn = mapping[field.key];
    if (!isMappedColumn(mappedColumn)) continue;
    rec[field.key] = sanitizeCell(row[mappedColumn]);
  }

  const firstName = getRowValueByAliases(row, ["first name", "firstname"]);
  const lastName = getRowValueByAliases(row, ["last name", "lastname"]);
  const mergedName = [firstName, lastName].filter(Boolean).join(" ").trim();

  // Name is the only persisted name field. If both first/last exist in source,
  // they are merged into Name. lastName is never stored separately.
  if (!rec.name && mergedName) {
    rec.name = mergedName;
  } else if (mergedName && (rec.name === firstName || rec.name === lastName)) {
    rec.name = mergedName;
  }

  // Fallback ID: prefer admission number; fall back to roll number.
  rec.finalId = sanitizeCell(rec.admissionNo) || sanitizeCell(rec.rollNo) || "";

  // Session year is always auto-generated — never taken from CSV.
  rec.sessionYear = getSessionYear();

  return rec;
}

export function validateMapping(fields: ImportSystemField[], mapping: Record<string, string>): string[] {
  const errors: string[] = [];

  for (const field of fields.filter((f) => f.required)) {
    if (!isMappedColumn(mapping[field.key])) {
      errors.push(`Required field "${field.label}" is not mapped.`);
    }
  }

  const hasAdmission = isMappedColumn(mapping.admissionNo);
  const hasRoll = isMappedColumn(mapping.rollNo);
  if (!hasAdmission && !hasRoll) {
    errors.push('Either "Admission Number" or "Roll Number" must be mapped.');
  }

  const duplicates = getDuplicateMappedColumns(mapping);
  if (duplicates.length > 0) {
    errors.push(`Duplicate column mapping found: ${duplicates.join(", ")}`);
  }

  return errors;
}

export function getVisiblePreviewFields(
  fields: ImportSystemField[],
  records: Array<Record<string, unknown>>,
  mapping: Record<string, string>
): ImportSystemField[] {
  const alwaysVisible = new Set(["name", "schoolCode"]);

  return fields
    .filter((field) => field.key !== "other" && isMappedColumn(mapping[field.key]))
    .filter((field) => {
      if (alwaysVisible.has(field.key)) return true;

      return records.some((record) => {
        const value = record[field.key];
        if (value === null || value === undefined) return false;
        return String(value).trim().length > 0;
      });
    });
}
