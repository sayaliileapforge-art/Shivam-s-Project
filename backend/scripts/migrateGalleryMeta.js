/**
 * One-time migration: populate TemplateGalleryMeta from ProductTemplate records.
 * Run this script once after deploying the TemplateGalleryMeta feature.
 * 
 * This script reads ProductTemplate documents WITHOUT designData (using projection)
 * and upserts them into TemplateGalleryMeta.
 * 
 * NOTE: The read from ProductTemplate may be slow on Atlas M0 (~1-2 min for cold storage).
 * Run this script once and the gallery will be fast forever after.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const GALLERY_META_FIELDS = {
  _id: 1, productId: 1, projectId: 1, templateName: 1, description: 1,
  category: 1, previewImageUrl: 1, preview_image: 1, designFileUrl: 1,
  isGlobal: 1, isActive: 1, tags: 1, createdAt: 1, updatedAt: 1,
};

const TemplateGalleryMetaSchema = new mongoose.Schema({
  templateId: { type: mongoose.Schema.Types.ObjectId, unique: true },
  productId: mongoose.Schema.Types.ObjectId,
  projectId: String, // store as string to handle both ObjectId and legacy string IDs
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

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  // Register models
  const TemplateGalleryMeta = mongoose.models.TemplateGalleryMeta 
    || mongoose.model('TemplateGalleryMeta', TemplateGalleryMetaSchema);

  // Use batchSize(1) cursor so Atlas M0 returns each doc as it's read from cold storage,
  // rather than waiting for ALL docs before returning anything.
  console.log('Streaming ProductTemplate records with batchSize(1) (tolerates Atlas M0 cold reads)...');
  const total = await mongoose.connection.db.collection('producttemplates').countDocuments();
  console.log(`Total ProductTemplate count: ${total}`);

  const cursor = mongoose.connection.db.collection('producttemplates')
    .find({}, { projection: GALLERY_META_FIELDS })
    .batchSize(1);

  let upserted = 0;
  let seen = 0;
  for await (const t of cursor) {
    seen++;
    try {
      await TemplateGalleryMeta.findOneAndUpdate(
        { templateId: t._id },
        {
          templateId: t._id,
          productId: t.productId,
          projectId: t.projectId != null ? String(t.projectId) : undefined,
          templateName: t.templateName,
          description: t.description,
          category: t.category,
          previewImageUrl: t.previewImageUrl,
          preview_image: t.preview_image,
          designFileUrl: t.designFileUrl,
          isGlobal: t.isGlobal ?? false,
          isActive: t.isActive ?? true,
          tags: t.tags,
        },
        { upsert: true, new: false }
      );
      upserted++;
      console.log(`  [${seen}/${total}] ✓ ${t.templateName} (isGlobal: ${t.isGlobal})`);
    } catch (e) {
      console.error(`  [${seen}/${total}] ✗ ${t.templateName}: ${e.message}`);
    }
  }

  console.log(`\n✓ Done! Upserted ${upserted}/${seen} records into TemplateGalleryMeta`);
  await mongoose.disconnect();
}

run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
