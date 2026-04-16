const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/edumid';
mongoose.connect(uri).then(async () => {
  const SchoolMember = require('./models/SchoolMember');
  const SchoolClass  = require('./models/SchoolClass');
  const User         = require('./models/User');

  const memberCounts = await SchoolMember.aggregate([
    { $group: { _id: { principalId: '$principalId', type: '$type' }, count: { $sum: 1 } } },
    { $sort: { '_id.principalId': 1 } }
  ]);
  const classCounts = await SchoolClass.aggregate([
    { $group: { _id: '$principalId', count: { $sum: 1 } } }
  ]);
  const principals = await User.find({ role: 'principal' }).select('_id schoolCode name').lean();
  const sample = await SchoolMember.findOne({ type: 'student' }).lean();

  console.log('=== SchoolMember by principalId+type ===');
  console.log(JSON.stringify(memberCounts, null, 2));
  console.log('=== SchoolClass by principalId ===');
  console.log(JSON.stringify(classCounts, null, 2));
  console.log('=== Principals ===');
  console.log(JSON.stringify(principals, null, 2));
  console.log('=== Sample student record ===');
  console.log(JSON.stringify(sample, null, 2));
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
