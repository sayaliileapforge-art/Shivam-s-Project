import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import ProductTemplate from '../models/ProductTemplate';
import fs from 'fs';
import path from 'path';

const router = Router();

const MM_TO_PT = 72 / 25.4;

type TemplateType = 'id_card' | 'certificate' | 'poster' | 'custom';
type TemplateSlug = 'template_1' | 'template_2' | 'template_3';

interface TemplatePayload {
  id?: string;
  slug?: string;
  templateSlug?: string;
  templateName?: string;
  templateType?: TemplateType;
  templateHtml?: string;
  canvas?: {
    width?: number;
    height?: number;
  };
  thumbnail?: string;
  previewImageUrl?: string;
  preview_image?: string;
  layoutJSON?: string;
  designData?: Record<string, unknown>;
  /** Pre-computed from client diagnostics — skips server-side JSON parsing of canvasJSON. */
  hasValidLayout?: boolean;
  elementCount?: number;
}

interface ResolvedTemplate {
  id: string;
  templateName: string;
  templateType: TemplateType;
  templateSlug: TemplateSlug | '';
  templateHtml?: string;
  canvas: {
    width?: number;
    height?: number;
  };
  thumbnail?: string;
  previewImageUrl?: string;
  layoutJSON?: string;
  hasValidLayout: boolean;
  elementCount: number;
  source: 'database' | 'payload';
}

interface PreviewRequestBody {
  selectedRecordIds?: string[];
  selectedRecords?: Array<Record<string, unknown>>;
  configuration?: {
    pageSize?: string;
    templateId?: string;
    templateSlug?: string;
    orientation?: 'portrait' | 'landscape';
    templateType?: TemplateType;
    isSample?: boolean;
    sheetSize?: {
      widthMm?: number;
      heightMm?: number;
    };
    pageMargin?: {
      topMm?: number;
      leftMm?: number;
    };
    rowMarginMm?: number;
    columnMarginMm?: number;
    cardSize?: {
      widthMm?: number;
      heightMm?: number;
    };
    fileName?: string;
    useFieldBasedMapping?: boolean;
    fallbackTemplateId?: string;
    templateMappings?: Array<{
      fieldName?: string;
      fieldValue?: string;
      templateId?: string;
    }>;
  };
  template?: TemplatePayload;
}

function mmToPt(mm: number): number {
  return mm * MM_TO_PT;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function sanitizeFileName(name: string | undefined): string {
  const cleaned = String(name || 'preview')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_');
  return cleaned || 'preview';
}

function parseDataUrl(src: string): Buffer | null {
  const match = src.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
  if (!match) return null;
  try {
    return Buffer.from(match[2], 'base64');
  } catch {
    return null;
  }
}

// Uploads directory — same resolution logic as server.ts.
// In compiled output __dirname = backend/dist/routes/, so ../../ = backend root.
const _localUploadsDir = process.env.UPLOADS_DIR?.trim()
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(__dirname, '../../public/uploads');

/**
 * For URLs pointing to the local server (localhost / 127.0.0.1), read the file
 * from disk instead of making an HTTP round-trip back to the same process.
 * Returns null if the URL is not local, file doesn't exist, or path is outside
 * the uploads directory (path-traversal guard).
 */
async function readLocalFileBuffer(url: string): Promise<Buffer | null> {
  try {
    const parsed = new URL(url);
    const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (!isLocal) return null;

    const pathname = decodeURIComponent(parsed.pathname);
    let relPath: string | null = null;
    if (pathname.startsWith('/uploads/')) relPath = pathname.slice('/uploads/'.length);
    else if (pathname.startsWith('/images/')) relPath = pathname.slice('/images/'.length);
    if (!relPath) return null;

    // Path-traversal guard: resolved path must stay inside _localUploadsDir
    const filePath = path.resolve(_localUploadsDir, relPath);
    if (!filePath.startsWith(_localUploadsDir + path.sep) && filePath !== _localUploadsDir) {
      return null;
    }

    return await fs.promises.readFile(filePath);
  } catch {
    return null;
  }
}

async function loadTemplatePreviewBuffer(src: string | undefined): Promise<Buffer | null> {
  if (!src) return null;

  if (src.startsWith('data:image/')) {
    return parseDataUrl(src);
  }

  if (!/^https?:\/\//i.test(src)) {
    return null;
  }

  // Fast path: for files hosted on the same server, read from disk to avoid
  // an HTTP round-trip back to the same Node.js process.
  const localBuf = await readLocalFileBuffer(src);
  if (localBuf) return localBuf;

  try {
    const response = await fetch(src);
    if (!response.ok) return null;

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/')) return null;

    const ab = await response.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

function parseLayoutAndCountElements(layoutJSON: string | undefined): { hasValidLayout: boolean; elementCount: number } {
  if (!layoutJSON) {
    return { hasValidLayout: false, elementCount: 0 };
  }

  try {
    const parsed = JSON.parse(layoutJSON) as any;
    const objects: unknown[] = [];

    if (Array.isArray(parsed?.canvas?.objects)) {
      objects.push(...parsed.canvas.objects);
    }

    if (Array.isArray(parsed?.pages)) {
      parsed.pages.forEach((page: any) => {
        if (Array.isArray(page?.canvas?.objects)) {
          objects.push(...page.canvas.objects);
        }
      });
    }

    return {
      hasValidLayout: true,
      elementCount: objects.length,
    };
  } catch {
    return { hasValidLayout: false, elementCount: 0 };
  }
}

function isTemplateType(value: unknown): value is TemplateType {
  return value === 'id_card' || value === 'certificate' || value === 'poster' || value === 'custom';
}

function normalizeTemplateSlug(raw: string): TemplateSlug | '' {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return '';

  if (value === 'template_1' || value === 'template1') return 'template_1';
  if (value === 'template_2' || value === 'template2') return 'template_2';
  if (value === 'template_3' || value === 'template3') return 'template_3';

  if (/template[\s_-]*1|id[\s_-]*card|classic|pvc/.test(value)) return 'template_1';
  if (/template[\s_-]*2|certificate|minimal/.test(value)) return 'template_2';
  if (/template[\s_-]*3|copy|poster|modern/.test(value)) return 'template_3';

  return '';
}

function resolveTemplateSlug(rawSlug: string, templateName: string, templateType: TemplateType): TemplateSlug | '' {
  const fromRaw = normalizeTemplateSlug(rawSlug);
  if (fromRaw) return fromRaw;

  const fromName = normalizeTemplateSlug(templateName);
  if (fromName) return fromName;

  // Explicit fallback by declared template type.
  switch (templateType) {
    case 'id_card':
      return 'template_1';
    case 'certificate':
      return 'template_2';
    case 'poster':
      return 'template_3';
    default:
      return '';
  }
}

function extractCanvasFromDesignData(designData: Record<string, unknown>): { width?: number; height?: number } {
  const canvas = (designData.canvas && typeof designData.canvas === 'object')
    ? (designData.canvas as Record<string, unknown>)
    : {};

  const width = Number(canvas.width);
  const height = Number(canvas.height);

  return {
    width: Number.isFinite(width) ? width : undefined,
    height: Number.isFinite(height) ? height : undefined,
  };
}

function toObjectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function extractTemplateHtml(designData: Record<string, unknown>, payloadTemplateHtml?: string): string | undefined {
  const rawHtml = String(
    payloadTemplateHtml
    || designData.templateHtml
    || designData.htmlTemplate
    || designData.template_html
    || ''
  ).trim();

  return rawHtml || undefined;
}

function resolveTemplateFromPayload(
  requestedTemplateId: string,
  payload: TemplatePayload,
  configuration: NonNullable<PreviewRequestBody['configuration']>
): ResolvedTemplate | null {
  const templateName = String(payload.templateName || '').trim();
  const payloadType = isTemplateType(payload.templateType) ? payload.templateType : undefined;
  const configurationType = isTemplateType(configuration.templateType) ? configuration.templateType : undefined;
  const templateType: TemplateType = payloadType || configurationType || 'id_card';
  const designData = toObjectRecord(payload.designData);

  const rawSlug = String(
    payload.slug
    || payload.templateSlug
    || designData.slug
    || designData.templateSlug
    || configuration.templateSlug
    || ''
  ).trim();

  const templateSlug = resolveTemplateSlug(rawSlug, templateName, templateType);
  const canvasFromDesign = extractCanvasFromDesignData(designData);
  const layoutJSON = String(payload.layoutJSON || designData.layoutJSON || designData.canvasJSON || '').trim() || undefined;
  const templateHtml = extractTemplateHtml(designData, payload.templateHtml);

  let hasValidLayout: boolean;
  let elementCount: number;
  if (typeof payload.hasValidLayout === 'boolean' && typeof payload.elementCount === 'number') {
    hasValidLayout = payload.hasValidLayout;
    elementCount = payload.elementCount;
  } else {
    ({ hasValidLayout, elementCount } = parseLayoutAndCountElements(layoutJSON));
  }

  const resolvedId = String(payload.id || requestedTemplateId).trim();
  if (!resolvedId || (!templateName && !templateSlug)) {
    return null;
  }

  return {
    id: resolvedId,
    templateName: templateName || 'Template',
    templateType,
    templateSlug,
    templateHtml,
    canvas: {
      width: payload.canvas?.width ?? canvasFromDesign.width,
      height: payload.canvas?.height ?? canvasFromDesign.height,
    },
    thumbnail: String(payload.thumbnail || designData.thumbnail || '').trim() || undefined,
    previewImageUrl: String(payload.previewImageUrl || payload.preview_image || designData.previewImageUrl || designData.preview_image || '').trim() || undefined,
    layoutJSON,
    hasValidLayout,
    elementCount,
    source: 'payload',
  };
}

async function resolveTemplateFromDatabase(templateId: string): Promise<ResolvedTemplate | null> {
  if (!mongoose.Types.ObjectId.isValid(templateId)) {
    return null;
  }

  const templateDoc = await ProductTemplate.findById(templateId).lean<Record<string, any>>();
  if (!templateDoc) {
    return null;
  }

  const designData = toObjectRecord(templateDoc.designData);
  const rawTemplateType = String(designData.templateType || '').trim();
  const templateType: TemplateType = isTemplateType(rawTemplateType) ? rawTemplateType : 'id_card';
  const templateName = String(templateDoc.templateName || '').trim() || 'Template';

  const rawSlug = String(designData.slug || designData.templateSlug || '').trim();
  const templateSlug = resolveTemplateSlug(rawSlug, templateName, templateType);

  const canvas = extractCanvasFromDesignData(designData);
  const layoutJSON = String(designData.layoutJSON || designData.canvasJSON || '').trim() || undefined;
  const templateHtml = extractTemplateHtml(designData);
  const { hasValidLayout, elementCount } = parseLayoutAndCountElements(layoutJSON);

  const thumbnail = String(designData.thumbnail || '').trim() || undefined;
  const previewImageUrl = String(templateDoc.preview_image || templateDoc.previewImageUrl || '').trim() || undefined;

  return {
    id: String(templateDoc._id),
    templateName,
    templateType,
    templateSlug,
    templateHtml,
    canvas,
    thumbnail,
    previewImageUrl,
    layoutJSON,
    hasValidLayout,
    elementCount,
    source: 'database',
  };
}

async function resolveTemplateForPreview(
  requestedTemplateId: string,
  payload: TemplatePayload,
  configuration: NonNullable<PreviewRequestBody['configuration']>
): Promise<ResolvedTemplate | null> {
  const dbTemplate = await resolveTemplateFromDatabase(requestedTemplateId);
  if (dbTemplate) {
    // If DB template lacks layoutJSON (e.g. template was auto-saved to localStorage
    // only, not yet explicitly saved to MongoDB), use the payload's layoutJSON.
    if (!dbTemplate.layoutJSON) {
      const payloadLayout = String(payload.layoutJSON || '').trim();
      if (payloadLayout) {
        dbTemplate.layoutJSON = payloadLayout;
        const { hasValidLayout, elementCount } = parseLayoutAndCountElements(payloadLayout);
        dbTemplate.hasValidLayout = hasValidLayout;
        dbTemplate.elementCount = elementCount;
        console.debug('[PreviewAPI] DB template missing layoutJSON — using payload fallback', {
          templateId: requestedTemplateId,
          layoutLen: payloadLayout.length,
        });
      }
    }
    console.debug('[PreviewAPI] fetched template from DB', {
      templateId: requestedTemplateId,
      templateName: dbTemplate.templateName,
      templateType: dbTemplate.templateType,
      templateSlug: dbTemplate.templateSlug,
      hasLayoutJSON: Boolean(dbTemplate.layoutJSON),
    });
    return dbTemplate;
  }

  const payloadTemplate = resolveTemplateFromPayload(requestedTemplateId, payload, configuration);
  if (payloadTemplate) {
    console.debug('[PreviewAPI] using template payload fallback', {
      templateId: requestedTemplateId,
      templateName: payloadTemplate.templateName,
      templateType: payloadTemplate.templateType,
      templateSlug: payloadTemplate.templateSlug,
    });
    return payloadTemplate;
  }

  return null;
}

interface StudentCardData {
  name: string;
  schoolCode: string;
  admissionNo: string;
  photoUrl: string;
}

function getRecordValueByAliases(record: Record<string, unknown>, aliases: string[]): string {
  const normalizeKey = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const alias of aliases) {
    const direct = String(record[alias] ?? '').trim();
    if (direct) return direct;

    const caseInsensitive = Object.entries(record).find(([key]) => key.toLowerCase() === alias.toLowerCase());
    const fromEntry = String(caseInsensitive?.[1] ?? '').trim();
    if (fromEntry) return fromEntry;

    const normalizedAlias = normalizeKey(alias);
    const normalizedMatch = Object.entries(record).find(([key]) => normalizeKey(key) === normalizedAlias);
    const normalizedValue = String(normalizedMatch?.[1] ?? '').trim();
    if (normalizedValue) return normalizedValue;
  }
  return '';
}

// ─── Variable substitution engine (mirrors frontend TEMPLATE_VAR_ALIASES / mapData) ────
const BACKEND_VAR_ALIASES: Record<string, string[]> = {
  fullname:        ['Name', 'name', 'fullName', 'FullName', 'studentName', 'StudentName', 'full_name', 'Student Name'],
  name:            ['Name', 'name', 'fullName', 'FullName', 'studentName', 'Student Name'],
  studentname:     ['Name', 'name', 'studentName', 'StudentName', 'Student Name'],
  classname:       ['Class', 'class', 'className', 'ClassName', 'standard', 'Standard'],
  class:           ['Class', 'class', 'className', 'standard', 'Standard'],
  section:         ['Section', 'section', 'Stream', 'stream', 'Division', 'div', 'Section / Stream / Section', 'Section / Stream'],
  classsection:    ['Class', 'class', 'Section', 'section'],
  fathername:      ['Father Name', 'fatherName', 'FatherName', 'father_name', 'Father', "Father's Name"],
  mothername:      ['Mother Name', 'motherName', 'MotherName', 'mother_name', 'Mother', "Mother's Name"],
  fathermobile:    ['Father Mobile', 'fatherMobile', 'FatherMobile', 'father_mobile', 'Father Mobile Number', 'Father Mobile No', "Father's Mobile"],
  mothermobile:    ['Mother Mobile', 'motherMobile', 'MotherMobile', 'mother_mobile', 'Mother Mobile Number', 'Mother Mobile No'],
  address:         ['Address', 'address', 'addr', 'Village', 'village', 'City', 'city', 'Permanent Address', 'permanent_address'],
  phone:           ['Phone', 'phone', 'Mobile', 'mobile', 'Contact', 'contact', 'Father Mobile Number', 'Father Mobile'],
  mobile:          ['Mobile', 'mobile', 'Phone', 'phone', 'Contact', 'contact', 'Father Mobile Number', 'Father Mobile'],
  mobileno:        ['Mobile', 'mobile', 'Phone', 'phone', 'Father Mobile Number'],
  contact:         ['Contact', 'contact', 'Mobile', 'mobile', 'Phone', 'phone'],
  admissionno:     ['Admission Number', 'admissionNo', 'AdmissionNo', 'admission_no', 'Admission No', 'Admn No', 'rollNo', 'roll_no'],
  admissionnumber: ['Admission Number', 'admissionNo', 'AdmissionNo', 'admission_no', 'Admn No'],
  rollno:          ['Roll No', 'rollNo', 'roll_no', 'admissionNo', 'Admission Number'],
  companyname:     ['Company Name', 'companyName', 'CompanyName', 'company_name', 'School Name', 'schoolName', 'SchoolName', 'school_name', 'Organisation', 'organization', 'Institute', 'institution'],
  company:         ['Company Name', 'companyName', 'CompanyName', 'School Name', 'schoolName'],
  schoolname:      ['School Name', 'schoolName', 'SchoolName', 'school_name', 'Company Name', 'companyName'],
  institutename:   ['Institute', 'institution', 'School Name', 'schoolName', 'Company Name'],
  designation:     ['Designation', 'designation', 'Role', 'role', 'Position', 'position', 'Post', 'post'],
  signature:       ['Signature', 'signature', 'sign', 'Sign'],
  dob:             ['DOB', 'dob', 'Date of Birth', 'dateOfBirth', 'birthDate', 'Date of Birth (DD/MM/YYYY)'],
  dateofbirth:     ['Date of Birth', 'DOB', 'dob', 'dateOfBirth', 'Date of Birth (DD/MM/YYYY)'],
  schoolcode:      ['School Code', 'schoolCode', 'school_code', 'SchoolCode'],
  gender:          ['Gender', 'gender', 'Sex', 'sex'],
  bloodgroup:      ['Blood Group', 'bloodGroup', 'blood_group', 'BloodGroup'],
  house:           ['House', 'house', 'School House', 'schoolHouse'],
  stream:          ['Stream', 'stream', 'Section', 'section', 'Division', 'Section / Stream / Section'],
};

function mapDataForRecord(text: string, record: Record<string, unknown>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_match: string, rawKey: string): string => {
    const key = rawKey.trim();

    // 1. Direct exact-key lookup
    const direct = String(record[key] ?? '').trim();
    if (direct) return direct;

    // 2. Alias table lookup
    const norm = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const candidates = BACKEND_VAR_ALIASES[norm] ?? [];
    for (const alias of candidates) {
      const val = String(record[alias] ?? '').trim();
      if (val) return val;
      const entry = Object.entries(record).find(([k]) => k.toLowerCase() === alias.toLowerCase());
      const entryVal = String(entry?.[1] ?? '').trim();
      if (entryVal) return entryVal;
    }

    // 3. Fuzzy fallback: normalised key matches normalised record key
    const fuzzy = Object.entries(record).find(
      ([k]) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === norm
    );
    return fuzzy ? String(fuzzy[1] ?? '').trim() : '';
  });
}
// ─────────────────────────────────────────────────────────────────────────────

/** Encode each path segment to handle spaces, commas, and other special chars in filenames. */
function encodePathSegments(rawPath: string): string {
  return rawPath.split('/').map((seg) => {
    if (!seg) return seg;
    try { return encodeURIComponent(decodeURIComponent(seg)); } catch { return encodeURIComponent(seg); }
  }).join('/');
}

function toAbsoluteAssetUrl(rawValue: string, req: Request): string {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';

  // Already an absolute URL or data/blob URI — keep as-is
  if (/^(data:image\/|blob:|https?:\/\/)/i.test(raw)) {
    return raw;
  }

  const host = req.get('host') || 'localhost:5000';
  const base = `${req.protocol}://${host}`;

  if (raw.startsWith('/')) return `${base}${encodePathSegments(raw)}`;
  if (/^(uploads|student-photos)\//i.test(raw)) return `${base}/${encodePathSegments(raw)}`;

  // Bare filename (no directory separator) — assume it lives under /uploads/
  if (!raw.includes('/')) return `${base}/uploads/${encodeURIComponent(raw)}`;

  // Relative path with directories not matched above — try as a sub-path of base
  return `${base}/${encodePathSegments(raw)}`;
}

async function loadStudentPhotoBuffer(rawSource: string, req: Request): Promise<Buffer | null> {
  const source = toAbsoluteAssetUrl(rawSource, req);
  if (!source) return null;

  const primary = await loadTemplatePreviewBuffer(source);
  if (primary) return primary;

  // If the raw value is a bare filename and the /uploads/ attempt failed,
  // try common upload sub-folder candidates (some projects store photos in sub-dirs).
  const raw = String(rawSource || '').trim();
  if (raw && !raw.includes('/') && !/^(data:|blob:|https?:)/i.test(raw)) {
    const host = req.get('host') || 'localhost:5000';
    const base = `${req.protocol}://${host}`;
    const encoded = encodeURIComponent(raw);
    const candidates = [
      `${base}/uploads/students/${encoded}`,
      `${base}/uploads/photos/${encoded}`,
      `${base}/uploads/images/${encoded}`,
      `${base}/uploads/products/images/${encoded}`,
    ];
    for (const candidate of candidates) {
      const buf = await loadTemplatePreviewBuffer(candidate);
      if (buf) {
        console.debug(`[PhotoResolve] Found photo at fallback candidate: ${candidate}`);
        return buf;
      }
    }
  }

  return null;
}

function resolveStudentCardData(record: Record<string, unknown>, req: Request): StudentCardData {
  const name = getRecordValueByAliases(record, ['name', 'Name', 'studentName', 'fullName']) || '-';
  const schoolCode = getRecordValueByAliases(record, ['schoolCode', 'school_code', 'schoolcode', 'code', 'schoolId']) || '-';
  const admissionNo = getRecordValueByAliases(record, ['admissionNo', 'admission_no', 'admissionno', 'rollNo', 'roll_no']) || '-';
  const photoRaw = getRecordValueByAliases(record, [
    'photo',
    'Photo',
    'profilePic',
    'profilepic',
    'profile_pic',
    'profilePhoto',
    'profile_photo',
    'photoUrl',
    'photo_url',
    'photoURL',
    'studentPhoto',
    'student_photo',
    'passportPhoto',
    'passport_photo',
    'pic',
    'Pic',
    'image',
    'Image',
    'imageUrl',
    'image_url',
    'imageURL',
    'avatar',
    'Avatar',
    'picture',
    'Picture',
  ]);

  return {
    name,
    schoolCode,
    admissionNo,
    photoUrl: toAbsoluteAssetUrl(photoRaw, req),
  };
}

interface TemplateRenderContext {
  doc: InstanceType<typeof PDFDocument>;
  xMm: number;
  yMm: number;
  cardWidthMm: number;
  cardHeightMm: number;
  templateLabel: string;
  student: StudentCardData;
  studentPhotoImage: any;
  previewImage: any;
}

function drawBaseCardBorder(ctx: TemplateRenderContext, strokeColor = '#d1d5db'): void {
  const { doc, xMm, yMm, cardWidthMm, cardHeightMm } = ctx;
  doc.save();
  doc.lineWidth(1);
  doc.strokeColor(strokeColor);
  doc.roundedRect(mmToPt(xMm), mmToPt(yMm), mmToPt(cardWidthMm), mmToPt(cardHeightMm), mmToPt(1.5));
  doc.stroke();
  doc.restore();
}

function drawPreviewImage(ctx: TemplateRenderContext, xMm: number, yMm: number, widthMm: number, heightMm: number): void {
  const { doc, previewImage } = ctx;
  if (!previewImage) return;

  try {
    doc.image(previewImage as any, mmToPt(xMm), mmToPt(yMm), {
      fit: [mmToPt(widthMm), mmToPt(heightMm)],
      align: 'center',
      valign: 'center',
    });
  } catch {
    // Ignore image draw issues and keep generating preview.
  }
}

function drawStudentPhoto(ctx: TemplateRenderContext, xMm: number, yMm: number, widthMm: number, heightMm: number): void {
  const { doc, studentPhotoImage } = ctx;

  if (studentPhotoImage) {
    try {
      doc.image(studentPhotoImage as any, mmToPt(xMm), mmToPt(yMm), {
        fit: [mmToPt(widthMm), mmToPt(heightMm)],
        align: 'center',
        valign: 'center',
      });
      return;
    } catch {
      // Fall through to placeholder photo block.
    }
  }

  doc.save();
  doc.fillColor('#f3f4f6');
  doc.rect(mmToPt(xMm), mmToPt(yMm), mmToPt(widthMm), mmToPt(heightMm));
  doc.fill();
  doc.restore();

  doc.save();
  doc.strokeColor('#9ca3af');
  doc.lineWidth(0.6);
  doc.rect(mmToPt(xMm), mmToPt(yMm), mmToPt(widthMm), mmToPt(heightMm));
  doc.stroke();
  doc.restore();

  doc.fillColor('#6b7280').fontSize(6).text('No Photo', mmToPt(xMm), mmToPt(yMm + (heightMm / 2) - 2), {
    width: mmToPt(widthMm),
    align: 'center',
  });
}

function renderTemplate1(ctx: TemplateRenderContext): void {
  const { doc, xMm, yMm, cardWidthMm, cardHeightMm, templateLabel, student } = ctx;
  drawBaseCardBorder(ctx, '#d1d5db');

  const headerHeightMm = Math.min(16, Math.max(10, cardHeightMm * 0.25));
  doc.save();
  doc.fillColor('#f8fafc');
  doc.rect(mmToPt(xMm), mmToPt(yMm), mmToPt(cardWidthMm), mmToPt(headerHeightMm));
  doc.fill();
  doc.restore();

  doc.fillColor('#0f172a').fontSize(8).text(
    templateLabel,
    mmToPt(xMm + 2),
    mmToPt(yMm + 2),
    { width: mmToPt(cardWidthMm - 4), lineBreak: false }
  );

  drawPreviewImage(ctx, xMm + 2, yMm + headerHeightMm + 1, cardWidthMm - 4, cardHeightMm * 0.45);
  drawStudentPhoto(ctx, xMm + 2, yMm + headerHeightMm + 2, 16, Math.max(16, cardHeightMm * 0.38));

  doc.fillColor('#111827').fontSize(9).text(
    student.name || '-',
    mmToPt(xMm + 20),
    mmToPt(yMm + headerHeightMm + 3),
    { width: mmToPt(cardWidthMm - 22), lineBreak: false, ellipsis: true }
  );

  doc.fillColor('#374151').fontSize(7).text(
    `School Code: ${student.schoolCode || '-'}`,
    mmToPt(xMm + 20),
    mmToPt(yMm + headerHeightMm + 9),
    { width: mmToPt(cardWidthMm - 22), lineBreak: false, ellipsis: true }
  );

  doc.fillColor('#374151').fontSize(7).text(
    `Admission No: ${student.admissionNo || '-'}`,
    mmToPt(xMm + 20),
    mmToPt(yMm + headerHeightMm + 15),
    { width: mmToPt(cardWidthMm - 22), lineBreak: false, ellipsis: true }
  );
}

function renderTemplate2(ctx: TemplateRenderContext): void {
  const { doc, xMm, yMm, cardWidthMm, cardHeightMm, templateLabel, student } = ctx;
  drawBaseCardBorder(ctx, '#34d399');

  doc.save();
  doc.fillColor('#ecfdf5');
  doc.roundedRect(mmToPt(xMm), mmToPt(yMm), mmToPt(cardWidthMm), mmToPt(cardHeightMm), mmToPt(1.5));
  doc.fill();
  doc.restore();

  doc.save();
  doc.fillColor('#10b981');
  doc.rect(mmToPt(xMm), mmToPt(yMm), mmToPt(5), mmToPt(cardHeightMm));
  doc.fill();
  doc.restore();

  doc.fillColor('#065f46').fontSize(8).text(
    templateLabel,
    mmToPt(xMm + 7),
    mmToPt(yMm + 2),
    { width: mmToPt(cardWidthMm - 9), lineBreak: false }
  );

  drawPreviewImage(ctx, xMm + 7, yMm + 11, cardWidthMm - 30, cardHeightMm - 14);
  drawStudentPhoto(ctx, xMm + cardWidthMm - 22, yMm + 5, 18, 20);

  doc.fillColor('#064e3b').fontSize(10).text(
    student.name || '-',
    mmToPt(xMm + 7),
    mmToPt(yMm + 10),
    { width: mmToPt(cardWidthMm - 32), lineBreak: false, ellipsis: true }
  );

  doc.fillColor('#047857').fontSize(7).text(
    `Code: ${student.schoolCode || '-'}`,
    mmToPt(xMm + 7),
    mmToPt(yMm + 18),
    { width: mmToPt(cardWidthMm - 32), lineBreak: false, ellipsis: true }
  );

  doc.fillColor('#047857').fontSize(7).text(
    `Adm#: ${student.admissionNo || '-'}`,
    mmToPt(xMm + 7),
    mmToPt(yMm + 23),
    { width: mmToPt(cardWidthMm - 32), lineBreak: false, ellipsis: true }
  );
}

function renderTemplate3(ctx: TemplateRenderContext): void {
  const { doc, xMm, yMm, cardWidthMm, cardHeightMm, templateLabel, student } = ctx;
  drawBaseCardBorder(ctx, '#f59e0b');

  doc.save();
  doc.fillColor('#fffbeb');
  doc.roundedRect(mmToPt(xMm), mmToPt(yMm), mmToPt(cardWidthMm), mmToPt(cardHeightMm), mmToPt(1.5));
  doc.fill();
  doc.restore();

  doc.save();
  doc.fillColor('#fef3c7');
  doc.rect(mmToPt(xMm), mmToPt(yMm), mmToPt(cardWidthMm), mmToPt(9));
  doc.fill();
  doc.restore();

  doc.fillColor('#92400e').fontSize(8).text(
    templateLabel,
    mmToPt(xMm + 2),
    mmToPt(yMm + 2),
    { width: mmToPt(cardWidthMm - 4), lineBreak: false }
  );

  drawPreviewImage(ctx, xMm + 2, yMm + 11, cardWidthMm - 22, cardHeightMm - 13);
  drawStudentPhoto(ctx, xMm + cardWidthMm - 18, yMm + 11, 16, 18);

  doc.fillColor('#111827').fontSize(9).text(
    student.name || '-',
    mmToPt(xMm + 2),
    mmToPt(yMm + 12),
    { width: mmToPt(cardWidthMm - 24), lineBreak: false, ellipsis: true }
  );

  doc.fillColor('#4b5563').fontSize(7).text(
    student.schoolCode || '-',
    mmToPt(xMm + 2),
    mmToPt(yMm + 20),
    { width: mmToPt(cardWidthMm - 24), lineBreak: false, ellipsis: true }
  );

  doc.fillColor('#4b5563').fontSize(7).text(
    student.admissionNo || '-',
    mmToPt(xMm + 2),
    mmToPt(yMm + 25),
    { width: mmToPt(cardWidthMm - 24), lineBreak: false, ellipsis: true }
  );
}

function renderTemplateCard(slug: TemplateSlug, context: TemplateRenderContext): void {
  switch (slug) {
    case 'template_1':
      renderTemplate1(context);
      return;
    case 'template_2':
      renderTemplate2(context);
      return;
    case 'template_3':
      renderTemplate3(context);
      return;
    default: {
      const exhaustiveCheck: never = slug;
      throw new Error(`Unsupported template slug: ${String(exhaustiveCheck)}`);
    }
  }
}

// ─── Canvas-based card rendering ─────────────────────────────────────────────

interface CanvasTextObject {
  text: string;
  left: number;      // px, absolute in canvas (top-left of text box)
  top: number;       // px, absolute in canvas
  width: number;     // px effective (already includes scaleX)
  height: number;    // px effective (already includes scaleY)
  fontSize: number;  // px in canvas coordinates (already includes parent scale)
  fontWeight: string | number;
  fontStyle: string;   // 'normal' | 'italic' | 'oblique'
  fontFamily: string;
  color: string;
  textAlign: 'left' | 'center' | 'right';
  angle: number;
  opacity: number;     // 0–1
  charSpacing: number; // Fabric.js units (thousandths of font size); convert at render time
  lineHeight: number;  // multiplier, e.g. 1.16
  underline: boolean;
  hasVariables: boolean;
  textType: 'text' | 'i-text' | 'textbox'; // Fabric.js object type; textbox wraps, others don't
  textTransform: '' | 'uppercase' | 'lowercase' | 'capitalize'; // Fabric.js textTransform
  textBackgroundColor: string;  // highlight colour behind text; '' = none
  stroke: string;               // text outline colour; '' = none
  strokeWidth: number;          // outline width in canvas pixels; 0 = none
}

interface CanvasPhotoArea {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface CanvasRenderInfo {
  canvasWidthPx: number;
  canvasHeightPx: number;
  backgroundImageSrc: string;
  textObjects: CanvasTextObject[];
  photoAreas: CanvasPhotoArea[];
  hasDynamicText: boolean;
}

function extractCanvasRenderInfo(
  canvasJSON: string,
  fallbackCanvasWidthMm?: number,
  fallbackCanvasHeightMm?: number,
): CanvasRenderInfo | null {
  if (!canvasJSON) return null;
  try {
    const parsed = JSON.parse(canvasJSON) as Record<string, unknown>;

    // ── Canvas dimensions ────────────────────────────────────────────────────
    // config.canvas stores the design dimensions in mm (e.g. 54×86 for PVC card).
    // Fabric.js toJSON() does NOT include canvas width/height in its output, so
    // we derive pixels from the mm value using the same 96-DPI constant the
    // frontend uses: px = Math.round(mm × 96/25.4)
    const MM_TO_PX_RATIO = 96 / 25.4;
    let canvasWidthPx = 0;
    let canvasHeightPx = 0;

    if (parsed.config && typeof parsed.config === 'object') {
      const cfg = (parsed.config as Record<string, unknown>);
      const cfgCanvas = (cfg.canvas && typeof cfg.canvas === 'object')
        ? (cfg.canvas as Record<string, unknown>)
        : {};
      const wMm = Number(cfgCanvas.width ?? 0);
      const hMm = Number(cfgCanvas.height ?? 0);
      if (wMm > 0 && hMm > 0) {
        canvasWidthPx = Math.round(wMm * MM_TO_PX_RATIO);
        canvasHeightPx = Math.round(hMm * MM_TO_PX_RATIO);
      }
    }

    // Some older saves may store raw pixel dimensions directly on the canvas node
    // (or the Fabric.js node happens to carry them). Accept those too.
    if (!canvasWidthPx || !canvasHeightPx) {
      // We'll look at the canvas node after resolving it below.
    }

    // Fallback: caller can pass the resolved template's canvas mm dimensions.
    if ((!canvasWidthPx || !canvasHeightPx) && fallbackCanvasWidthMm && fallbackCanvasHeightMm) {
      canvasWidthPx = Math.round(fallbackCanvasWidthMm * MM_TO_PX_RATIO);
      canvasHeightPx = Math.round(fallbackCanvasHeightMm * MM_TO_PX_RATIO);
    }

    // ── Canvas node (Fabric.js objects + backgroundImage) ────────────────────
    // canvasJSON format: { config, pages, activePageId, canvas, elementMetadata }
    // where `canvas` is the raw Fabric.js toJSON() output for the active page.
    let canvasNode: Record<string, unknown> | null = null;
    if (parsed.canvas && typeof parsed.canvas === 'object') {
      canvasNode = parsed.canvas as Record<string, unknown>;
    } else if (Array.isArray(parsed.pages) && parsed.pages.length > 0) {
      const firstPage = parsed.pages[0] as { canvas?: Record<string, unknown> };
      canvasNode = firstPage?.canvas ?? null;
    }
    if (!canvasNode) return null;

    // Try pixel dimensions from the canvas node itself as a last resort.
    if (!canvasWidthPx || !canvasHeightPx) {
      const nw = Number(canvasNode.width ?? 0);
      const nh = Number(canvasNode.height ?? 0);
      if (nw > 0 && nh > 0) {
        canvasWidthPx = nw;
        canvasHeightPx = nh;
      }
    }

    if (!canvasWidthPx || !canvasHeightPx) return null;

    const bgImageObj = (canvasNode.backgroundImage ?? {}) as Record<string, unknown>;
    const backgroundImageSrc = String(bgImageObj.src ?? '').trim();

    const rawObjects = Array.isArray(canvasNode.objects)
      ? (canvasNode.objects as Record<string, unknown>[])
      : [];

    const textObjects: CanvasTextObject[] = [];
    const photoAreas: CanvasPhotoArea[] = [];

    /**
     * Recursively walks Fabric.js canvas objects and extracts text/photo info.
     *
     * @param objects      Array of Fabric.js serialised objects to process.
     * @param parentCenterX  Absolute canvas-pixel X of the PARENT's geometric centre.
     *                       For root-level objects this is 0 (canvas origin).
     * @param parentCenterY  Absolute canvas-pixel Y of the PARENT's geometric centre.
     * @param accumScaleX  Accumulated scale-X from all ancestor groups (start at 1).
     * @param accumScaleY  Accumulated scale-Y from all ancestor groups (start at 1).
     *
     * Fabric.js coordinate rules:
     *  - Root-level objects: `left`/`top` are absolute canvas pixels (their OWN
     *    reference point, which is the top-left when originX='left').
     *  - Objects inside a group: `left`/`top` are offsets from the GROUP's geometric
     *    CENTRE (in the group's LOCAL, pre-scale coordinate space).
     *  - The group's `scaleX`/`scaleY` stretches child positions AND sizes.
     */
    function processObjects(
      objects: Record<string, unknown>[],
      parentCenterX: number = 0,
      parentCenterY: number = 0,
      accumScaleX: number = 1,
      accumScaleY: number = 1,
    ): void {
      for (const obj of objects) {
        if (!obj || typeof obj !== 'object') continue;

        const type = String(obj.type ?? '').toLowerCase();
        const rawLeft = Number(obj.left ?? 0);
        const rawTop  = Number(obj.top  ?? 0);
        const ownScaleX = Number(obj.scaleX ?? 1) || 1;
        const ownScaleY = Number(obj.scaleY ?? 1) || 1;

        // Canvas-pixel offset of this object's reference point from the parent centre.
        // (For root-level objects parentCenterX=0, accumScale=1, so this is just rawLeft.)
        const absCenterX = parentCenterX + rawLeft * accumScaleX;
        const absCenterY = parentCenterY + rawTop  * accumScaleY;

        // Effective dimensions in canvas pixels (own scale × all ancestor scales).
        const totalScaleX = ownScaleX * accumScaleX;
        const totalScaleY = ownScaleY * accumScaleY;
        const rawWidth  = Number((obj.__boxWidth  as number | undefined) ?? obj.width  ?? 0);
        const rawHeight = Number((obj.__boxHeight as number | undefined) ?? obj.height ?? 0);
        const effectiveWidth  = rawWidth  * totalScaleX;
        const effectiveHeight = rawHeight * totalScaleY;

        // Convert reference-point to TOP-LEFT corner (adjust for Fabric.js origin).
        const originX = String(obj.originX ?? 'left');
        const originY = String(obj.originY ?? 'top');
        const objLeft = absCenterX - (originX === 'center' ? effectiveWidth  / 2 : 0);
        const objTop  = absCenterY - (originY === 'center' ? effectiveHeight / 2 : 0);

        const angle = Number(obj.angle ?? 0);

        // ── Groups: recurse into children ─────────────────────────────────────
        if (type === 'group' && Array.isArray(obj.objects)) {
          // The group's geometric centre in absolute canvas pixels.
          const groupCenterX = absCenterX + (originX === 'center' ? 0 : effectiveWidth  / 2);
          const groupCenterY = absCenterY + (originY === 'center' ? 0 : effectiveHeight / 2);
          // Pass totalScaleX (own × all ancestors) so that child positions, sizes, and
          // font sizes all accumulate correctly for any nesting depth.
          processObjects(
            obj.objects as Record<string, unknown>[],
            groupCenterX,
            groupCenterY,
            totalScaleX,   // accumulated scale: converts child local coords → canvas pixels
            totalScaleY,
          );
          continue;
        }

        // ── Photo / image placeholders ────────────────────────────────────────
        const varKey = String(
          (obj.variableKey ?? obj.__fieldKey ?? obj.fieldKey ?? obj.dataKey ?? obj.photoField ?? '') as string
        ).toLowerCase().replace(/[^a-z0-9]/g, '');
        const isPhotoField = ['photo', 'photourl', 'profilepic', 'image', 'avatar', 'picture', 'studentphoto'].includes(varKey);

        if ((type === 'image' || isPhotoField) && effectiveWidth > 0 && effectiveHeight > 0) {
          photoAreas.push({ left: objLeft, top: objTop, width: effectiveWidth, height: effectiveHeight });
          continue;
        }

        // ── Text objects ──────────────────────────────────────────────────────
        if (['text', 'i-text', 'textbox'].includes(type)) {
          const rawText = String(obj.text ?? obj.value ?? '').trim();
          if (!rawText) continue;

          // Font size in canvas pixels — scaled by totalScaleX (own scale × all ancestor
          // group scales) so that grouped text renders at the correct physical size.
          const fontSize = (Number.isFinite(Number(obj.fontSize)) ? Number(obj.fontSize) : 13)
            * totalScaleX;

          const fontWeight = String(obj.fontWeight ?? 'normal');
          const fontStyle  = String(obj.fontStyle  ?? 'normal');
          const fontFamily = String(obj.fontFamily ?? 'Helvetica').trim() || 'Helvetica';

          const color = (typeof obj.fill === 'string' && obj.fill) ? obj.fill : '#111827';

          const rawAlign = String(obj.textAlign ?? 'left');
          const textAlign: 'left' | 'center' | 'right' =
            rawAlign === 'center' ? 'center' : rawAlign === 'right' ? 'right' : 'left';

          const opacity     = Number.isFinite(Number(obj.opacity))     ? Math.min(1, Math.max(0, Number(obj.opacity)))     : 1;
          const charSpacing = Number.isFinite(Number(obj.charSpacing)) ? Number(obj.charSpacing) : 0;
          const lineHeight  = Number.isFinite(Number(obj.lineHeight))  && Number(obj.lineHeight) > 0
            ? Number(obj.lineHeight) : 1.16;
          const underline   = Boolean(obj.underline);

          const textType: 'text' | 'i-text' | 'textbox' =
            type === 'textbox' ? 'textbox' : type === 'i-text' ? 'i-text' : 'text';

          // Fabric.js extra styling properties
          const rawTransform = String(obj.textTransform ?? '').toLowerCase();
          const textTransform = (['uppercase', 'lowercase', 'capitalize'].includes(rawTransform)
            ? rawTransform : '') as '' | 'uppercase' | 'lowercase' | 'capitalize';
          const textBackgroundColor =
            typeof obj.textBackgroundColor === 'string' &&
            obj.textBackgroundColor &&
            obj.textBackgroundColor !== 'transparent'
              ? obj.textBackgroundColor : '';
          const stroke =
            typeof obj.stroke === 'string' &&
            obj.stroke &&
            obj.stroke !== 'transparent' &&
            obj.stroke !== 'none'
              ? obj.stroke : '';
          const strokeWidth =
            Number.isFinite(Number(obj.strokeWidth)) && Number(obj.strokeWidth) > 0
              ? Number(obj.strokeWidth) : 0;

          textObjects.push({
            text: rawText,
            left: objLeft,
            top:  objTop,
            width:  effectiveWidth,
            height: effectiveHeight,
            fontSize,
            fontWeight,
            fontStyle,
            fontFamily,
            color,
            textAlign,
            angle,
            opacity,
            charSpacing,
            lineHeight,
            underline,
            hasVariables: /\{\{[^}]+\}\}/.test(rawText),
            textType,
            textTransform,
            textBackgroundColor,
            stroke,
            strokeWidth,
          });
        }
      }
    }

    processObjects(rawObjects);

    return {
      canvasWidthPx,
      canvasHeightPx,
      backgroundImageSrc,
      textObjects,
      photoAreas,
      hasDynamicText: textObjects.some((t) => t.hasVariables),
    };
  } catch {
    return null;
  }
}

/**
 * Map a Fabric.js/CSS font-family string to the nearest PDFKit built-in font.
 * PDFKit built-ins: Courier, Helvetica, Times-Roman (+ Bold/Oblique variants).
 */
function selectPdfFont(fontFamily: string, bold: boolean, italic: boolean): string {
  const f = (fontFamily || '').toLowerCase().replace(/['"]/g, '');
  const isSerif = /^(times|georgia|garamond|palatino|didot|cambria|book antiqua|serif)/.test(f) || f === 'serif';
  const isMono  = /^(courier|monaco|consolas|inconsolata|lucida console|monospace)/.test(f) || f === 'monospace';

  if (isMono) {
    if (bold && italic) return 'Courier-BoldOblique';
    if (bold)   return 'Courier-Bold';
    if (italic) return 'Courier-Oblique';
    return 'Courier';
  }
  if (isSerif) {
    if (bold && italic) return 'Times-BoldItalic';
    if (bold)   return 'Times-Bold';
    if (italic) return 'Times-Italic';
    return 'Times-Roman';
  }
  // Default: sans-serif → Helvetica
  if (bold && italic) return 'Helvetica-BoldOblique';
  if (bold)   return 'Helvetica-Bold';
  if (italic) return 'Helvetica-Oblique';
  return 'Helvetica';
}

/**
 * Render a card entirely from the parsed canvas data.
 * Uses the canvas background image (not the full thumbnail) as the card backdrop,
 * then draws all text objects with variable substitution and exact designer styling,
 * and the student photo at the first photo-placeholder position.
 */
function renderCardFromCanvas(
  doc: InstanceType<typeof PDFDocument>,
  xMm: number,
  yMm: number,
  cardWidthMm: number,
  cardHeightMm: number,
  canvasInfo: CanvasRenderInfo,
  record: Record<string, unknown>,
  bgImage: unknown | null,
  fallbackImage: unknown | null,
  studentPhotoImage: unknown | null,
): void {
  const { canvasWidthPx, canvasHeightPx, textObjects, photoAreas } = canvasInfo;
  if (!canvasWidthPx || !canvasHeightPx) return;

  // Scale factors: canvas pixels → card mm
  const scaleX  = cardWidthMm  / canvasWidthPx;
  const scaleY  = cardHeightMm / canvasHeightPx;
  const avgScale = (scaleX + scaleY) / 2;  // used for font size

  // 1. Thin card border
  doc.save();
  doc.lineWidth(0.5).strokeColor('#cccccc');
  doc.roundedRect(mmToPt(xMm), mmToPt(yMm), mmToPt(cardWidthMm), mmToPt(cardHeightMm), mmToPt(1.5));
  doc.stroke();
  doc.restore();

  // 2. Background: prefer the canvas bg image; fall back to the full thumbnail
  const backgroundToDraw = bgImage ?? fallbackImage;
  if (backgroundToDraw) {
    try {
      doc.image(backgroundToDraw as Parameters<typeof doc.image>[0], mmToPt(xMm), mmToPt(yMm), {
        width:  mmToPt(cardWidthMm),
        height: mmToPt(cardHeightMm),
      });
    } catch { /* ignore – keep generating */ }
  }

  // 3. Student photo at the first photo-placeholder area
  if (studentPhotoImage && photoAreas.length > 0) {
    const area = photoAreas[0];
    const pxMm = xMm + area.left  * scaleX;
    const pyMm = yMm + area.top   * scaleY;
    const pwMm = area.width  * scaleX;
    const phMm = area.height * scaleY;
    // Only draw if the area is within the card
    if (pwMm > 0 && phMm > 0 && pxMm >= xMm - 1 && pyMm >= yMm - 1 &&
        pxMm < xMm + cardWidthMm + 1 && pyMm < yMm + cardHeightMm + 1) {
      try {
        doc.image(studentPhotoImage as Parameters<typeof doc.image>[0], mmToPt(pxMm), mmToPt(pyMm), {
          fit:   [mmToPt(pwMm), mmToPt(phMm)],
          align: 'center',
          valign: 'center',
        });
      } catch { /* ignore */ }
    }
  }

  // 4. Text objects — clipped to the card boundary with exact designer styling
  doc.save();
  doc.rect(mmToPt(xMm), mmToPt(yMm), mmToPt(cardWidthMm), mmToPt(cardHeightMm)).clip();

  for (const textObj of textObjects) {
    // Resolve variable placeholders
    const resolved  = mapDataForRecord(textObj.text, record);
    const isOnlyVars = /^\s*(\{\{[^}]+\}\}\s*)+$/.test(textObj.text);
    if (isOnlyVars && !resolved.trim()) continue;
    const displayText = resolved || (isOnlyVars ? '' : textObj.text);
    if (!displayText.trim()) continue;

    // Map canvas px coords to card mm coords
    const txMm = xMm + textObj.left  * scaleX;
    const tyMm = yMm + textObj.top   * scaleY;
    const twMm = textObj.width > 0
      ? textObj.width  * scaleX
      : cardWidthMm - (textObj.left * scaleX);
    const thMm = textObj.height > 0 ? textObj.height * scaleY : 0;

    // Hard bounds-check: skip objects whose top-left is completely outside the card
    // (the PDF clip handles partial overlaps, but this prevents cursor drift)
    if (txMm > xMm + cardWidthMm + 1 || tyMm > yMm + cardHeightMm + 1) continue;

    // Convert canvas-pixel font size → mm (via avgScale) → PDF points.
    // avgScale: canvas px → mm.  (72/25.4): mm → pt.
    const fontSizePt = Math.max(4, textObj.fontSize * avgScale * (72 / 25.4));

    const isBold   = textObj.fontWeight === 'bold' || Number(textObj.fontWeight) >= 700;
    const isItalic = textObj.fontStyle === 'italic' || textObj.fontStyle === 'oblique';
    const pdfFont  = selectPdfFont(textObj.fontFamily, isBold, isItalic);

    // charSpacing: Fabric.js unit = 1/1000 of font size (in em).
    // Convert to PDF points: charSpacing_pt = (charSpacing / 1000) * fontSizePt
    const charSpacingPt = (textObj.charSpacing / 1000) * fontSizePt;

    // Stroke (text outline): strokeWidthPt scaled from canvas pixels → PDF points.
    const hasStroke = Boolean(textObj.stroke) && textObj.strokeWidth > 0;
    const strokeWidthPt = hasStroke ? textObj.strokeWidth * avgScale * (72 / 25.4) : 0;

    // Apply Fabric.js textTransform BEFORE rendering so the visible string matches the
    // designer exactly (e.g. {{FULL_NAME}} styled uppercase → 'VANSHIKA KATIYAR').
    const finalText =
      textObj.textTransform === 'uppercase' ? displayText.toUpperCase()
      : textObj.textTransform === 'lowercase' ? displayText.toLowerCase()
      : textObj.textTransform === 'capitalize'
          ? displayText.replace(/\b\w/g, (c) => c.toUpperCase())
      : displayText;

    doc.save();

    // Apply opacity
    if (textObj.opacity < 1) {
      doc.fillOpacity(textObj.opacity);
    }

    // Apply rotation around the text box centre
    if (textObj.angle !== 0) {
      const cx = mmToPt(txMm + twMm / 2);
      const cy = mmToPt(tyMm + (thMm > 0 ? thMm / 2 : fontSizePt / 2));
      doc.rotate(textObj.angle, { origin: [cx, cy] });
    }

    // Draw textBackgroundColor highlight rectangle behind the text (in the rotated
    // coordinate space, matching Fabric.js behaviour).
    if (textObj.textBackgroundColor) {
      const bgH = thMm > 0 ? thMm : (fontSizePt / (72 / 25.4)) * (textObj.lineHeight || 1.16);
      doc.rect(mmToPt(txMm), mmToPt(tyMm), mmToPt(twMm), mmToPt(bgH))
         .fill(textObj.textBackgroundColor);
    }

    // Set text fill colour; add stroke colour+width if the template uses a text outline.
    doc.font(pdfFont)
       .fontSize(fontSizePt)
       .fillColor(textObj.color || '#111827');

    if (hasStroke) {
      doc.strokeColor(textObj.stroke).lineWidth(strokeWidthPt);
    }

    if (charSpacingPt !== 0) {
      (doc as any).characterSpacing(charSpacingPt);
    }

    // Only Fabric.js textboxes perform line-wrapping; text/i-text are single-line.
    const canWrap = textObj.textType === 'textbox';
    const textOptions: Record<string, unknown> = {
      width:     mmToPt(Math.max(twMm, 1)),
      align:     textObj.textAlign,
      lineBreak: canWrap,
      ellipsis:  !canWrap,
      underline: textObj.underline,
      fill: true,
      stroke: hasStroke,  // PDFKit mode 2 (fill + stroke) when true, mode 0 otherwise
    };

    // lineGap adds extra space between lines (PDFKit uses pts between baseline and next line).
    if (canWrap && textObj.lineHeight !== 1.16) {
      const lineGapPt = (textObj.lineHeight - 1) * fontSizePt - fontSizePt * 0.16;
      if (lineGapPt > 0) textOptions['lineGap'] = lineGapPt;
    }

    // Clip to the text box height so wrapped text cannot overflow beyond its Fabric.js
    // bounding box (Fabric.js clips overflow; we replicate that behaviour here).
    if (thMm > 0) {
      doc.save();
      doc.rect(mmToPt(txMm), mmToPt(tyMm), mmToPt(twMm + 0.5), mmToPt(thMm)).clip();
      doc.text(finalText, mmToPt(txMm), mmToPt(tyMm), textOptions as any);
      doc.restore();
    } else {
      doc.text(finalText, mmToPt(txMm), mmToPt(tyMm), textOptions as any);
    }

    doc.restore();
  }

  doc.restore();
}
// ─────────────────────────────────────────────────────────────────────────────

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as PreviewRequestBody;
    const selectedRecordIds = Array.isArray(body.selectedRecordIds) ? body.selectedRecordIds : [];
    const selectedRecords = Array.isArray(body.selectedRecords) ? body.selectedRecords : [];
    const configuration = body.configuration || {};
    const template = body.template || {};
    const requestedTemplateId = String(configuration.templateId || '').trim();
    const useFieldBasedMapping = Boolean(configuration.useFieldBasedMapping);
    const fallbackTemplateId = String(configuration.fallbackTemplateId || '').trim();
    const templateMappings = Array.isArray(configuration.templateMappings) ? configuration.templateMappings : [];

    console.debug('[PreviewAPI] incoming request', {
      templateId: requestedTemplateId,
      selectedRecordCount: selectedRecords.length,
      useFieldBasedMapping,
      fallbackTemplateId,
      templateMappingsCount: templateMappings.length,
      templateMappings: templateMappings.slice(0, 3), // Log first 3 mappings
    });

    if (!selectedRecordIds.length) {
      res.status(400).json({ success: false, error: 'At least one selected record is required' });
      return;
    }

    if (!selectedRecords.length) {
      res.status(400).json({ success: false, error: 'Selected record payload is required' });
      return;
    }

    if (!requestedTemplateId) {
      res.status(400).json({ success: false, error: 'Template ID is required for preview generation' });
      return;
    }

    const payloadTemplateId = String(template.id || '').trim();
    if (payloadTemplateId && payloadTemplateId !== requestedTemplateId) {
      res.status(400).json({ success: false, error: 'Template ID mismatch between configuration and template payload' });
      return;
    }

    const templateIdsToResolve = new Set<string>();
    templateIdsToResolve.add(requestedTemplateId);
    if (useFieldBasedMapping) {
      if (fallbackTemplateId) {
        templateIdsToResolve.add(fallbackTemplateId);
      }
      for (const mapping of templateMappings) {
        const mappingTemplateId = String(mapping?.templateId || '').trim();
        if (mappingTemplateId) {
          templateIdsToResolve.add(mappingTemplateId);
        }
      }
    }

    const resolvedTemplateById = new Map<string, ResolvedTemplate>();
    for (const templateId of templateIdsToResolve) {
      const payloadForResolve = templateId === requestedTemplateId ? template : {};
      const resolved = await resolveTemplateForPreview(templateId, payloadForResolve, configuration);
      if (!resolved) {
        res.status(404).json({ success: false, error: `Template not found for preview generation (${templateId})` });
        return;
      }
      if (!resolved.templateSlug) {
        res.status(400).json({
          success: false,
          error: `Template slug could not be resolved for "${resolved.templateName}".`,
        });
        return;
      }
      if (!resolved.hasValidLayout && !resolved.previewImageUrl && !resolved.thumbnail) {
        res.status(400).json({ success: false, error: `No preview available for template "${resolved.templateName}".` });
        return;
      }
      resolvedTemplateById.set(templateId, resolved);
    }

    const resolvedTemplate = resolvedTemplateById.get(requestedTemplateId)!;

    console.debug('[PreviewAPI] Generating preview', {
      templateId: requestedTemplateId,
      templateSource: resolvedTemplate.source,
      templateSlug: resolvedTemplate.templateSlug,
      hasTemplateHtml: Boolean(resolvedTemplate.templateHtml),
      selectedRecordCount: selectedRecords.length,
      layoutElementCount: resolvedTemplate.elementCount,
    });

    // Log all resolved templates for debugging
    if (useFieldBasedMapping) {
      console.log('[TEMPLATE RESOLUTION] Resolved templates for mapping:', {
        requestedTemplateId,
        requestedTemplateName: resolvedTemplate.templateName,
        fallbackTemplateId,
        fallbackTemplateName: fallbackTemplateId ? resolvedTemplateById.get(fallbackTemplateId)?.templateName : 'N/A',
        mappingTemplateCount: templateMappings.length,
        allResolvedTemplates: Array.from(resolvedTemplateById.entries()).map(([id, tmpl]) => ({
          templateId: id,
          templateName: tmpl.templateName,
        })),
      });
    }

    const studentCardData = selectedRecords.map((record) => resolveStudentCardData(record, req));
    console.debug('[PreviewAPI] mapped first student data', studentCardData[0] || null);

    const recordsWithoutPhoto = studentCardData.filter((s) => !s.photoUrl);
    if (recordsWithoutPhoto.length > 0) {
      console.warn(`[PhotoResolve] ${recordsWithoutPhoto.length} record(s) have no resolvable photo field.`);
      // Log up to 5 raw records so missing field keys can be identified
      selectedRecords.slice(0, 5).forEach((rec, i) => {
        const keys = Object.keys(rec).filter((k) => /photo|image|pic|avatar|picture/i.test(k));
        console.warn(`[PhotoResolve] Record ${i} photo-related keys:`, keys, '→ values:', keys.map((k) => rec[k]));
      });
    }

    const uniquePhotoSources = Array.from(
      new Set(studentCardData.map((item) => item.photoUrl).filter((value) => Boolean(value)))
    );
    console.debug(`[PhotoResolve] ${uniquePhotoSources.length} unique photo URLs to fetch (out of ${studentCardData.length} records)`);

    const studentPhotoBufferByUrl = new Map<string, Buffer>();
    await Promise.all(
      uniquePhotoSources.map(async (photoSource) => {
        const buffer = await loadStudentPhotoBuffer(photoSource, req);
        if (buffer) {
          studentPhotoBufferByUrl.set(photoSource, buffer);
        } else {
          console.warn(`[PhotoResolve] Failed to load photo buffer for: ${photoSource}`);
        }
      })
    );
    console.debug(`[PhotoResolve] Successfully loaded ${studentPhotoBufferByUrl.size} / ${uniquePhotoSources.length} photo buffers`);

    const orientation = configuration.orientation === 'landscape' ? 'landscape' : 'portrait';
    let sheetWidthMm = clampNumber(configuration.sheetSize?.widthMm, 210, 10, 2000);
    let sheetHeightMm = clampNumber(configuration.sheetSize?.heightMm, 297, 10, 2000);

    if (orientation === 'landscape' && sheetHeightMm > sheetWidthMm) {
      const temp = sheetWidthMm;
      sheetWidthMm = sheetHeightMm;
      sheetHeightMm = temp;
    }
    if (orientation === 'portrait' && sheetWidthMm > sheetHeightMm) {
      const temp = sheetWidthMm;
      sheetWidthMm = sheetHeightMm;
      sheetHeightMm = temp;
    }

    const templateType: TemplateType = isTemplateType(configuration.templateType)
      ? configuration.templateType
      : resolvedTemplate.templateType;

    const cardWidthMm = configuration.cardSize?.widthMm
      ? clampNumber(configuration.cardSize.widthMm, templateType === 'id_card' ? 86 : 140, 10, 1000)
      : clampNumber(resolvedTemplate.canvas.width, templateType === 'id_card' ? 86 : 140, 10, 1000);
    const cardHeightMm = configuration.cardSize?.heightMm
      ? clampNumber(configuration.cardSize.heightMm, templateType === 'id_card' ? 54 : 90, 10, 1000)
      : clampNumber(resolvedTemplate.canvas.height, templateType === 'id_card' ? 54 : 90, 10, 1000);

    const marginTopMm = clampNumber(configuration.pageMargin?.topMm, 8, 0, 100);
    const marginLeftMm = clampNumber(configuration.pageMargin?.leftMm, 8, 0, 100);
    const rowMarginMm = clampNumber(configuration.rowMarginMm, 4, 0, 50);
    const columnMarginMm = clampNumber(configuration.columnMarginMm, 4, 0, 50);



    const availableWidthMm = sheetWidthMm - (marginLeftMm * 2);
    const availableHeightMm = sheetHeightMm - (marginTopMm * 2);

    if (availableWidthMm <= 0 || availableHeightMm <= 0) {
      res.status(400).json({ success: false, error: 'Margins are too large for selected sheet size' });
      return;
    }

    const columns = Math.max(1, Math.floor((availableWidthMm + columnMarginMm) / (cardWidthMm + columnMarginMm)));
    const rows = Math.max(1, Math.floor((availableHeightMm + rowMarginMm) / (cardHeightMm + rowMarginMm)));
    const pageCapacity = columns * rows;

    const previewImageBufferByTemplateId = new Map<string, Buffer | null>();
    await Promise.all(
      Array.from(resolvedTemplateById.entries()).map(async ([templateId, resolved]) => {
        const previewSource = resolved.thumbnail || resolved.previewImageUrl;
        const buffer = await loadTemplatePreviewBuffer(previewSource);
        previewImageBufferByTemplateId.set(templateId, buffer);
      })
    );

    // Extract canvas render info and load canvas background images for variable substitution
    const canvasRenderInfoByTemplateId = new Map<string, CanvasRenderInfo | null>();
    for (const [templateId, resolved] of resolvedTemplateById.entries()) {
      if (resolved.layoutJSON) {
        const info = extractCanvasRenderInfo(
          resolved.layoutJSON,
          resolved.canvas.width,   // mm – used as fallback when config block is absent
          resolved.canvas.height,
        );
        canvasRenderInfoByTemplateId.set(templateId, info);
        if (info) {
          console.debug(`[CanvasRender] Template ${templateId}: canvas=${info.canvasWidthPx}x${info.canvasHeightPx}, texts=${info.textObjects.length}, dynamic=${info.hasDynamicText}, bgSrc=${info.backgroundImageSrc ? 'yes' : 'no'}`);
        } else {
          console.warn(`[CanvasRender] Template ${templateId}: failed to parse canvasJSON (layoutJSON length=${resolved.layoutJSON.length})`);
        }
      }
    }

    const canvasBgBufferByTemplateId = new Map<string, Buffer | null>();
    await Promise.all(
      Array.from(canvasRenderInfoByTemplateId.entries()).map(async ([templateId, canvasInfo]) => {
        if (!canvasInfo?.backgroundImageSrc) return;
        const absUrl = toAbsoluteAssetUrl(canvasInfo.backgroundImageSrc, req);
        if (!absUrl) return;
        const buffer = await loadTemplatePreviewBuffer(absUrl);
        canvasBgBufferByTemplateId.set(templateId, buffer ?? null);
      })
    );

    const safeName = sanitizeFileName(configuration.fileName);

    const doc = new PDFDocument({
      autoFirstPage: false,
      compress: true,
      margin: 0,
      size: [mmToPt(sheetWidthMm), mmToPt(sheetHeightMm)],
    });

    const previewImageByTemplateId = new Map<string, any>();
    previewImageBufferByTemplateId.forEach((buffer, templateId) => {
      if (!buffer) return;
      try {
        const image = (doc as any).openImage(buffer);
        if (image) {
          previewImageByTemplateId.set(templateId, image);
        }
      } catch {
        // Ignore preview image decoding errors per template.
      }
    });

    const canvasBgImageByTemplateId = new Map<string, any>();
    canvasBgBufferByTemplateId.forEach((buffer, templateId) => {
      if (!buffer) return;
      try {
        const image = (doc as any).openImage(buffer);
        if (image) {
          canvasBgImageByTemplateId.set(templateId, image);
        }
      } catch { /* ignore */ }
    });

    // Stream PDF bytes directly to the response — no in-memory buffering.
    // Browser starts receiving data immediately instead of waiting for all
    // pages to be generated.
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}.pdf"`);
    res.setHeader('x-preview-template-id', requestedTemplateId);
    res.setHeader('x-preview-template-slug', resolvedTemplate.templateSlug);
    res.setHeader('x-preview-template-has-html', resolvedTemplate.templateHtml ? '1' : '0');
    res.setHeader('x-preview-has-layout', resolvedTemplate.hasValidLayout ? '1' : '0');
    res.setHeader('x-preview-layout-elements', String(resolvedTemplate.elementCount));
    res.setHeader('x-preview-record-count', String(selectedRecords.length));
    doc.pipe(res);

    const studentPhotoImageByUrl = new Map<string, any>();
    studentPhotoBufferByUrl.forEach((buffer, photoSource) => {
      try {
        const image = (doc as any).openImage(buffer);
        if (image) {
          studentPhotoImageByUrl.set(photoSource, image);
        }
      } catch {
        // Ignore invalid per-student photos and keep generating remaining cards.
      }
    });

    const resolveTemplateIdForRecord = (record: Record<string, unknown>): string => {
      if (!useFieldBasedMapping || templateMappings.length === 0) {
        return requestedTemplateId;
      }

      const resolveValueForMappingField = (fieldName: string): string => {
        const normalized = fieldName.toLowerCase().replace(/[^a-z0-9]/g, '');

        const direct = getRecordValueByAliases(record, [fieldName]);
        if (direct) return direct;

        // Semantic fallbacks for common student-data fields.
        if (normalized.includes('admission') || normalized.includes('roll')) {
          return getRecordValueByAliases(record, [
            'Admission Number',
            'Admission No',
            'Admission No.',
            'admissionNo',
            'admission_no',
            'admissionno',
            'rollNo',
            'roll_no',
            'roll',
          ]);
        }
        if (normalized.includes('school') && normalized.includes('code')) {
          return getRecordValueByAliases(record, ['School Code', 'schoolCode', 'school_code', 'schoolcode', 'code', 'schoolId']);
        }
        if (normalized.includes('name') || normalized.includes('student')) {
          return getRecordValueByAliases(record, ['Name', 'name', 'studentName', 'Student Name', 'fullName']);
        }

        return '';
      };

      for (const mapping of templateMappings) {
        const fieldName = String(mapping?.fieldName || '').trim();
        const fieldValue = String(mapping?.fieldValue || '').trim();
        const templateId = String(mapping?.templateId || '').trim();
        if (!fieldName || !fieldValue || !templateId) continue;

        const recordValue = resolveValueForMappingField(fieldName);

        const recordNumeric = Number(recordValue);
        const mappingNumeric = Number(fieldValue);
        const numericMatch = Number.isFinite(recordNumeric) && Number.isFinite(mappingNumeric) && recordNumeric === mappingNumeric;

        const matched = recordValue === fieldValue || numericMatch;
        if (matched) {
          console.log(`[TEMPLATE MAPPING] MATCH field="${fieldName}" recordValue="${recordValue}" fieldValue="${fieldValue}" templateId="${templateId}"`);
          return templateId;
        } else {
          console.log(`[TEMPLATE MAPPING] NO_MATCH field="${fieldName}" recordValue="${recordValue}" fieldValue="${fieldValue}"`);
        }
      }

      // Use the requested template as the canonical default for all non-matching records.
      // This guarantees mapped templates only apply to records that actually match.
      console.log(`[TEMPLATE MAPPING] DEFAULT templateId="${requestedTemplateId}"`);
      return requestedTemplateId;
    };

    const addPage = (records: Array<Record<string, unknown>>, pageIndex: number) => {
      doc.addPage({
        size: [mmToPt(sheetWidthMm), mmToPt(sheetHeightMm)],
        margin: 0,
      });

      if (configuration.isSample) {
        doc.save();
        doc.rotate(-30, { origin: [mmToPt(sheetWidthMm / 2), mmToPt(sheetHeightMm / 2)] });
        doc.fillColor('#d1d5db').fontSize(40).text('SAMPLE', mmToPt(sheetWidthMm * 0.2), mmToPt(sheetHeightMm * 0.45), {
          width: mmToPt(sheetWidthMm * 0.6),
          align: 'center',
        });
        doc.restore();
      }

      records.forEach((record, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        const globalRecordIndex = pageIndex * pageCapacity + index;
        const xMm = marginLeftMm + col * (cardWidthMm + columnMarginMm);
        const yMm = marginTopMm + row * (cardHeightMm + rowMarginMm);
        const student = studentCardData[globalRecordIndex] || resolveStudentCardData(record, req);
        const studentPhotoImage = student.photoUrl ? studentPhotoImageByUrl.get(student.photoUrl) || null : null;
        const recordTemplateId = resolveTemplateIdForRecord(record);
        const recordTemplate = resolvedTemplateById.get(recordTemplateId) || resolvedTemplate;
        const recordPreviewImage = previewImageByTemplateId.get(recordTemplateId) || previewImageByTemplateId.get(requestedTemplateId) || null;

        const canvasInfo = canvasRenderInfoByTemplateId.get(recordTemplateId) ?? null;
        if (canvasInfo && canvasInfo.hasDynamicText) {
          // Canvas-based rendering: substitute all {{VARIABLE}} placeholders
          const canvasBgImage = canvasBgImageByTemplateId.get(recordTemplateId) ?? null;
          renderCardFromCanvas(
            doc,
            xMm,
            yMm,
            cardWidthMm,
            cardHeightMm,
            canvasInfo,
            record,
            canvasBgImage,
            recordPreviewImage,
            studentPhotoImage,
          );
        } else {
          renderTemplateCard(recordTemplate.templateSlug as TemplateSlug, {
            doc,
            xMm,
            yMm,
            cardWidthMm,
            cardHeightMm,
            templateLabel: recordTemplate.templateName,
            student,
            studentPhotoImage,
            previewImage: recordPreviewImage,
          });
        }

      });
    };

    for (let i = 0; i < selectedRecords.length; i += pageCapacity) {
      addPage(selectedRecords.slice(i, i + pageCapacity), Math.floor(i / pageCapacity));
    }

    doc.end();
    // doc.pipe(res) handles flushing and closing the response stream.
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message || 'Failed to generate preview PDF' });
  }
});

export default router;
