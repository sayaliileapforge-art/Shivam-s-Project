const mongoose = require('mongoose');

const VALID_STAGES = [
  'Draft',
  'Data Upload',
  'Design',
  'Proof',
  'Printing',
  'Dispatch',
  'Delivered',
];

const orderSchema = new mongoose.Schema(
  {
    title:          { type: String, required: true, trim: true },
    schoolName:     { type: String, required: true, trim: true },
    stage:          {
      type:    String,
      enum:    VALID_STAGES,
      default: 'Draft',
    },
    progress:       { type: Number, min: 0, max: 100, default: 0 },
    totalCards:     { type: Number, min: 0, default: 0 },
    completedCards: { type: Number, min: 0, default: 0 },
    vendorId:       { type: String, required: true, index: true },
    clientId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Client', index: true },
    schoolCode:     { type: String, trim: true, uppercase: true, index: true },
    deliveryDate:   { type: Date },
    productId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    productType:    { type: String, trim: true },
    productName:    { type: String, trim: true },
    productImage:   { type: String, trim: true },
    pricing: {
      student: { type: Number, min: 0, default: 0 },
      teacher: { type: Number, min: 0, default: 0 },
      staff:   { type: Number, min: 0, default: 0 },
      other:   { type: Number, min: 0, default: 0 },
    },
    description:    { type: String, trim: true },
    youtubeLink:    { type: String, trim: true },
    instagramLink:  { type: String, trim: true },
    videoUrl:       { type: String, trim: true },
    files: [
      {
        originalName: { type: String },
        filename:     { type: String },
        path:         { type: String },
        mimeType:     { type: String },
        size:         { type: Number },
      },
    ],
    images: [{ type: String }],
    variableFields: { type: mongoose.Schema.Types.Mixed, default: [] },
    columnMappings:  { type: mongoose.Schema.Types.Mixed, default: {} },
    quantity:        { type: Number, default: 1 },
    unit:            { type: String, default: '' },
    excelData:       { type: mongoose.Schema.Types.Mixed, default: [] },
    excelHeaders:    [{ type: String }],
    excelFileName:   { type: String },
    attachments:     [{ type: String }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);
