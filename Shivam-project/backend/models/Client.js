const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema(
  {
    schoolName:   { type: String, required: true, trim: true },
    schoolCode:   { type: String, trim: true, uppercase: true },
    address:      { type: String, trim: true },
    city:         { type: String, trim: true },
    contactName:  { type: String, trim: true },
    phone:        { type: String, trim: true },
    email:        {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    vendorId:     { type: String, required: true, index: true },
    // Extended fields
    clientType:   { type: String, trim: true },          // School / Coaching / Other
    state:        { type: String, trim: true },
    district:     { type: String, trim: true },
    pincode:      { type: String, trim: true },
    deliveryMode: { type: String, trim: true },          // Bus / Courier
    busStop:      { type: String, trim: true },
    route:        { type: String, trim: true },
    gstNumber:    { type: String, trim: true },
    gstName:      { type: String, trim: true },
    gstStateCode: { type: String, trim: true },
    gstAddress:   { type: String, trim: true },
  },
  { timestamps: true }
);

// A vendor can link a school code only once.
clientSchema.index(
  { vendorId: 1, schoolCode: 1 },
  {
    unique: true,
    partialFilterExpression: {
      schoolCode: { $type: 'string' },
    },
  }
);

module.exports = mongoose.model('Client', clientSchema);
