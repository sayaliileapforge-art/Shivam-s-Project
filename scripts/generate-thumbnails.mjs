/**
 * generate-thumbnails.mjs
 *
 * Generates preview thumbnails for all templates that have broken/missing
 * preview images. Uses Fabric.js (Node.js build) + node-canvas to render
 * the template design and uploads the result to the backend.
 *
 * Run from the project root:
 *   node scripts/generate-thumbnails.mjs
 *
 * The backend must be running on localhost:5000.
 */

// ── Polyfill fetch for older Node versions ──────────────────────────────────
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const BACKEND = 'http://localhost:5000';
const MM_TO_PX = 96 / 25.4; // ≈ 3.7795 px/mm

// ── Helpers ─────────────────────────────────────────────────────────────────

function mmToPx(mm) {
  return Math.round(mm * MM_TO_PX);
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${BACKEND}${path}`, opts);
  const body = await res.text();
  let json;
  try { json = JSON.parse(body); } catch { throw new Error(`Non-JSON response from ${path}: ${body.slice(0, 200)}`); }
  if (!res.ok || json.success === false) {
    throw new Error(json.error || json.message || `HTTP ${res.status} from ${path}`);
  }
  return json.data;
}

/**
 * Returns true if the preview URL is broken (empty, points to /images/thumb-*
 * which no longer exist, or contains localhost).
 */
function isPreviewBroken(previewUrl) {
  if (!previewUrl) return true;
  // Old thumb paths don't exist anymore
  if (/\/images\/thumb-/.test(previewUrl)) return true;
  // Localhost absolute URLs are unreachable
  if (/localhost|127\.0\.0\.1/.test(previewUrl)) return true;
  return false;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function renderTemplate(templateData) {
  // Parse canvasJSON
  // Helper: does this object look like a Fabric canvas JSON?
  const isFabricCanvas = (obj) =>
    obj && typeof obj === 'object' && !Array.isArray(obj) &&
    (Array.isArray(obj.objects) || typeof obj.version === 'string');

  // Helper: parse a value if it is a JSON string
  const tryParse = (v) => {
    if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
    return (v && typeof v === 'object') ? v : null;
  };

  const designData = templateData.designData;
  if (!designData) throw new Error('No designData in template');

  // designData itself might be an object OR a JSON string
  const rawDesign = tryParse(designData) || designData;

  // Templates store the design in different layouts. The outer object (rawDesign)
  // is usually { canvasJSON: <full-design-or-fabric-canvas>, canvas: {w,h}, ... }
  // The FULL design JSON (canvasJSON) may wrap the Fabric canvas inside pages[0].canvas
  // or canvas. We need to find the Fabric canvas wherever it lives.

  // Step 1: get the "inner" design object from rawDesign.canvasJSON (if it exists)
  const innerDesign = tryParse(rawDesign?.canvasJSON) || null;

  // Step 2: locate the Fabric canvas – try every known location
  const fabricJSON =
    // Case A: innerDesign.pages[0].canvas (new multi-page format)
    (innerDesign?.pages?.[0]?.canvas) ||
    // Case B: innerDesign.canvas (old single-canvas, if it looks like Fabric)
    (isFabricCanvas(innerDesign?.canvas) ? innerDesign.canvas : null) ||
    // Case C: innerDesign IS the Fabric canvas itself
    (isFabricCanvas(innerDesign) ? innerDesign : null) ||
    // Case D: rawDesign.pages[0].canvas (no canvasJSON wrapper)
    (rawDesign?.pages?.[0]?.canvas) ||
    // Case E: rawDesign.canvas (old format without wrapper)
    (isFabricCanvas(rawDesign?.canvas) ? rawDesign.canvas : null) ||
    // Case F: rawDesign IS the Fabric canvas
    (isFabricCanvas(rawDesign) ? rawDesign : null) ||
    null;

  if (!fabricJSON) {
    throw new Error('No Fabric.js canvas JSON found in designData');
  }

  // ── Canvas dimensions ──────────────────────────────────────────────────────
  // Try config.canvas (from full design), then dimension-only canvas fields
  const designConfig = innerDesign?.config || rawDesign?.config || {};
  const configCanvas = designConfig.canvas || {};
  // rawDesign.canvas or innerDesign.canvas might hold dimensions only
  const dimRaw  = (!isFabricCanvas(rawDesign?.canvas)   ? rawDesign?.canvas   : null) || {};
  const dimInner = (!isFabricCanvas(innerDesign?.canvas) ? innerDesign?.canvas : null) || {};
  const widthMm  = configCanvas.width  || dimInner.width  || dimRaw.width  || 54;
  const heightMm = configCanvas.height || dimInner.height || dimRaw.height || 86;
  // Heuristic: if value > 500, it's likely already in pixels, not mm
  const widthPx  = widthMm  > 500 ? widthMm  : mmToPx(widthMm);
  const heightPx = heightMm > 500 ? heightMm : mmToPx(heightMm);

  // ── Dynamically import fabric Node.js build ────────────────────────────────
  // fabric v7 exposes a Node.js-specific build via the 'fabric/node' sub-path.
  // This build uses jsdom + node-canvas internally, avoiding browser DOM globals.
  const fabric = await import('fabric/node');
  const { StaticCanvas, getFabricDocument } = fabric;

  // Expose JSDOM document as global so fabric internal code can access it
  if (!globalThis.document) {
    const fabricDoc = getFabricDocument();
    globalThis.document = fabricDoc;
    globalThis.window   = fabricDoc.defaultView;
  }

  // Create the canvas element using the JSDOM document
  const fabricDoc = getFabricDocument();
  // Guard against zero/NaN dimensions that would crash node-canvas
  const safeW = (Number.isFinite(widthPx)  && widthPx  > 0) ? widthPx  : Math.round(54  * MM_TO_PX);
  const safeH = (Number.isFinite(heightPx) && heightPx > 0) ? heightPx : Math.round(86  * MM_TO_PX);
  process.stderr.write(`[generate-thumbnails] Canvas size: ${safeW}x${safeH}px (raw mm: ${widthMm}x${heightMm})\n`);

  const canvasEl = fabricDoc.createElement('canvas');
  canvasEl.width  = safeW;
  canvasEl.height = safeH;

  // Create a StaticCanvas with the correct dimensions
  const sc = new StaticCanvas(canvasEl, {
    width:  safeW,
    height: safeH,
    enableRetinaScaling: false,
  });

  // ── Sanitize fabricJSON before loading ────────────────────────────────────
  // node-canvas can't decode AVIF/WebP. Even valid PNG placeholders fail when
  // passed through fabric's image loading pipeline. The safest fix is to:
  //  1. Remove entire Image-type objects with AVIF/WebP src (filter from arrays)
  //  2. Null out backgroundImage/overlayImage with AVIF/WebP src
  //  3. Replace background string AVIF/WebP with solid white

  const UNSUPPORTED_SRC_RE = /^data:image\/(avif|webp)/i;

  function deepSanitize(obj, parentKey) {
    if (!obj) return obj;
    if (typeof obj === 'string') {
      // Replace unsupported background strings with white
      if (parentKey === 'background' && UNSUPPORTED_SRC_RE.test(obj)) return '#ffffff';
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj
        .map(item => deepSanitize(item, null))
        .filter(item => item !== null); // filter removed Image objects
    }
    if (typeof obj === 'object') {
      // Remove Image-type objects with unsupported data URL src
      if (
        (obj.type === 'Image' || obj.type === 'image') &&
        typeof obj.src === 'string' && UNSUPPORTED_SRC_RE.test(obj.src)
      ) {
        return null; // filtered from array
      }
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        // Null backgroundImage / overlayImage if their src is unsupported
        if ((key === 'backgroundImage' || key === 'overlayImage') &&
            value && typeof value === 'object' &&
            typeof value.src === 'string' && UNSUPPORTED_SRC_RE.test(value.src)) {
          result[key] = null;
          continue;
        }
        // Handle background as string
        if (key === 'background' && typeof value === 'string' && UNSUPPORTED_SRC_RE.test(value)) {
          result[key] = '#ffffff';
          continue;
        }
        result[key] = deepSanitize(value, key);
      }
      return result;
    }
    return obj;
  }

  function sanitizeFabricJSON(json) {
    return deepSanitize(json, null);
  }

  const sanitizedFabricJSON = sanitizeFabricJSON(fabricJSON);

  // Suppress image-loading warnings from fabric/canvas during rendering
  const origConsoleError = console.error;
  console.error = (...args) => {
    const msg = String(args[0] || '');
    if (
      msg.includes('Could not load img') ||
      msg.includes('Error: Could not load') ||
      msg.includes('fabric: Error loading') ||
      msg.includes('data:image/')
    ) return;
    origConsoleError.apply(console, args);
  };

  try {
    // Load the fabric canvas JSON with a 20-second timeout
    await Promise.race([
      sc.loadFromJSON(sanitizedFabricJSON),
      new Promise((_, reject) => setTimeout(() => reject(new Error('loadFromJSON timed out after 20s')), 20000)),
    ]);
  } catch (loadErr) {
    // Treat ALL loadFromJSON errors as non-fatal — render whatever Fabric loaded
    const msg = String(loadErr?.message || '');
    process.stderr.write(`[generate-thumbnails] loadFromJSON error (rendering anyway): ${msg.slice(0, 100)}\n`);
  } finally {
    console.error = origConsoleError; // restore original
  }
  sc.renderAll();

  // Export as PNG data URL
  const dataUrl = sc.toDataURL({ format: 'png', multiplier: 1 });

  // Clean up
  sc.dispose();

  return dataUrl;
}

async function main() {
  console.log('[generate-thumbnails] Fetching templates…');
  let templates;
  try {
    templates = await apiFetch('/api/templates');
  } catch (err) {
    console.error('[generate-thumbnails] Failed to fetch templates:', err.message);
    process.exit(1);
  }

  if (!Array.isArray(templates)) {
    console.error('[generate-thumbnails] Unexpected response — templates is not an array');
    process.exit(1);
  }

  console.log(`[generate-thumbnails] ${templates.length} templates found`);

  // A template needs regeneration if EITHER preview field is broken
  const toProcess = templates.filter(t => {
    const p1 = t.previewImageUrl || '';
    const p2 = t.preview_image   || '';
    // Has no preview at all, OR has a stale /images/thumb-* path
    return isPreviewBroken(p1) || isPreviewBroken(p2);
  });

  if (toProcess.length === 0) {
    console.log('[generate-thumbnails] All templates already have valid previews!');
    for (const t of templates) {
      console.log(`  ${t.templateName}: ${t.previewImageUrl || t.preview_image || '(none)'}`);
    }
    return;
  }

  console.log(`[generate-thumbnails] ${toProcess.length} template(s) need new thumbnails:`);
  for (const t of toProcess) {
    const cur = t.previewImageUrl || t.preview_image || '(none)';
    console.log(`  - "${t.templateName}" (${t._id}) → current: "${cur}"`);
  }
  console.log('');

  let ok = 0;
  let fail = 0;

  for (const t of toProcess) {
    const id   = t._id;
    const name = t.templateName;
    process.stdout.write(`[generate-thumbnails] Rendering "${name}"… `);

    try {
      // Fetch full template (with designData)
      const full = await apiFetch(`/api/templates/${id}`);

      // Render to PNG data URL
      const dataUrl = await renderTemplate(full);

      // Upload preview to backend (saves file + updates MongoDB)
      await apiFetch(`/api/templates/${id}/upload-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preview_image: dataUrl }),
      });

      console.log('✓ Done');
      ok++;
    } catch (err) {
      console.log(`✗ Failed: ${err.message}`);
      if (process.env.DEBUG) console.error(err);
      fail++;
    }
  }

  console.log(`\n[generate-thumbnails] Complete: ${ok} succeeded, ${fail} failed`);

  if (ok > 0) {
    // Force gallery cache rebuild by fetching templates (cache was invalidated by upload-preview)
    console.log('[generate-thumbnails] Warming gallery cache…');
    try {
      const refreshed = await apiFetch('/api/templates');
      console.log(`[generate-thumbnails] Gallery cache rebuilt with ${Array.isArray(refreshed) ? refreshed.length : '?'} templates`);
    } catch (err) {
      console.warn('[generate-thumbnails] Cache warm failed (non-fatal):', err.message);
    }
  }
}

main().catch(err => {
  console.error('[generate-thumbnails] Fatal error:', err);
  process.exit(1);
});
