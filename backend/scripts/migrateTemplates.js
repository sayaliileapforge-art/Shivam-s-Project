/* eslint-disable no-console */
const { MongoClient, ObjectId } = require('mongodb');

function resolveEnv(name, fallback) {
  const value = process.env[name];
  if (value && String(value).trim()) return String(value).trim();
  return fallback;
}

const LOCAL_MONGO_URI = resolveEnv('LOCAL_MONGO_URI', 'mongodb://127.0.0.1:27017');
const ATLAS_MONGO_URI = resolveEnv('ATLAS_MONGO_URI', '');
const DB_NAME = resolveEnv('DB_NAME', 'myapp');
const COLLECTION_NAME = resolveEnv('TEMPLATES_COLLECTION', 'producttemplates');

if (!ATLAS_MONGO_URI) {
  console.error('Missing ATLAS_MONGO_URI. Set it before running the migration.');
  process.exit(1);
}

function toKey(doc) {
  return `${String(doc.productId || '')}::${String(doc.templateName || '')}`.toLowerCase();
}

async function connectOrThrow(client, name) {
  try {
    await client.connect();
    console.log(`[migration] Connected to ${name}`);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    console.error(`[migration] Failed to connect to ${name}: ${message}`);
    throw error;
  }
}

async function migrateTemplates() {
  const localClient = new MongoClient(LOCAL_MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  const atlasClient = new MongoClient(ATLAS_MONGO_URI, { serverSelectionTimeoutMS: 5000 });

  try {
    await connectOrThrow(localClient, 'local MongoDB');
    await connectOrThrow(atlasClient, 'MongoDB Atlas');

    const localDb = localClient.db(DB_NAME);
    const atlasDb = atlasClient.db(DB_NAME);

    const localCol = localDb.collection(COLLECTION_NAME);
    const atlasCol = atlasDb.collection(COLLECTION_NAME);

    const localTemplates = await localCol.find({}).toArray();
    console.log(`[migration] Local templates found: ${localTemplates.length}`);

    if (!localTemplates.length) {
      console.log('[migration] Nothing to migrate.');
      return;
    }

    const atlasTemplates = await atlasCol.find({}, { projection: { productId: 1, templateName: 1 } }).toArray();
    const existingKeys = new Set(atlasTemplates.map(toKey));

    const toInsert = [];
    for (const tpl of localTemplates) {
      const key = toKey(tpl);
      if (existingKeys.has(key)) continue;

      const doc = { ...tpl };
      if (doc._id && !(doc._id instanceof ObjectId)) {
        doc._id = new ObjectId(String(doc._id));
      }
      toInsert.push(doc);
      existingKeys.add(key);
    }

    if (!toInsert.length) {
      console.log('[migration] All templates already exist in Atlas.');
      return;
    }

    const result = await atlasCol.insertMany(toInsert, { ordered: false });
    console.log(`[migration] Inserted into Atlas: ${result.insertedCount}`);
  } finally {
    await localClient.close();
    await atlasClient.close();
  }
}

migrateTemplates().catch((error) => {
  const message = error && error.message ? error.message : String(error);
  if (message.includes('ECONNREFUSED') || message.includes('connect ECONNREFUSED')) {
    console.error('[migration] Local MongoDB is not reachable. Start MongoDB or use the fallback export/import method.');
  }
  console.error('[migration] Failed:', message);
  process.exit(1);
});
