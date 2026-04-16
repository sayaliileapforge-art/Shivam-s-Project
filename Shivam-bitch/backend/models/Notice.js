const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema(
  {
    title:      { type: String, required: true, trim: true },
    description:{ type: String, required: true, trim: true },
    schoolCode: { type: String, required: true, index: true },
    createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    creatorName:{ type: String, default: '' },
    role:       { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notice', noticeSchema);
