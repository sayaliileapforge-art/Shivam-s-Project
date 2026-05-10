const mongoose = require('mongoose');
require('dotenv').config();

const FIELDS = '_id productId projectId templateName description category previewImageUrl preview_image designFileUrl isGlobal isActive tags createdAt updatedAt';

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const db = mongoose.connection.db;
    
    // Test 1: count (should be instant)
    console.log('Test 1: countDocuments...');
    const count = await db.collection('producttemplates').countDocuments({ isGlobal: true });
    console.log('count:', count);
    
    // Test 2: find no sort, with projection and maxTimeMS
    console.log('Test 2: find no sort (maxTimeMS 10s)...');
    const t2start = Date.now();
    const docs = await db.collection('producttemplates')
      .find({ isGlobal: true })
      .project({ designData: 0 })
      .maxTimeMS(10000)
      .toArray();
    console.log('Test 2 done in', Date.now() - t2start, 'ms, docs:', docs.length);
    
    // Test 3: find WITH sort, with projection and maxTimeMS
    console.log('Test 3: find WITH sort (maxTimeMS 10s)...');
    const t3start = Date.now();
    const docs3 = await db.collection('producttemplates')
      .find({ isGlobal: true })
      .project({ designData: 0 })
      .sort({ updatedAt: -1 })
      .maxTimeMS(10000)
      .toArray();
    console.log('Test 3 done in', Date.now() - t3start, 'ms, docs:', docs3.length);
    
    await mongoose.disconnect();
  })
  .catch(e => { console.error('Error:', e.message); process.exit(1); });
