const mongoose = require('mongoose');

// Read-only mirror of the Enterprise Portal's `authusers` collection
// (same MongoDB database as this backend). Used only as a login fallback
// for vendor accounts created in the web Admin Portal — never written to
// from here.
const epAuthUserSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    mobile: String,
    role: String,
    passwordHash: String,
    firmName: String,
    profileImage: String,
    schoolCode: String,
    lastLoginAt: Date,
  },
  { collection: 'authusers', versionKey: false },
);

module.exports = mongoose.models.EpAuthUser || mongoose.model('EpAuthUser', epAuthUserSchema);
