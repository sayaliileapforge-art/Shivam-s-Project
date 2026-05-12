const mongoose = require('mongoose');

const schoolClassSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    principalId: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SchoolClass', schoolClassSchema);
