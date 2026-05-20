const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
mongoose.connect(uri).then(async () => {
  const db = mongoose.connection.db;
  const projId = '6a0c1bf8fdacd75ab82a56b8';
  
  // Check TemplateGalleryMeta with $or filter (same as backend code)
  const docs = await db.collection('templategallerymetas').find({
    $or: [
      { projectId: projId },
      { productId: new mongoose.Types.ObjectId(projId) }
    ]
  }).toArray();
  
  console.log('--- TemplateGalleryMeta for project 6a0c1bf8fdacd75ab82a56b8 ---');
  console.log('COUNT:', docs.length);
  console.log(JSON.stringify(docs.map(d => ({
    _id: d._id,
    templateId: d.templateId,
    projectId: d.projectId,
    productId: d.productId,
    isGlobal: d.isGlobal,
    templateName: d.templateName
  })), null, 2));
  
  // Also show ALL docs in TemplateGalleryMeta to understand the full picture
  const allDocs = await db.collection('templategallerymetas').find({}).toArray();
  console.log('\n--- ALL TemplateGalleryMeta docs (' + allDocs.length + ' total) ---');
  console.log(JSON.stringify(allDocs.map(d => ({
    _id: d._id.toString(),
    templateId: d.templateId ? d.templateId.toString() : null,
    projectId: d.projectId || null,
    productId: d.productId ? d.productId.toString() : null,
    isGlobal: d.isGlobal,
    templateName: d.templateName
  })), null, 2));
  
  await mongoose.disconnect();
}).catch(e => { console.error(e); process.exit(1); });
