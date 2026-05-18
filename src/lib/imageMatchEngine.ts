/**
 * imageMatchEngine.ts — Robust image-to-student matching engine.
 *
 * Matching priority per image (descending score):
 *  1. Exact school-code + admission/roll number            → score 100
 *  2. Exact full name (normalised filename ⊇ record name) → score 95
 *  3. Partial: firstName exact AND lastName exact          → score 85
 *  4. Fuzzy:   firstName sim ≥ 80% AND lastName sim ≥ 80% → score 80–94
 *
 * Duplicate handling:
 *  – All records that score ≥ 80 are kept as candidates.
 *  – Best unclaimed candidate → matched[].
 *  – If there were other candidates (multiple matches) the image is also
 *    added to duplicates[] so the user can review the applied choice.
 *  – "Katiyar" alone cannot match — BOTH first AND last tokens are required.
 *
 * 1-student = 1-image: if the best candidate is already claimed by a
 * higher-scoring file, the current image goes to unmatched[] with a reason.
 *
 * Unmatched fallback: strip school-code/number prefix, retry name-only.
 */

// ────────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────────

export interface MatchedImage {
  userId: string;
  name: string;
  filename: string;
  dataUrl: string;
  confidenceScore: number;   // 0-100
  matchType: MatchType;
}

export interface DuplicateImage {
  filename: string;
  appliedName: string;
  appliedUserId: string;
  confidenceScore: number;
  /** All candidates that scored ≥ threshold, sorted best-first. */
  allMatches: Array<{ userId: string; name: string; score: number; matchType: MatchType }>;
  reason: string;
}

export interface UnmatchedImage {
  filename: string;
  reason: string;
  normalizedFilename: string;
}

export interface BulkMatchResult {
  matched: MatchedImage[];
  duplicates: DuplicateImage[];
  unmatched: UnmatchedImage[];
}

export type MatchType = 'exact_filename' | 'exact_id' | 'exact_name' | 'partial_name' | 'fuzzy' | 'none';

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

/** Minimum score (0-100) to consider a record as a candidate. */
const MATCH_THRESHOLD = 80;

const SCORE_EXACT_FILENAME = 110;
const SCORE_EXACT_ID       = 100;
const SCORE_EXACT_NAME     = 95;
const SCORE_PARTIAL        = 85;

// ────────────────────────────────────────────────────────────────────────────
// Normalization
// ────────────────────────────────────────────────────────────────────────────

/**
 * Strip extension, lowercase, remove all separators and whitespace.
 * Used for ID-field comparison.
 * "145.0" → "145"  |  "Adm. No" → "admno"
 */
function normalizeId(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\.[a-z]{2,5}$/i, '')   // strip file extension
    .replace(/\.0+$/, '')             // Excel artifact: "145.0" → "145"
    .replace(/[\s_\-\.]+/g, '');      // collapse separators
}

/**
 * Lowercase, strip ALL digits and separators.
 * Used for name comparison so numbers don't bleed into name tokens.
 * "Aaradhya123" → "aaradhya"
 */
function normalizeName(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[0-9]+/g, '')
    .replace(/[\s_\-\.]+/g, '');
}

/** Normalize a CSV column key for loosy lookup. */
function normKey(k: string): string {
  return k.toLowerCase().trim().replace(/[_.\s.]+/g, ' ');
}

/**
 * Normalise a filename for the exact photo-column key comparison.
 * Strips invisible characters that Excel/Windows CSV exports introduce:
 *   \\r (Windows CRLF), \\n, \\t, non-breaking space (\\u00a0), BOM (\\ufeff).
 * Also applies Unicode NFC normalisation and lowercases.
 * Both the CSV column value AND the uploaded filename go through this, so
 * any invisible-character mismatch is eliminated.
 */
function normalizePhotoKey(filename: string): string {
  let s = String(filename).trim().replace(/[\r\n\t\u00a0\ufeff]/g, '');
  try { s = s.normalize('NFC'); } catch { /* ignore in unsupported env */ }
  return s.toLowerCase();
}

// ────────────────────────────────────────────────────────────────────────────
// Levenshtein-based similarity  (0-1)
// ────────────────────────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1] ? dp[j - 1] : Math.min(dp[j - 1], dp[j], prev) + 1;
      dp[j - 1] = prev;
      prev = val;
    }
    dp[b.length] = prev;
  }
  return dp[b.length];
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

// ────────────────────────────────────────────────────────────────────────────
// Record field accessor (column-name-agnostic)
// ────────────────────────────────────────────────────────────────────────────

type AnyRecord = Record<string, unknown>;

const META_KEYS = new Set(['id', 'projectId', 'category', 'photo', 'barcode']);

/**
 * Read a field from a record by trying multiple key spellings.
 * Returns the normalizeId-d value, or '' if not found.
 */
function getField(rec: AnyRecord, ...keys: string[]): string {
  for (const k of keys) {
    const val = rec[k];
    if (val !== undefined && val !== null && val !== '') return normalizeId(String(val));
    const nk = normKey(k);
    const entry = Object.entries(rec).find(([rk]) => normKey(rk) === nk);
    if (entry?.[1] !== undefined && entry[1] !== null && entry[1] !== '')
      return normalizeId(String(entry[1]));
  }
  return '';
}

function getName(rec: AnyRecord): string {
  const nameKeys = [
    'Name', 'name', 'full_name', 'Full Name', 'fullName', 'FullName',
    'Student Name', 'student_name', 'studentName', 'StudentName',
    'student full name', 'Student Full Name', 'full name', 'id',
  ];

  for (const key of nameKeys) {
    const directValue = rec[key];
    if (directValue !== undefined && directValue !== null && String(directValue).trim() !== '') {
      return String(directValue).trim();
    }

    const normalizedKey = normKey(key);
    const entry = Object.entries(rec).find(([recordKey]) => normKey(recordKey) === normalizedKey);
    if (entry?.[1] !== undefined && entry[1] !== null && String(entry[1]).trim() !== '') {
      return String(entry[1]).trim();
    }
  }

  return String(rec['id'] ?? '').trim();
}

// ────────────────────────────────────────────────────────────────────────────
// Filename decomposition
// ────────────────────────────────────────────────────────────────────────────

interface FileParts {
  schoolCode: string;
  rollOrAdmNo: string;
  /** Full name fragment (all name tokens joined, digits stripped). */
  nameFragment: string;
  /** First name token (digits stripped). */
  firstName: string;
  /** Last name token (digits stripped). */
  lastName: string;
  /** True when schoolCode + rollOrAdmNo are both non-empty. */
  hasId: boolean;
}

/**
 * Decompose a filename into structured parts.
 *
 * Format: <schoolCode>_<rollOrAdm>_<FirstName>_[middle_...]_<LastName>.ext
 *   e.g.  145_3_Yash_Katiyar.jpg
 *         145_3_Aaradhya_Kumari_Katiyar.jpg  (middle ignored for partial match)
 *
 * Normalisation:
 *   - Extensions stripped
 *   - IDs: collapse all non-alphanumeric, strip trailing .0 artifacts
 *   - Names: strip digits, strip separators, lowercase
 */
function decompose(filename: string): FileParts {
  let decoded = filename;
  try { decoded = decodeURIComponent(filename); } catch { /* keep original */ }

  const basename = decoded.replace(/\.[^.]+$/, '');
  const tokens = basename.toLowerCase().match(/[a-z0-9]+/g) ?? [];

  const schoolCode  = normalizeId(tokens[0] ?? '');
  const rollOrAdmNo = normalizeId(tokens[1] ?? '');

  const rawNameParts = tokens.slice(2);
  const firstName  = normalizeName(rawNameParts[0] ?? '');
  const lastName   = normalizeName(rawNameParts.length > 1 ? rawNameParts[rawNameParts.length - 1] : '');
  const nameFragment = normalizeName(rawNameParts.join(' '));   // full name, digits stripped

  const hasId = schoolCode.length > 0 && rollOrAdmNo.length > 0;

  return { schoolCode, rollOrAdmNo, nameFragment, firstName, lastName, hasId };
}

// ────────────────────────────────────────────────────────────────────────────
// Per-record scoring
// ────────────────────────────────────────────────────────────────────────────

interface Candidate {
  rec: AnyRecord;
  score: number;
  matchType: MatchType;
}

/**
 * Score a single record against the decomposed filename.
 * Returns null if the score is below MATCH_THRESHOLD.
 *
 * Priority:
 *  1. Exact ID (schoolCode + roll/adm no)               → 100
 *  2. Exact full name (normalised name fragment matches) → 95
 *  3. Partial: firstName exact AND lastName exact        → 85
 *  4. Fuzzy:   firstName ≥ 80% AND lastName ≥ 80%       → average * 100
 */
function scoreRecord(rec: AnyRecord, fp: FileParts): Candidate | null {
  // ── 1. Exact ID ────────────────────────────────────────────────────────────
  if (fp.hasId) {
    const recSchool = getField(rec,
      'school_code', 'School Code', 'schoolCode', 'school_id', 'Sch Code', 'sch_code');
    const recRoll = getField(rec,
      'roll_number', 'Roll Number', 'roll_no', 'Roll No', 'rollNumber', 'rollNo', 'Roll_No');
    const recAdm = getField(rec,
      'admission_number', 'Admission Number', 'admission_no', 'Admission No',
      'adm_no', 'admNo', 'admissionNumber', 'Adm. No');

    const schoolMatch = recSchool !== '' && recSchool === fp.schoolCode;
    const idMatch =
      (recRoll !== '' && recRoll === fp.rollOrAdmNo) ||
      (recAdm  !== '' && recAdm  === fp.rollOrAdmNo);

    if (schoolMatch && idMatch) return { rec, score: SCORE_EXACT_ID, matchType: 'exact_id' };

    // Value-scan fallback: check if BOTH values appear anywhere in the record
    const vals = Object.entries(rec)
      .filter(([k]) => !META_KEYS.has(k))
      .map(([, v]) => normalizeId(String(v ?? '')))
      .filter((v) => v.length > 0 && v.length <= 20);
    if (
      vals.includes(fp.schoolCode) &&
      vals.includes(fp.rollOrAdmNo) &&
      fp.schoolCode !== fp.rollOrAdmNo
    ) return { rec, score: SCORE_EXACT_ID, matchType: 'exact_id' };
  }

  // ── 2. Exact full name ─────────────────────────────────────────────────────
  if (fp.nameFragment.length >= 3) {
    const recName = normalizeName(getName(rec));
    if (recName.length >= 3 && (fp.nameFragment === recName || fp.nameFragment.includes(recName))) {
      return { rec, score: SCORE_EXACT_NAME, matchType: 'exact_name' };
    }
  }

  // ── 3 & 4. Name matching (partial or fuzzy) ────────────────────────────────
  // Require BOTH firstName AND lastName tokens — single-token matches are rejected.
  if (fp.firstName.length < 2 || fp.lastName.length < 2) return null;

  const recParts = getName(rec).trim().split(/\s+/).filter(Boolean);
  if (recParts.length < 2) return null;

  const recFirst = normalizeName(recParts[0]);
  const recLast  = normalizeName(recParts[recParts.length - 1]);
  if (recFirst.length < 2 || recLast.length < 2) return null;

  const firstSim = similarity(recFirst, fp.firstName);
  const lastSim  = similarity(recLast,  fp.lastName);

  // Both components must individually meet the 80% floor
  const floor = MATCH_THRESHOLD / 100;
  if (firstSim < floor || lastSim < floor) return null;

  // Exact partial
  if (firstSim === 1 && lastSim === 1) {
    return { rec, score: SCORE_PARTIAL, matchType: 'partial_name' };
  }

  // Fuzzy (both components >= 80%)
  const score = Math.round((firstSim + lastSim) / 2 * 100);
  if (score < MATCH_THRESHOLD) return null;
  return { rec, score, matchType: 'fuzzy' };
}

// ────────────────────────────────────────────────────────────────────────────
// Main engine
// ────────────────────────────────────────────────────────────────────────────

export interface ImageFile {
  name: string;
  dataUrl: string;
}

/**
 * Read the explicit photo-filename column value from a record.
 * Returns e.g. "101_syali.jpg" or '' if no photo column exists.
 */
function getPhotoColumnValue(rec: AnyRecord): string {
  const photoKeys = [
    'Profile Picture', 'profile_picture', 'ProfilePicture', 'profilePicture',
    'Profile Pic', 'profile_pic', 'ProfilePic',
    'Photo', 'photo', 'Photo File', 'photo_file', 'PhotoFile', 'photoFile',
    'Filename', 'filename', 'File Name', 'file_name', 'FileName',
    'Photo Filename', 'photo_filename', 'Image', 'image', 'Image File', 'image_file',
  ];
  for (const k of photoKeys) {
    const v = rec[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  const photoPattern = /^(profile\s*pic(ture)?|photo|photo\s*file|photo\s*filename|filename|file\s*name|image|image\s*file)$/i;
  for (const [k, v] of Object.entries(rec)) {
    if (photoPattern.test(k.trim()) && v) return String(v).trim();
  }
  return '';
}

export function matchImages(
  imageFiles: ImageFile[],
  records: AnyRecord[],
): BulkMatchResult {
  const matched:    MatchedImage[]   = [];
  const duplicates: DuplicateImage[] = [];
  const unmatched:  UnmatchedImage[] = [];

  // userId → filename of the image that claimed it
  const claimedBy = new Map<string, string>();

  // Build exact photo-filename index (if CSV has a Photo/Filename column)
  // Key = normalizePhotoKey(value) so invisible chars/casing can't cause false misses.
  const photoIndex = new Map<string, AnyRecord>();
  let hasPhotoColumn = false;
  for (const rec of records) {
    const photoFile = getPhotoColumnValue(rec);
    if (photoFile) {
      hasPhotoColumn = true;
      photoIndex.set(normalizePhotoKey(photoFile), rec);
    }
  }

  for (const img of imageFiles) {
    const fp = decompose(img.name);
    const lookupKey = normalizePhotoKey(img.name);

    console.debug('[imageMatch] Processing', {
      filename:    img.name,
      lookupKey,
      schoolCode:  fp.schoolCode,
      rollOrAdmNo: fp.rollOrAdmNo,
      firstName:   fp.firstName,
      lastName:    fp.lastName,
      nameFragment: fp.nameFragment,
    });

    // ── Priority 0: Exact photo-filename column match ─────────────────────
    // When the CSV has a Photo/Filename column, ONLY accept exact filename
    // matches (both sides normalised via normalizePhotoKey).
    if (hasPhotoColumn) {
      const exactRec = photoIndex.get(lookupKey) ?? null;
      if (exactRec) {
        const recId   = String(exactRec['id'] ?? '');
        const recName = getName(exactRec);
        claimedBy.set(recId, img.name);
        matched.push({
          userId:          recId,
          name:            recName,
          filename:        img.name,
          dataUrl:         img.dataUrl,
          confidenceScore: SCORE_EXACT_FILENAME,
          matchType:       'exact_filename',
        });
        console.debug('[imageMatch] Exact filename match', { filename: img.name, student: recName });
      } else {
        const indexKeys  = Array.from(photoIndex.keys());
        const noExt      = lookupKey.replace(/\.[^.]+$/, '');
        const nearMatch  = indexKeys.find(k => k.replace(/\.[^.]+$/, '') === noExt);
        const nearest    = indexKeys.find(k => {
          if (Math.abs(k.length - lookupKey.length) > 3) return false;
          let diffs = 0;
          for (let ci = 0; ci < Math.max(k.length, lookupKey.length); ci++) {
            if (k[ci] !== lookupKey[ci]) diffs++;
            if (diffs > 3) return false;
          }
          return diffs > 0;
        });
        console.warn(
          `[imageMatch] ✗ UNMATCHED "${img.name}"\n` +
          `  lookup key      : "${lookupKey}"\n` +
          `  key char codes  : [${[...lookupKey].slice(0, 40).map(c => c.charCodeAt(0)).join(',')}]\n` +
          `  photoIndex size : ${photoIndex.size}\n` +
          `  sample keys     : [${indexKeys.slice(0, 6).map(k => `"${k}"`).join(', ')}]` +
          (nearMatch ? `\n  ext-only near-match: "${nearMatch}"` : '') +
          (nearest   ? `\n  char-diff near-match: "${nearest}"` : '')
        );
        unmatched.push({
          filename:           img.name,
          normalizedFilename: lookupKey,
          reason: nearMatch
            ? `Filename matches but extension differs: CSV has "${nearMatch}", ZIP has "${lookupKey}" — check file extension`
            : `No record has Profile Picture / Photo = "${img.name}" (exact match required)`,
        });
      }
      continue;
    }

    // Score all records; keep only candidates that meet the threshold
    let candidates: Candidate[] = records
      .map((rec) => scoreRecord(rec, fp))
      .filter((c): c is Candidate => c !== null)
      .sort((a, b) => b.score - a.score);  // best first

    // If no candidates at all, try a name-only fallback:
    // strip the numeric school-code prefix and retry
    if (candidates.length === 0 && fp.hasId && fp.nameFragment.length >= 3) {
      const fallbackFp: FileParts = {
        ...fp,
        schoolCode: '',
        rollOrAdmNo: '',
        hasId: false,
      };
      candidates = records
        .map((rec) => scoreRecord(rec, fallbackFp))
        .filter((c): c is Candidate => c !== null)
        .sort((a, b) => b.score - a.score);
    }

    if (candidates.length === 0) {
      const sampleKeys = records.length > 0
        ? Object.keys(records[0]).filter((k) => !META_KEYS.has(k)).slice(0, 6).join(', ')
        : 'no records loaded';
      unmatched.push({
        filename:           img.name,
        normalizedFilename: normalizeId(img.name),
        reason: fp.hasId
          ? `No match for school="${fp.schoolCode}" id="${fp.rollOrAdmNo}". Available columns: [${sampleKeys}]`
          : `No match for name "${fp.firstName} ${fp.lastName}". Available columns: [${sampleKeys}]`,
      });
      console.debug('[imageMatch] No candidates', { filename: img.name });
      continue;
    }

    // Find the best candidate whose student hasn't been claimed yet
    const best = candidates.find((c) => !claimedBy.has(String(c.rec['id'] ?? '')));

    if (!best) {
      // Every candidate is already taken by a better-score image
      const topName = getName(candidates[0].rec);
      unmatched.push({
        filename:           img.name,
        normalizedFilename: normalizeId(img.name),
        reason: `Best match "${topName}" is already assigned to another image`,
      });
      console.debug('[imageMatch] All candidates already claimed', { filename: img.name });
      continue;
    }

    const bestId   = String(best.rec['id'] ?? '');
    const bestName = getName(best.rec);

    // Build allMatches list for the duplicates panel
    const allMatches = candidates.map((c) => ({
      userId:    String(c.rec['id'] ?? ''),
      name:      getName(c.rec),
      score:     c.score,
      matchType: c.matchType,
    }));

    // Flag in duplicates[] when multiple students matched this image
    if (candidates.length > 1) {
      duplicates.push({
        filename:        img.name,
        appliedName:     bestName,
        appliedUserId:   bestId,
        confidenceScore: best.score,
        allMatches,
        reason: `${candidates.length} candidates found; applied to best match (${best.score}%).`,
      });
      console.debug('[imageMatch] Multiple candidates — flagged as duplicate', {
        filename: img.name, applied: bestName, count: candidates.length,
      });
    }

    claimedBy.set(bestId, img.name);
    matched.push({
      userId:          bestId,
      name:            bestName,
      filename:        img.name,
      dataUrl:         img.dataUrl,
      confidenceScore: best.score,
      matchType:       best.matchType,
    });

    console.debug('[imageMatch] Matched', {
      filename: img.name, student: bestName, score: best.score, type: best.matchType,
    });
  }

  console.info('[imageMatch] Summary', {
    total:      imageFiles.length,
    matched:    matched.length,
    duplicates: duplicates.length,
    unmatched:  unmatched.length,
  });

  return { matched, duplicates, unmatched };
}
