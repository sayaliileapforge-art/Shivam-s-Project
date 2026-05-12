const mongoose = require('mongoose');

const schoolMemberSchema = new mongoose.Schema(
  {
    type:        { type: String, enum: ['teacher', 'student', 'staff'], required: true },
    name:        { type: String, required: true, trim: true },
    classOrDept: { type: String, default: '' },
    phone:       { type: String, default: '' },
    address:      { type: String, default: '' }, // stores empId for staff
    principalId:  { type: String, required: true },
    isRestricted: { type: Boolean, default: false },
    // User management state used by principal panel
    isLoggedIn:   { type: Boolean, default: true },
    lastLogoutAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SchoolMember', schoolMemberSchema);
