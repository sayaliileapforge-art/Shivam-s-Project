const mongoose = require('mongoose');

const quickPhotoSchema = new mongoose.Schema(
  {
    schoolCode: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    className: {
      type: String,
      required: true,
      trim: true,
    },
    rollNumber: {
      type: String,
      required: true,
      trim: true,
    },
    imageUrl: {
      type: String,
      required: true,
    },
    imagePath: {
      type: String,
    },
    filename: {
      type: String,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// Compound index for efficient per-class listing
quickPhotoSchema.index({ schoolCode: 1, className: 1 });

module.exports = mongoose.model('QuickPhoto', quickPhotoSchema);
