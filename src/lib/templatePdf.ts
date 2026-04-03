import * as fabric from "fabric";
import jsPDF from "jspdf";
import { mmToPx } from "./fabricUtils";
import type { ProjectTemplate } from "./projectStore";

const MM_TO_PT = 2.8346;

interface SavedTemplateCanvasPayload {
  canvas?: object;
  pages?: Array<{ id: string; name?: string; canvas: object }>;
}

function parseCanvasPayload(template: ProjectTemplate): SavedTemplateCanvasPayload | null {
  if (!template.canvasJSON) return null;
  try {
    return JSON.parse(template.canvasJSON) as SavedTemplateCanvasPayload;
  } catch {
    return null;
  }
}

async function renderCanvasToPng(canvasJson: object, widthMm: number, heightMm: number): Promise<string> {
  const widthPx = Math.max(1, Math.round(mmToPx(widthMm)));
  const heightPx = Math.max(1, Math.round(mmToPx(heightMm)));

  const canvasElement = document.createElement("canvas");
  const staticCanvas = new fabric.StaticCanvas(canvasElement, {
    width: widthPx,
    height: heightPx,
    renderOnAddRemove: false,
  });

  try {
    await staticCanvas.loadFromJSON(JSON.stringify(canvasJson));
    staticCanvas.renderAll();
    return staticCanvas.toDataURL({
      format: "png",
      multiplier: 2,
      left: 0,
      top: 0,
      width: staticCanvas.getWidth(),
      height: staticCanvas.getHeight(),
      enableRetinaScaling: true,
      filter: (obj: fabric.FabricObject) => {
        const anyObj = obj as any;
        return !anyObj.excludeFromExport && !anyObj.isGuide;
      },
    } as any);
  } finally {
    staticCanvas.dispose();
  }
}

export async function downloadTemplateAsPdf(template: ProjectTemplate): Promise<void> {
  const widthPt = template.canvas.width * MM_TO_PT;
  const heightPt = template.canvas.height * MM_TO_PT;
  const doc = new jsPDF({
    orientation: widthPt > heightPt ? "l" : "p",
    unit: "pt",
    format: [widthPt, heightPt],
  });

  const payload = parseCanvasPayload(template);
  const pageCanvases = payload?.pages?.length
    ? payload.pages.map((p) => p.canvas)
    : payload?.canvas
      ? [payload.canvas]
      : [];

  if (pageCanvases.length) {
    for (let i = 0; i < pageCanvases.length; i += 1) {
      const png = await renderCanvasToPng(pageCanvases[i], template.canvas.width, template.canvas.height);
      if (i > 0) doc.addPage([widthPt, heightPt], widthPt > heightPt ? "landscape" : "portrait");
      doc.addImage(png, "PNG", 0, 0, widthPt, heightPt);
    }
  } else if (template.thumbnail) {
    doc.addImage(template.thumbnail, "PNG", 0, 0, widthPt, heightPt);
  } else {
    throw new Error("No design content available to generate PDF");
  }

  doc.save(`${template.templateName || "template"}.pdf`);
}
