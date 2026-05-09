require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI).then(async () => {
  const col = mongoose.connection.collection('producttemplates');

  // Drop the bad unique index (no partial filter — enforces uniqueness even on null productId)
  try {
    await col.dropIndex('productId_1_templateName_1');
    console.log('✓ Dropped old index productId_1_templateName_1');
  } catch (e) {
    console.log('Index not found or already dropped:', e.message);
  }

  // Recreate with partial filter: only enforce uniqueness when productId is a real ObjectId.
  // Documents with productId: null/undefined (project-level clones) are excluded from the constraint.
  await col.createIndex(
    { productId: 1, templateName: 1 },
    {
      unique: true,
      partialFilterExpression: { productId: { $type: 'objectId' } },
      name: 'productId_1_templateName_1',
    }
  );
  console.log('✓ Recreated index with partialFilterExpression ($type: objectId — null excluded)');

  const indexes = await col.indexes();
  const newIdx = indexes.find(i => i.name === 'productId_1_templateName_1');
  console.log('New index definition:', JSON.stringify(newIdx, null, 2));

  await mongoose.disconnect();
  console.log('Done.');
}).catch(e => { console.error(e.message); process.exit(1); });
