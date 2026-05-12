const mongoose = require('mongoose');

/**
 * SchoolPhoto — one document per uploaded photo.
 *
 * schoolId  : ObjectId of the Client document (the school).
 * className : Name of the class the photo belongs to (e.g. "Class 9-A").
 * date      : Shoot / upload date stored as a YYYY-MM-DD string so grouping
 *             by date is a simple equality filter.
 * imageUrl  : Full public URL served by this backend (e.g. /uploads/school-photos/<file>).
 * imagePath : Absolute filesystem path – used for cleanup.
 */
const schoolPhotoSchema = new mongoose.Schema(
  {
    schoolId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    className: { type: String, required: true, trim: true },
    date:      { type: String, required: true, trim: true }, // YYYY-MM-DD
    imageUrl:  { type: String, required: true },
    imagePath: { type: String, default: '' },
    filename:  { type: String, default: '' },
  },
  { timestamps: true }
);

// Compound index for efficient School → Class → Date queries
schoolPhotoSchema.index({ schoolId: 1, className: 1, date: 1 });

module.exports = mongoose.model('SchoolPhoto', schoolPhotoSchema);
