/**
 * seedGalleryMeta.js
 *
 * Populates TemplateGalleryMeta by fetching global template IDs first (fast, index-covered),
 * then fetching each document individually with a per-document timeout.
 * This avoids the Atlas M0 cold-read problem of fetching all documents at once.
 *
 * Usage: node scripts/seedGalleryMeta.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('ERROR: MONGO_URI not set in environment / .env');
  process.exit(1);
}

const TemplateGalleryMetaSchema = new mongoose.Schema({
  templateId: { type: mongoose.Schema.Types.ObjectId, unique: true },
  productId: mongoose.Schema.Types.ObjectId,
  projectId: String,
  templateName: String,
  description: String,
  category: String,
  previewImageUrl: String,
  preview_image: String,
  designFileUrl: String,
  isGlobal: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  tags: [String],
}, { timestamps: true });

const PROJECTION = {
  _id: 1, productId: 1, projectId: 1, templateName: 1, description: 1,
  category: 1, previewImageUrl: 1, preview_image: 1, designFileUrl: 1,
  isGlobal: 1, isActive: 1, tags: 1, createdAt: 1, updatedAt: 1,
};

async function run() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 30000 });
  console.log('Connected');

  const db = mongoose.connection.db;
  const col = db.collection('producttemplates');

  const TemplateGalleryMeta = mongoose.models.TemplateGalleryMeta
    || mongoose.model('TemplateGalleryMeta', TemplateGalleryMetaSchema);

  // Step 1: Get just the _id values of all templates using a count-index-covered hint.
  // distinct on _id with isGlobal filter uses the { isGlobal, updatedAt } index's
  // leaf nodes which include _id, so no full document load is required.
  console.log('Fetching all template _id values (index scan, no doc load)...');
  const allIds = await col.distinct('_id', {}).catch(() => null);

  if (!allIds || allIds.length === 0) {
    console.log('No templates found. Exiting.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${allIds.length} template IDs. Will fetch each document individually.`);

  // Check which are already in TemplateGalleryMeta
  const existingMeta = await TemplateGalleryMeta.find({}, { templateId: 1 }).lean();
  const existingSet = new Set(existingMeta.map(m => m.templateId.toString()));
  console.log(`Already in TemplateGalleryMeta: ${existingSet.size}`);

  const missingIds = allIds.filter(id => !existingSet.has(id.toString()));
  console.log(`Need to fetch: ${missingIds.length} documents`);

  if (missingIds.length === 0) {
    console.log('TemplateGalleryMeta is already fully populated!');
    await mongoose.disconnect();
    return;
  }

  let upserted = 0;
  let failed = 0;

  for (const id of missingIds) {
    console.log(`Fetching doc ${id}...`);
    try {
      // Fetch individual doc with a generous per-doc timeout
      const t = await col.findOne(
        { _id: id },
        { projection: PROJECTION, maxTimeMS: 120000 }
      );

      if (!t) {
        console.log(`  → not found (skipping)`);
        failed++;
        continue;
      }

      const projectIdValue = t.projectId
        ? (typeof t.projectId === 'object' && t.projectId._bsontype === 'ObjectId'
          ? t.projectId.toString()
          : String(t.projectId))
        : undefined;

      await TemplateGalleryMeta.findOneAndUpdate(
        { templateId: t._id },
        {
          templateId: t._id,
          productId: t.productId,
          projectId: projectIdValue,
          templateName: t.templateName || 'Untitled',
          description: t.description,
          category: t.category,
          previewImageUrl: t.previewImageUrl,
          preview_image: t.preview_image,
          designFileUrl: t.designFileUrl,
          isGlobal: Boolean(t.isGlobal),
          isActive: t.isActive !== false,
          tags: t.tags || [],
        },
        { upsert: true, new: false }
      );

      upserted++;
      console.log(`  ✓ upserted: ${t.templateName || id} (isGlobal=${t.isGlobal})`);
    } catch (err) {
      console.error(`  ✗ failed for ${id}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. Upserted: ${upserted}, Failed: ${failed}`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
