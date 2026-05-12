/**
 * useGenerateMissingPreviews
 *
 * Shared React hook that generates and uploads missing template preview
 * thumbnails in the background using Fabric.js StaticCanvas.
 *
 * Used by:
 *   - TemplateGallery.tsx   (global gallery)
 *   - ProjectDetail.tsx     (per-project templates)
 *
 * For each template ID in `templateIds`:
 *   1. Try localStorage cache (fast path — populated by DesignerStudio)
 *   2. Fetch full TemplateRecord from the server if not cached
 *   3a. If the full record already has a preview_image URL (gallery meta out
 *       of sync), skip rendering and just call onPreviewGenerated with the URL
 *   3b. Otherwise render the canvasJSON with Fabric StaticCanvas → toDataURL
 *       → uploadTemplatePreview → call onPreviewGenerated with the stored path
 *
 * CORS taint is avoided by ONLY stripping Image objects whose src is an
 * external HTTP(S) URL pointing to a different origin. Data URL images,
 * blob URLs, and same-origin relative/absolute paths are safe and are kept
 * so templates that use embedded photo layers render correctly.
 *
 * Canvas dimensions stored in designData are in millimetres; they are
 * converted to pixels (96 DPI) before creating the off-screen canvas.
 *
 * AVIF backgroundImages are converted to PNG before passing to Fabric because
 * some browsers cannot decode AVIF in the 2-D canvas context.
 */
import { useEffect, useRef, useState } from "react";
import {
  getTemplateById,
  readTemplateFromLocalCache,
  writeTemplateToLocalCache,
  uploadTemplatePreview,
} from "./templateApi";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convert millimetres to pixels at 96 DPI (the browser standard). */
function mmToPx(mm: number): number {
  return Math.round((mm * 96) / 25.4);
}

/**
 * Returns true only for HTTP(S) URLs pointing to a *different* origin.
 * Data URLs, blob URLs, relative paths, and same-origin URLs are all safe
 * for canvas.drawImage() and will NOT taint the canvas.
 */
function isExternalCrossOriginUrl(src: string): boolean {
  if (!src) return false;
  try {
    const url = new URL(src, window.location.href);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.origin !== window.location.origin
    );
  } catch {
    return false; // relative paths, malformed — treat as safe
  }
}

/**
 * Try to convert an AVIF (or other non-universally-supported format) data URL
 * to PNG by drawing it through a temporary HTML canvas.
 * Returns the original src on any error so callers can still attempt rendering.
 * Returns an empty string if the image fails to load entirely.
 */
async function convertDataUrlToPng(src: string): Promise<string> {
  if (!src.startsWith("data:")) return src;
  return new Promise<string>((resolve) => {
    const img = new Image();
    const timer = window.setTimeout(() => {
      img.onload = img.onerror = null;
      resolve(src); // timed out — return original; Fabric will try its luck
    }, 10_000);
    img.onload = () => {
      window.clearTimeout(timer);
      if (!img.naturalWidth || !img.naturalHeight) { resolve(""); return; }
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      if (!ctx) { resolve(src); return; }
      ctx.drawImage(img, 0, 0);
      try { resolve(c.toDataURL("image/png")); }
      catch { resolve(src); }
    };
    img.onerror = () => { window.clearTimeout(timer); resolve(""); };
    img.src = src;
  });
}

/**
 * Returns true when a generated data URL appears to be a blank / all-white
 * image — i.e. the render produced no meaningful content.
 * Uses a fast pixel-sampling approach on a small down-scaled copy.
 */
async function isBlankPreview(dataUrl: string): Promise<boolean> {
  if (!dataUrl.startsWith("data:image/")) return true;
  // Very small data URLs are almost certainly blank (< ~1 KB PNG).
  if (dataUrl.length < 800) return true;
  return new Promise<boolean>((resolve) => {
    const img = new Image();
    const timer = window.setTimeout(() => { img.onload = img.onerror = null; resolve(false); }, 5_000);
    img.onload = () => {
      window.clearTimeout(timer);
      const SAMPLE = 60;
      const c = document.createElement("canvas");
      c.width = SAMPLE; c.height = SAMPLE;
      const ctx = c.getContext("2d");
      if (!ctx || !img.naturalWidth) { resolve(false); return; }
      ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
      const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);
      let nonWhite = 0;
      for (let i = 0; i < data.length; i += 4) {
        const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
        if (a > 20 && (r < 235 || g < 235 || b < 235)) nonWhite++;
      }
      // Blank if fewer than 30 non-white pixels in the 60×60 sample
      resolve(nonWhite < 30);
    };
    img.onerror = () => { window.clearTimeout(timer); resolve(false); };
    img.src = dataUrl;
  });
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Generates and uploads missing template previews in the background.
 *
 * Returns a `Set<string>` of template IDs that are **currently being rendered**
 * (Fabric is actively processing them). Callers use this to show a "Generating…"
 * spinner only while work is actually in progress — not for templates that were
 * already attempted but had no design data or produced a blank result.
 */
export function useGenerateMissingPreviews(
  templateIds: string[],
  brokenUrlIds: Set<string>,
  onPreviewGenerated: (id: string, url: string) => void,
): Set<string> {
  // IDs that have been handed to the async loop (prevents duplicate processing).
  const processingRef = useRef<Set<string>>(new Set());

  // IDs that are ACTIVELY being rendered right now (drives the spinner).
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (templateIds.length === 0) return;

    const pending = templateIds.filter((id) => !processingRef.current.has(id));
    if (pending.length === 0) return;

    let cancelled = false;

    (async () => {
      // Load Fabric only when needed — avoids adding it to the initial bundle.
      let StaticCanvas: typeof import("fabric").StaticCanvas;
      try {
        const fab = await import("fabric");
        StaticCanvas = fab.StaticCanvas;
      } catch {
        return; // Fabric not available in this environment
      }

      for (const id of pending) {
        if (cancelled) break;

        // Mark as "in queue" immediately (prevents concurrent re-processing).
        processingRef.current.add(id);

        // Mark as "actively rendering" so the spinner shows.
        if (!cancelled) {
          setActiveIds((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
          });
        }

        /** Remove this ID from the active-rendering set (stops the spinner). */
        const markDone = () => {
          setActiveIds((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        };

        try {
          // 1. Try the fast path: localStorage cache written by DesignerStudio.
          let record = readTemplateFromLocalCache(id);

          // 2. Slow path: fetch full template record from the server.
          // Use a shorter timeout (30 s) for background preview generation — the user should
          // not see a "Generating…" spinner for 2 minutes waiting for Atlas M0 to wake up.
          if (!record) {
            try {
              record = await getTemplateById(id, { timeoutMs: 30_000 });
              if (record) writeTemplateToLocalCache(id, record);
            } catch {
              // Network error — allow retry by keeping processingRef entry.
              // processingRef.current stays set so this run doesn't retry,
              // but on the next effect trigger (new IDs) it will be skipped.
              // Remove from processingRef so a future re-queue can retry.
              processingRef.current.delete(id);
              markDone();
              continue;
            }
          }

          if (!record || cancelled) {
            if (!record) {
              // Template not found in DB — permanent failure; keep in processingRef
              // so we never retry this ID.
            }
            markDone();
            continue;
          }

          // ── Fast path A: full record has preview URL, gallery meta out of sync ──
          // Discard corrupt data: URIs (not starting with data:image/) to prevent
          // resolveProfileImageUrl from turning them into /uploads/data%3A... (404).
          const rawDbPreview = String(record.preview_image || record.previewImageUrl || "").trim();
          const dbPreview = /^data:/i.test(rawDbPreview) && !/^data:image\//i.test(rawDbPreview)
            ? "" // corrupt/partial data URL — discard, fall through to canvas render
            : rawDbPreview;
          if (dbPreview && !brokenUrlIds.has(id)) {
            if (dbPreview.startsWith("data:image/")) {
              const path = await uploadTemplatePreview(id, dbPreview);
              if (!cancelled) onPreviewGenerated(id, path || dbPreview);
            } else {
              if (!cancelled) onPreviewGenerated(id, dbPreview);
            }
            markDone();
            continue;
          }

          // ── Render from canvasJSON ──────────────────────────────────────────
          const dd = record.designData as Record<string, any> | undefined;

          const rawCanvasJSON =
            typeof dd?.canvasJSON === "string" ? dd.canvasJSON
            : typeof dd?.canvasJson === "string" ? dd.canvasJson
            : null;

          let fabricJSON: string | null = null;
          if (rawCanvasJSON) {
            try {
              const parsed = JSON.parse(rawCanvasJSON) as Record<string, any>;
              if (Array.isArray(parsed.pages) && parsed.pages.length > 0) {
                const firstPage = parsed.pages[0] as Record<string, any>;
                const pageCanvas = firstPage.canvas ?? firstPage;
                fabricJSON = JSON.stringify(pageCanvas);
              } else {
                fabricJSON = rawCanvasJSON;
              }
            } catch {
              fabricJSON = rawCanvasJSON;
            }
          }

          if (!fabricJSON || cancelled) {
            // No design data or cancelled — permanent skip; keep in processingRef.
            markDone();
            continue;
          }

          // ── Canvas dimensions (mm → px) ─────────────────────────────────────
          const rawW = Number((dd?.canvas as any)?.width)  || Number(dd?.canvasWidth)  || Number((dd as any)?.width)  || 0;
          const rawH = Number((dd?.canvas as any)?.height) || Number(dd?.canvasHeight) || Number((dd as any)?.height) || 0;
          const w = rawW > 0 ? mmToPx(rawW) : 220;
          const h = rawH > 0 ? mmToPx(rawH) : 350;

          // ── Filter cross-origin image objects (canvas taint prevention) ──────
          let safeJSON = fabricJSON;
          try {
            const json = JSON.parse(fabricJSON) as Record<string, any>;

            if (Array.isArray(json.objects)) {
              json.objects = (json.objects as Record<string, any>[]).filter(
                (o: Record<string, any>) => {
                  const type = String(o.type || "").toLowerCase();
                  if (type !== "image") return true;
                  return !isExternalCrossOriginUrl(String(o.src || ""));
                },
              );
            }

            // Handle backgroundImage: remove external URLs; convert AVIF to PNG.
            if (json.backgroundImage) {
              const bgSrc = String((json.backgroundImage as Record<string, any>).src || "");
              if (isExternalCrossOriginUrl(bgSrc)) {
                delete json.backgroundImage;
              } else if (/^data:image\/avif/i.test(bgSrc)) {
                const pngSrc = await convertDataUrlToPng(bgSrc);
                if (pngSrc) {
                  (json.backgroundImage as Record<string, any>).src = pngSrc;
                } else {
                  delete json.backgroundImage;
                }
              }
            }

            safeJSON = JSON.stringify(json);
          } catch {
            // Parsing failed — proceed with raw JSON.
          }

          if (cancelled) { markDone(); continue; }

          const el = document.createElement("canvas");
          const sc = new StaticCanvas(el, { width: w, height: h, renderOnAddRemove: false });

          let generatedDataUrl = "";

          await new Promise<void>((resolve) => {
            sc.loadFromJSON(safeJSON)
              .then(() => {
                if (!sc.backgroundColor) sc.backgroundColor = "#ffffff";
                (sc as any).clipPath = undefined;
                sc.renderAll();
                try {
                  generatedDataUrl = sc.toDataURL({ format: "png", multiplier: 1 } as any);
                } catch {
                  // Cross-origin taint from a missed external image.
                }
                sc.dispose();
                resolve();
              })
              .catch(() => { sc.dispose(); resolve(); });
          });

          if (!generatedDataUrl || cancelled) {
            // toDataURL failed or tainted — allow retry by deleting from processingRef.
            processingRef.current.delete(id);
            markDone();
            continue;
          }

          // ── Blank detection ────────────────────────────────────────────────
          const blank = await isBlankPreview(generatedDataUrl);
          if (blank) {
            // No visible content — allow retry (design may be added later).
            processingRef.current.delete(id);
            markDone();
            continue;
          }

          if (!cancelled) {
            void uploadTemplatePreview(id, generatedDataUrl).then((path) => {
              if (!cancelled) onPreviewGenerated(id, path || generatedDataUrl);
            });
          }

          markDone();

          // Brief pause between renders to avoid starving the UI thread.
          await new Promise<void>((r) => setTimeout(r, 400));
        } catch {
          // Non-fatal — allow retry.
          processingRef.current.delete(id);
          setActiveIds((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
      }
    })();

    return () => { cancelled = true; };
  // Re-run whenever the set of IDs changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateIds.join(",")]);

  return activeIds;
}
