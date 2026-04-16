import { Router, Request, Response } from 'express';
import PDFDocument from 'pdfkit';

const router = Router();

const MM_TO_PT = 72 / 25.4;

interface TemplatePayload {
  id?: string;
  templateName?: string;
  templateType?: 'id_card' | 'certificate' | 'poster' | 'custom';
  canvas?: {
    width?: number;
    height?: number;
  };
  thumbnail?: string;
  previewImageUrl?: string;
  layoutJSON?: string;
  /** Pre-computed from client diagnostics — skips server-side JSON parsing of canvasJSON. */
  hasValidLayout?: boolean;
  elementCount?: number;
}

interface PreviewRequestBody {
  selectedRecordIds?: string[];
  selectedRecords?: Array<Record<string, unknown>>;
  configuration?: {
    pageSize?: string;
    templateId?: string;
    orientation?: 'portrait' | 'landscape';
    templateType?: 'id_card' | 'certificate' | 'poster' | 'custom';
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

function getRecordTitle(record: Record<string, unknown>, index: number): string {
  const preferredKeys = ['name', 'Name', 'studentName', 'fullName', 'admissionNo', 'rollNo'];

  for (const key of preferredKeys) {
    const raw = record[key];
    const value = String(raw ?? '').trim();
    if (value) return value;
  }

  return `Record ${index + 1}`;
}

function getRecordSubtitleLines(record: Record<string, unknown>): string[] {
  const excludedKeys = new Set(['id', 'projectId', 'category', 'photo', 'barcode']);
  const lines: string[] = [];

  for (const [key, value] of Object.entries(record)) {
    if (excludedKeys.has(key)) continue;
    const text = String(value ?? '').trim();
    if (!text) continue;
    lines.push(`${key}: ${text}`);
    if (lines.length >= 3) break;
  }

  return lines;
}

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as PreviewRequestBody;
    const selectedRecordIds = Array.isArray(body.selectedRecordIds) ? body.selectedRecordIds : [];
    const selectedRecords = Array.isArray(body.selectedRecords) ? body.selectedRecords : [];
    const configuration = body.configuration || {};
    const template = body.template || {};
    const requestedTemplateId = String(configuration.templateId || '').trim();

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

    // Use pre-computed diagnostics from client if available (avoids parsing large layoutJSON).
    // Falls back to server-side parsing for backward compatibility.
    let hasValidLayout: boolean;
    let elementCount: number;
    if (typeof template.hasValidLayout === 'boolean' && typeof template.elementCount === 'number') {
      hasValidLayout = template.hasValidLayout;
      elementCount = template.elementCount;
    } else {
      ({ hasValidLayout, elementCount } = parseLayoutAndCountElements(template.layoutJSON));
    }
    if (!hasValidLayout || elementCount === 0) {
      res.status(400).json({ success: false, error: 'No preview available. Please configure the template.' });
      return;
    }

    console.debug('[PreviewAPI] Generating preview', {
      templateId: requestedTemplateId,
      selectedRecordCount: selectedRecords.length,
      layoutElementCount: elementCount,
    });

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

    const templateType = configuration.templateType || template.templateType || 'id_card';
    const cardWidthMm = clampNumber(template.canvas?.width, templateType === 'id_card' ? 86 : 140, 10, 1000);
    const cardHeightMm = clampNumber(template.canvas?.height, templateType === 'id_card' ? 54 : 90, 10, 1000);

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
    const previewSource = template.thumbnail || template.previewImageUrl;
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
    const previewImage = previewImageBuffer ? doc.openImage(previewImageBuffer) : null;

    // Stream PDF bytes directly to the response — no in-memory buffering.
    // Browser starts receiving data immediately instead of waiting for all
    // pages to be generated.
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}.pdf"`);
    res.setHeader('x-preview-template-id', requestedTemplateId);
    res.setHeader('x-preview-has-layout', hasValidLayout ? '1' : '0');
    res.setHeader('x-preview-layout-elements', String(elementCount));
    res.setHeader('x-preview-record-count', String(selectedRecords.length));
    doc.pipe(res);

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
        const xMm = marginLeftMm + col * (cardWidthMm + columnMarginMm);
        const yMm = marginTopMm + row * (cardHeightMm + rowMarginMm);

        doc.save();
        doc.lineWidth(1);
        doc.strokeColor('#d1d5db');
        doc.roundedRect(mmToPt(xMm), mmToPt(yMm), mmToPt(cardWidthMm), mmToPt(cardHeightMm), mmToPt(1.5));
        doc.stroke();
        doc.restore();

        const headerHeightMm = Math.min(16, Math.max(10, cardHeightMm * 0.25));
        doc.save();
        doc.fillColor('#f8fafc');
        doc.rect(mmToPt(xMm), mmToPt(yMm), mmToPt(cardWidthMm), mmToPt(headerHeightMm));
        doc.fill();
        doc.restore();

        doc.fillColor('#0f172a').fontSize(8).text(
          String(template.templateName || configuration.templateType || 'Template'),
          mmToPt(xMm + 2),
          mmToPt(yMm + 2),
          { width: mmToPt(cardWidthMm - 4), lineBreak: false }
        );

        if (previewImage) {
          try {
            doc.image(previewImage as any, mmToPt(xMm + 2), mmToPt(yMm + headerHeightMm + 1), {
              fit: [mmToPt(cardWidthMm - 4), mmToPt(cardHeightMm * 0.45)],
              align: 'center',
              valign: 'center',
            });
          } catch {
            // Ignore preview image draw failures and keep generating PDF.
          }
        }

        const title = getRecordTitle(record, pageIndex * pageCapacity + index);
        doc.fillColor('#111827').fontSize(9).text(
          title,
          mmToPt(xMm + 2),
          mmToPt(yMm + cardHeightMm * 0.65),
          {
            width: mmToPt(cardWidthMm - 4),
            lineBreak: false,
            ellipsis: true,
          }
        );

        const subtitleLines = getRecordSubtitleLines(record);
        subtitleLines.forEach((line, lineIndex) => {
          doc.fillColor('#374151').fontSize(7).text(
            line,
            mmToPt(xMm + 2),
            mmToPt(yMm + cardHeightMm * 0.73 + (lineIndex * 4.2)),
            {
              width: mmToPt(cardWidthMm - 4),
              lineBreak: false,
              ellipsis: true,
            }
          );
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
