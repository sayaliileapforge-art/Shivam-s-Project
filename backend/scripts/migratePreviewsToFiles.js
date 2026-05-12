/**
 * migratePreviewsToFiles.js
 *
 * One-time migration: extract base64 thumbnail blobs from TemplateGalleryMeta
 * (and optionally ProductTemplate) into physical files under backend/uploads/.
 * Updates each document's previewImageUrl to a relative path  /images/<file>
 * so the warmup query only fetches small text strings, not 3-7 MB blobs.
 *
 * Run from the backend directory:
 *   node scripts/migratePreviewsToFiles.js
 */

'use strict';

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(__dirname, '..', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Write base64 data-URL to a file.
 * Returns the relative URL path  /images/<filename>  or null on failure.
 */
function saveBase64ToFile(dataUrl) {
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/s);
  if (!match) return null;
  const mime = match[1];           // e.g. image/jpeg
  const b64  = match[2];
  const ext  = mime === 'image/png' ? '.png' : '.jpg';
  const filename = `thumb-${crypto.randomUUID()}${ext}`;
  const filePath = path.join(UPLOADS_DIR, filename);
  try {
    fs.writeFileSync(filePath, Buffer.from(b64, 'base64'));
    return `/images/${filename}`;
  } catch (err) {
    console.warn(`  ✗ Could not write file ${filename}:`, err.message);
    return null;
  }
}

async function migrate() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('ERROR: MONGO_URI not set in .env');
    process.exit(1);
  }

  console.log('Connecting to MongoDB…');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
  console.log('Connected.\n');

  const db = mongoose.connection.db;

  // ── TemplateGalleryMeta ──────────────────────────────────────────────────
  console.log('=== Migrating TemplateGalleryMeta ===');
  // Fetch ONE document at a time using a cursor so we never buffer all base64 blobs at once.
  // Project only the fields we need to minimize network transfer per document.
  const metaCursor = db.collection('templategallerymetas')
    .find({})
    .project({ _id: 1, templateName: 1, previewImageUrl: 1, preview_image: 1 });

  let metaMigrated = 0;
  let metaSkipped  = 0;
  for await (const doc of metaCursor) {
    const preview = doc.previewImageUrl || doc.preview_image || '';
    if (!preview.startsWith('data:')) {
      process.stdout.write('.');
      metaSkipped++;
      continue;
    }
    console.log(`\n  Processing: ${doc.templateName || doc._id} (${Math.round(preview.length/1024)}KB)`);
    const fileUrl = saveBase64ToFile(preview);
    if (!fileUrl) {
      console.warn(`  ✗ Skipping: saveBase64ToFile returned null`);
      metaSkipped++;
      continue;
    }
    await db.collection('templategallerymetas').updateOne(
      { _id: doc._id },
      { $set: { previewImageUrl: fileUrl, preview_image: fileUrl } }
    );
    console.log(`  ✓ ${doc.templateName || doc._id}  →  ${fileUrl}`);
    metaMigrated++;
  }
  console.log(`\nDone: ${metaMigrated} migrated, ${metaSkipped} skipped.\n`);

  // ── ProductTemplate preview_image ────────────────────────────────────────
  console.log('=== Migrating ProductTemplate ===');
  const tplCursor = db.collection('producttemplates')
    .find({ preview_image: { $regex: /^data:/ } })
    .project({ _id: 1, templateName: 1, preview_image: 1 });

  let tplMigrated = 0;
  for await (const doc of tplCursor) {
    console.log(`  Processing: ${doc.templateName || doc._id} (${Math.round((doc.preview_image||'').length/1024)}KB)`);
    const fileUrl = saveBase64ToFile(doc.preview_image);
    if (!fileUrl) {
      console.warn(`  ✗ Skipping ProductTemplate ${doc.templateName || doc._id}`);
      continue;
    }
    await db.collection('producttemplates').updateOne(
      { _id: doc._id },
      { $set: { preview_image: fileUrl } }
    );
    console.log(`  ✓ ProductTemplate ${doc.templateName || doc._id}  →  ${fileUrl}`);
    tplMigrated++;
  }
  console.log(`Done: ${tplMigrated} migrated.\n`);

  await mongoose.disconnect();
  console.log('Migration complete. Restart the backend to pick up the new file-based previews.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
