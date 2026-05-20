/**
 * One-time data fix: unset isGlobal from templates that were incorrectly
 * promoted by the startup migration. The old migration matched
 * { projectId: null } which also captured project-scoped templates that
 * were stored with productId = <project_id> but no projectId field.
 *
 * This script finds templates whose productId matches an existing Project _id
 * AND that have isGlobal: true AND no projectId set, then sets isGlobal: false.
 */
const mongoose = require('mongoose');
require('dotenv').config();

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  // Collect all project ObjectIds
  const projects = await db.collection('projects').find({}).project({ _id: 1 }).toArray();
  const projectIds = projects.map((p) => p._id);
  console.log('Projects found:', projectIds.map(String));

  // Templates whose productId is a known project ID AND isGlobal was auto-set
  // (no explicit projectId stored yet)
  const affected = await db.collection('producttemplates').find({
    productId: { $in: projectIds },
    isGlobal: true,
    $or: [{ projectId: { $exists: false } }, { projectId: null }, { projectId: '' }],
  }).project({ templateName: 1, productId: 1, projectId: 1, isGlobal: 1 }).toArray();

  console.log('Incorrectly global templates:', JSON.stringify(affected, null, 2));

  if (affected.length === 0) {
    console.log('Nothing to fix.');
    await mongoose.disconnect();
    return;
  }

  const ids = affected.map((t) => t._id);
  const result = await db.collection('producttemplates').updateMany(
    { _id: { $in: ids } },
    { $set: { isGlobal: false } }
  );
  console.log('Fixed', result.modifiedCount, 'template(s): set isGlobal=false');
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
