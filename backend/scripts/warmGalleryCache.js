/**
 * warmGalleryCache.js
 * One-time script: reads TemplateGalleryMeta from Atlas and writes gallery-cache.json
 * so the backend can serve gallery requests instantly even when Atlas M0 is asleep.
 *
 * Usage: node scripts/warmGalleryCache.js
 */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('MONGO_URI not set in .env');
  process.exit(1);
}

const CACHE_FILE = path.join(__dirname, '..', 'tmp', 'gallery-cache.json');

async function main() {
  console.log('Connecting to Atlas...');
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 60000 });
  console.log('Connected.');

  const db = mongoose.connection.db;
  const col = db.collection('templategallerymetas');

  console.log('Fetching isGlobal templates from TemplateGalleryMeta...');
  // Use batchSize(1) so Atlas M0 returns each document as it loads from cold storage
  // instead of waiting for ALL documents before returning any.
  const cursor = col.find({ isGlobal: true }).sort({ updatedAt: -1 }).batchSize(1);
  const docs = [];
  let n = 0;
  for await (const doc of cursor) {
    n++;
    console.log(`  [${n}] ${doc.templateName}`);
    docs.push(doc);
  }
  console.log(`Fetched ${docs.length} docs.`);

  // Deduplicate by name
  const seenNames = new Set();
  const unique = docs.filter((t) => {
    const key = String(t.templateName || '').trim().toLowerCase();
    if (seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });

  // Remap templateId → _id for frontend compatibility
  const data = unique.map((t) => ({
    ...t,
    _id: t.templateId ?? t._id,
  }));

  const cache = { data, expiresAt: Date.now() + 5 * 60 * 1000 };

  const dir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf-8');

  console.log(`✓ gallery-cache.json written: ${data.length} template(s)`);
  data.forEach((t) => console.log(`  - ${t.templateName} (isGlobal: ${t.isGlobal})`));

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
