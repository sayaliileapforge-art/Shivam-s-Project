/**
 * seedDefaultTemplates.ts
 *
 * Runs once on server startup. If no default ProjectDesignTemplates exist,
 * inserts a set of starter templates that are public (visible in every project).
 *
 * Safe to run on every restart — uses a countDocuments guard.
 */

import ProjectDesignTemplate from '../models/ProjectDesignTemplate';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns a base64 SVG data-URI to use as the template thumbnail. */
function svgThumbnail(bgColor: string, accentColor: string, label: string): string {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="297" height="210">`,
    `  <rect width="297" height="210" fill="${bgColor}" rx="8"/>`,
    `  <rect x="20" y="20" width="257" height="170" fill="${accentColor}" rx="6" opacity="0.3"/>`,
    `  <text x="148" y="100" font-family="Arial,sans-serif" font-size="22" font-weight="bold"`,
    `        fill="${accentColor}" text-anchor="middle" dominant-baseline="middle">${label}</text>`,
    `  <text x="148" y="134" font-family="Arial,sans-serif" font-size="13"`,
    `        fill="${accentColor}" text-anchor="middle" dominant-baseline="middle">Default Template</text>`,
    `</svg>`,
  ].join('\n');
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/**
 * Build a minimal canvasJSON that satisfies the front-end's hasDesignElements
 * check (canvas.objects must be a non-empty array).
 *
 * Objects carry variableKey / photoField so the field-mapping diagnostics
 * surface the right warnings ("Missing field: name, photo …").
 */
function idCardCanvasJSON(canvasWidthPx: number, canvasHeightPx: number): string {
  const cx = Math.round(canvasWidthPx / 2);
  const photoR = Math.round(Math.min(canvasWidthPx, canvasHeightPx) * 0.16);
  const photoTop = Math.round(canvasHeightPx * 0.12);
  const textStart = photoTop + photoR * 2 + 16;
  const lineH = Math.round(canvasHeightPx * 0.08);

  return JSON.stringify({
    canvas: {
      objects: [
        {
          type: 'rect', left: 0, top: 0,
          width: canvasWidthPx, height: canvasHeightPx,
          fill: '#eff6ff', rx: 8, ry: 8, selectable: false,
        },
        {
          type: 'circle',
          left: cx - photoR, top: photoTop,
          radius: photoR, fill: '#bfdbfe',
          photoField: 'photo',
        },
        {
          type: 'text', text: 'Student Name',
          left: 20, top: textStart, width: canvasWidthPx - 40,
          fontSize: 16, fontWeight: 'bold', textAlign: 'center',
          fill: '#1e3a5f', variableKey: 'name',
        },
        {
          type: 'text', text: 'Adm No.',
          left: 20, top: textStart + lineH, width: canvasWidthPx - 40,
          fontSize: 13, textAlign: 'center',
          fill: '#1e40af', variableKey: 'admissionNo',
        },
        {
          type: 'text', text: 'Class / Section',
          left: 20, top: textStart + lineH * 2, width: canvasWidthPx - 40,
          fontSize: 13, textAlign: 'center',
          fill: '#1e40af', variableKey: 'class',
        },
      ],
    },
  });
}

function certificateCanvasJSON(canvasWidthPx: number, canvasHeightPx: number): string {
  const cx = Math.round(canvasWidthPx / 2);
  const lineH = Math.round(canvasHeightPx * 0.08);
  const midY = Math.round(canvasHeightPx * 0.42);

  return JSON.stringify({
    canvas: {
      objects: [
        {
          type: 'rect', left: 0, top: 0,
          width: canvasWidthPx, height: canvasHeightPx,
          fill: '#f0fdf4', rx: 0, selectable: false,
        },
        {
          type: 'rect', left: 12, top: 12,
          width: canvasWidthPx - 24, height: canvasHeightPx - 24,
          fill: 'transparent', stroke: '#16a34a', strokeWidth: 3,
        },
        {
          type: 'text', text: 'CERTIFICATE',
          left: 20, top: Math.round(canvasHeightPx * 0.1), width: canvasWidthPx - 40,
          fontSize: 28, fontWeight: 'bold', textAlign: 'center', fill: '#14532d',
        },
        {
          type: 'text', text: 'This is to certify that',
          left: 20, top: Math.round(canvasHeightPx * 0.28), width: canvasWidthPx - 40,
          fontSize: 14, textAlign: 'center', fill: '#166534',
        },
        {
          type: 'text', text: 'Student Name',
          left: 20, top: midY, width: canvasWidthPx - 40,
          fontSize: 22, fontWeight: 'bold', textAlign: 'center',
          fill: '#14532d', variableKey: 'name',
        },
        {
          type: 'text', text: 'Class / Section',
          left: 20, top: midY + lineH, width: canvasWidthPx - 40,
          fontSize: 14, textAlign: 'center',
          fill: '#166534', variableKey: 'class',
        },
      ],
    },
  });
}

function posterCanvasJSON(canvasWidthPx: number, canvasHeightPx: number): string {
  const photoSize = Math.round(Math.min(canvasWidthPx, canvasHeightPx) * 0.18);
  const photoLeft = canvasWidthPx - photoSize - 20;
  const lineH = Math.round(canvasHeightPx * 0.09);
  const textTop = Math.round(canvasHeightPx * 0.55);

  return JSON.stringify({
    canvas: {
      objects: [
        {
          type: 'rect', left: 0, top: 0,
          width: canvasWidthPx, height: canvasHeightPx,
          fill: '#1e1b4b', selectable: false,
        },
        {
          type: 'rect', left: 0, top: 0,
          width: canvasWidthPx, height: Math.round(canvasHeightPx * 0.5),
          fill: '#4338ca',
        },
        {
          type: 'rect',
          left: photoLeft, top: Math.round(canvasHeightPx * 0.52),
          width: photoSize, height: photoSize,
          fill: '#6366f1', rx: photoSize / 2, ry: photoSize / 2,
          photoField: 'photo',
        },
        {
          type: 'text', text: 'Student Name',
          left: 20, top: textTop, width: photoLeft - 30,
          fontSize: 20, fontWeight: 'bold', fill: '#ffffff',
          variableKey: 'name',
        },
        {
          type: 'text', text: 'Adm No.',
          left: 20, top: textTop + lineH, width: photoLeft - 30,
          fontSize: 14, fill: '#a5b4fc', variableKey: 'admissionNo',
        },
        {
          type: 'text', text: 'Class / Section',
          left: 20, top: textTop + lineH * 2, width: photoLeft - 30,
          fontSize: 14, fill: '#a5b4fc', variableKey: 'class',
        },
      ],
    },
  });
}

// ─── mm → pixel helper (same ratio used by the front-end preview) ─────────────
const MM_TO_PX = 96 / 25.4;
function mmToPx(mm: number) { return Math.round(mm * MM_TO_PX); }

// ─── Default template definitions ────────────────────────────────────────────

const SEED_PROJECT_ID = '__default__';

const DEFAULT_TEMPLATES = [
  {
    projectId: SEED_PROJECT_ID,
    templateName: 'ID Card Classic',          // matches slug "template_1" via getTemplateSlugForRender
    templateType: 'id_card',
    canvas: { width: 86, height: 54 },        // standard ID card (mm)
    margin: { top: 2, left: 2, right: 2, bottom: 2 },
    applicableFor: 'All Students',
    isPublic: true,
    isDefault: true,
    get canvasJSON() {
      return idCardCanvasJSON(mmToPx(86), mmToPx(54));
    },
    get thumbnail() {
      return svgThumbnail('#dbeafe', '#1d4ed8', 'ID Card 1');
    },
  },
  {
    projectId: SEED_PROJECT_ID,
    templateName: 'ID Card Minimal',          // matches slug "template_2" via "minimal"
    templateType: 'id_card',
    canvas: { width: 86, height: 54 },
    margin: { top: 2, left: 2, right: 2, bottom: 2 },
    applicableFor: 'All Students',
    isPublic: true,
    isDefault: true,
    get canvasJSON() {
      return idCardCanvasJSON(mmToPx(86), mmToPx(54));
    },
    get thumbnail() {
      return svgThumbnail('#dcfce7', '#15803d', 'ID Card 2');
    },
  },
  {
    projectId: SEED_PROJECT_ID,
    templateName: 'Certificate',              // matches slug "template_2" via "certificate"
    templateType: 'certificate',
    canvas: { width: 297, height: 210 },      // A4 landscape
    margin: { top: 5, left: 5, right: 5, bottom: 5 },
    applicableFor: 'Certificate',
    isPublic: true,
    isDefault: true,
    get canvasJSON() {
      return certificateCanvasJSON(mmToPx(297), mmToPx(210));
    },
    get thumbnail() {
      return svgThumbnail('#f0fdf4', '#15803d', 'Certificate');
    },
  },
  {
    projectId: SEED_PROJECT_ID,
    templateName: 'Poster Modern',            // matches slug "template_3" via "poster|modern"
    templateType: 'poster',
    canvas: { width: 148, height: 210 },      // A5 portrait
    margin: { top: 5, left: 5, right: 5, bottom: 5 },
    applicableFor: 'Events / Notices',
    isPublic: true,
    isDefault: true,
    get canvasJSON() {
      return posterCanvasJSON(mmToPx(148), mmToPx(210));
    },
    get thumbnail() {
      return svgThumbnail('#1e1b4b', '#818cf8', 'Poster');
    },
  },
];

// ─── Exported seed function ───────────────────────────────────────────────────

export async function seedDefaultTemplates(): Promise<void> {
  try {
    const existing = await ProjectDesignTemplate.countDocuments({
      projectId: SEED_PROJECT_ID,
      isDefault: true,
    });

    if (existing > 0) {
      console.log(`[Seed] Default templates already present (${existing}). Skipping.`);
      return;
    }

    // Evaluate getters so Mongoose gets plain objects
    const docs = DEFAULT_TEMPLATES.map((t) => ({
      projectId: t.projectId,
      templateName: t.templateName,
      templateType: t.templateType,
      canvas: t.canvas,
      margin: t.margin,
      applicableFor: t.applicableFor,
      isPublic: t.isPublic,
      isDefault: t.isDefault,
      canvasJSON: t.canvasJSON,
      thumbnail: t.thumbnail,
    }));

    await ProjectDesignTemplate.insertMany(docs);
    console.log(`[Seed] Inserted ${docs.length} default templates.`);
  } catch (err) {
    // Non-fatal — log and continue starting the server
    console.error('[Seed] Failed to seed default templates:', err);
  }
}
