/**
 * One-time cleanup script: removes duplicate and copy templates from the gallery.
 *
 * What it does:
 * 1. Sets isGlobal=false on all templates whose name contains "(Copy)" — these are
 *    project-local clones and should never appear in the global Template Gallery.
 * 2. For remaining isGlobal=true templates that share the same templateName
 *    (case-insensitive), keeps only the oldest one as global and demotes the rest
 *    to isGlobal=false so the gallery shows only one entry per template name.
 *
 * Usage (from the backend/ directory):
 *   node scripts/cleanupDuplicateTemplates.js
 *
 * Requires MONGO_URI in backend/.env (or as an environment variable).
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('ERROR: MONGO_URI is not set. Add it to backend/.env');
  process.exit(1);
}

const ProductTemplateSchema = new mongoose.Schema(
  {
    productId: mongoose.Schema.Types.ObjectId,
    projectId: String,
    isGlobal: { type: Boolean, default: false },
    templateName: { type: String, required: true, trim: true },
    category: String,
    previewImageUrl: String,
    preview_image: String,
    designData: mongoose.Schema.Types.Mixed,
    isActive: { type: Boolean, default: true },
    tags: [String],
  },
  { timestamps: true, collection: 'producttemplates' }
);

const ProductTemplate = mongoose.model('ProductTemplate', ProductTemplateSchema);

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB:', mongoose.connection.name);

  // ── Step 1: Demote all "(Copy)" templates from the gallery ──────────────────
  const copyResult = await ProductTemplate.updateMany(
    { templateName: { $regex: /\(copy\)/i }, isGlobal: true },
    { $set: { isGlobal: false } }
  );
  console.log(`Step 1 — Demoted ${copyResult.modifiedCount} "(Copy)" template(s) from gallery.`);

  // ── Step 2: Deduplicate by name — keep only the oldest per name ─────────────
  const globalTemplates = await ProductTemplate.find({ isGlobal: true })
    .sort({ createdAt: 1 }) // oldest first
    .lean();

  const seen = new Map(); // normalizedName -> _id of first (oldest) template
  const demoteIds = [];

  for (const t of globalTemplates) {
    const key = t.templateName.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, t._id);
    } else {
      demoteIds.push(t._id);
    }
  }

  if (demoteIds.length > 0) {
    const dupResult = await ProductTemplate.updateMany(
      { _id: { $in: demoteIds } },
      { $set: { isGlobal: false } }
    );
    console.log(`Step 2 — Demoted ${dupResult.modifiedCount} duplicate template(s) with the same name.`);
    console.log('  Demoted IDs:', demoteIds.map(String));
  } else {
    console.log('Step 2 — No duplicate template names found. Nothing to demote.');
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  const remaining = await ProductTemplate.countDocuments({ isGlobal: true });
  console.log(`\nDone. ${remaining} unique global template(s) remain in the gallery.`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Cleanup failed:', err.message);
  process.exit(1);
});
