import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import ProductTemplate from '../models/ProductTemplate';

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
    fileName?: string;
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

async function loadTemplatePreviewBuffer(src: string | undefined): Promise<Buffer | null> {
  if (!src) return null;

  if (src.startsWith('data:image/')) {
    return parseDataUrl(src);
  }

  if (!/^https?:\/\//i.test(src)) {
    return null;
  }

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

  if (/template[\s_-]*1|id[\s_-]*card|classic/.test(value)) return 'template_1';
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
    console.debug('[PreviewAPI] fetched template from DB', {
      templateId: requestedTemplateId,
      templateName: dbTemplate.templateName,
      templateType: dbTemplate.templateType,
      templateSlug: dbTemplate.templateSlug,
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
  for (const alias of aliases) {
    const direct = String(record[alias] ?? '').trim();
    if (direct) return direct;

    const caseInsensitive = Object.entries(record).find(([key]) => key.toLowerCase() === alias.toLowerCase());
    const fromEntry = String(caseInsensitive?.[1] ?? '').trim();
    if (fromEntry) return fromEntry;
  }
  return '';
}

function toAbsoluteAssetUrl(rawValue: string, req: Request): string {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';

  if (/^(data:image\/|blob:|https?:\/\/)/i.test(raw)) {
    return raw;
  }

  const host = req.get('host') || 'localhost:5000';
  const base = `${req.protocol}://${host}`;

  if (raw.startsWith('/')) return `${base}${raw}`;
  if (/^(uploads|student-photos)\//i.test(raw)) return `${base}/${raw}`;

  return raw;
}

async function loadStudentPhotoBuffer(rawSource: string, req: Request): Promise<Buffer | null> {
  const source = toAbsoluteAssetUrl(rawSource, req);
  if (!source) return null;
  return loadTemplatePreviewBuffer(source);
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
    'photoUrl',
    'photo_url',
    'image',
    'Image',
    'imageUrl',
    'image_url',
    'avatar',
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

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as PreviewRequestBody;
    const selectedRecordIds = Array.isArray(body.selectedRecordIds) ? body.selectedRecordIds : [];
    const selectedRecords = Array.isArray(body.selectedRecords) ? body.selectedRecords : [];
    const configuration = body.configuration || {};
    const template = body.template || {};
    const requestedTemplateId = String(configuration.templateId || '').trim();

    console.debug('[PreviewAPI] incoming request', {
      templateId: requestedTemplateId,
      selectedRecordCount: selectedRecords.length,
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

    const resolvedTemplate = await resolveTemplateForPreview(requestedTemplateId, template, configuration);
    if (!resolvedTemplate) {
      res.status(404).json({ success: false, error: 'Template not found for preview generation' });
      return;
    }

    if (!resolvedTemplate.templateSlug) {
      res.status(400).json({
        success: false,
        error: `Template slug could not be resolved for "${resolvedTemplate.templateName}".`,
      });
      return;
    }

    if (!resolvedTemplate.hasValidLayout && !resolvedTemplate.previewImageUrl && !resolvedTemplate.thumbnail) {
      res.status(400).json({ success: false, error: 'No preview available. Please configure the template.' });
      return;
    }

    console.debug('[PreviewAPI] Generating preview', {
      templateId: requestedTemplateId,
      templateSource: resolvedTemplate.source,
      templateSlug: resolvedTemplate.templateSlug,
      hasTemplateHtml: Boolean(resolvedTemplate.templateHtml),
      selectedRecordCount: selectedRecords.length,
      layoutElementCount: resolvedTemplate.elementCount,
    });

    const studentCardData = selectedRecords.map((record) => resolveStudentCardData(record, req));
    console.debug('[PreviewAPI] mapped first student data', studentCardData[0] || null);

    const uniquePhotoSources = Array.from(
      new Set(studentCardData.map((item) => item.photoUrl).filter((value) => Boolean(value)))
    );

    const studentPhotoBufferByUrl = new Map<string, Buffer>();
    await Promise.all(
      uniquePhotoSources.map(async (photoSource) => {
        const buffer = await loadStudentPhotoBuffer(photoSource, req);
        if (buffer) {
          studentPhotoBufferByUrl.set(photoSource, buffer);
        }
      })
    );

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

    const cardWidthMm = clampNumber(resolvedTemplate.canvas.width, templateType === 'id_card' ? 86 : 140, 10, 1000);
    const cardHeightMm = clampNumber(resolvedTemplate.canvas.height, templateType === 'id_card' ? 54 : 90, 10, 1000);

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

    // Fetch thumbnail buffer before creating the PDFDocument so we can
    // call doc.openImage() immediately after construction.
    const previewSource = resolvedTemplate.thumbnail || resolvedTemplate.previewImageUrl;
    const previewImageBuffer = await loadTemplatePreviewBuffer(previewSource);

    const safeName = sanitizeFileName(configuration.fileName);

    const doc = new PDFDocument({
      autoFirstPage: false,
      compress: true,
      margin: 0,
      size: [mmToPt(sheetWidthMm), mmToPt(sheetHeightMm)],
    });

    // Register the thumbnail image once. PDFKit reuses the same PDF image
    // object for every card — no re-encoding per card.
    const previewImage = previewImageBuffer ? (doc as any).openImage(previewImageBuffer) : null;

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

        renderTemplateCard(resolvedTemplate.templateSlug as TemplateSlug, {
          doc,
          xMm,
          yMm,
          cardWidthMm,
          cardHeightMm,
          templateLabel: resolvedTemplate.templateName,
          student,
          studentPhotoImage,
          previewImage,
        });
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
