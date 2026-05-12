/**
 * One-time backfill script: converts base64 data URL previews stored in
 * MongoDB → real PNG/JPG files on disk, then updates the DB to the relative path.
 *
 * Run: cd backend && npx tsx tmp/backfill-previews.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';

async function main() {
  const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || '';
  if (!MONGO_URI) {
    console.error('MONGODB_URI not set in backend/.env');
    process.exit(1);
  }

  const uploadsDir = process.env.UPLOADS_DIR?.trim()
    ? path.join(path.resolve(process.env.UPLOADS_DIR), 'templates')
    : path.resolve(__dirname, '..', 'public', 'uploads', 'templates');

  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Saving preview files to:', uploadsDir);

  await mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 30000,
  });
  console.log('Connected to MongoDB:', mongoose.connection.db!.databaseName);

  const db = mongoose.connection.db!;
  const coll = db.collection('producttemplates');
  const metaColl = db.collection('templategallerymetadata');

  // Fetch all templates and filter in JS (avoids regex scan on Atlas M0)
  console.log('Fetching all templates...');
  const all = await coll.find({}, {
    projection: { _id: 1, templateName: 1, preview_image: 1, previewImageUrl: 1 },
    maxTimeMS: 20000,
  }).toArray();
  const templates = all.filter((t) => {
    const v = String(t.preview_image || t.previewImageUrl || '');
    return v.startsWith('data:image/');
  });

  console.log(`Found ${templates.length} template(s) with data-URL previews to migrate.`);

  let migrated = 0;
  let skipped = 0;

  for (const t of templates) {
    const raw: string = t.preview_image || t.previewImageUrl || '';
    const match = /^data:(image\/[a-z+]+);base64,(.+)$/is.exec(raw);
    if (!match) { skipped++; continue; }

    const ext = match[1].toLowerCase() === 'image/jpeg' ? '.jpg' : '.png';
    const safeName = String(t.templateName || t._id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
    const filename = `preview-${Date.now()}-${safeName}${ext}`;
    const filePath = path.join(uploadsDir, filename);

    const buf = Buffer.from(match[2], 'base64');
    fs.writeFileSync(filePath, buf);

    const relativePath = `/uploads/templates/${filename}`;

    await coll.updateOne(
      { _id: t._id },
      { $set: { preview_image: relativePath, previewImageUrl: relativePath } },
    );
    await metaColl.updateOne(
      { templateId: t._id },
      { $set: { preview_image: relativePath, previewImageUrl: relativePath } },
    );

    console.log(`  ✓ ${t.templateName}  (${Math.round(buf.length / 1024)} KB)  →  ${relativePath}`);
    migrated++;
  }

  console.log(`\nDone. Migrated: ${migrated}  Skipped: ${skipped}`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
