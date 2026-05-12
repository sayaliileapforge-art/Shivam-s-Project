/**
 * Project model — mirrors the EP Admin Portal's `projects` collection.
 * Both backends connect to the same MongoDB `myapp` database, so a document
 * saved here is immediately visible in the web admin Projects board.
 */
const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema(
  {
    // Core fields (EP-compatible)
    name:          { type: String, required: true, trim: true },
    description:   { type: String, trim: true },
    clientId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
    client:        { type: String, trim: true },
    templateId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
    status: {
      type:    String,
      enum:    ['draft', 'active', 'archived', 'completed'],
      default: 'draft',
    },
    stage:         { type: String, default: 'draft' },
    priority: {
      type:    String,
      enum:    ['urgent', 'high', 'medium', 'low'],
      default: 'medium',
    },
    dueDate:       { type: String },
    assignee:      { type: String },
    amount:        { type: Number, default: 0 },
    workflowType: {
      type:    String,
      enum:    ['variable_data', 'direct_print'],
      default: 'direct_print',
    },
    pages:         { type: Number, default: 1 },
    canvasData:    [mongoose.Schema.Types.Mixed],

    // Vendor-originated fields
    productName:    { type: String },
    productImage:   { type: String },
    pricing:        { type: mongoose.Schema.Types.Mixed },
    variableFields: [mongoose.Schema.Types.Mixed],
    columnMappings: { type: mongoose.Schema.Types.Mixed },
    quantity:       { type: Number, default: 1 },
    excelData:      [mongoose.Schema.Types.Mixed],
    excelFileName:  { type: String },
    attachments:    [{ type: String }],
    files: [
      {
        originalName: String,
        filename:     String,
        path:         String,
        mimeType:     String,
        size:         Number,
      },
    ],
    images: [{ type: String }],
    createdBy:     { type: String, default: 'admin' },   // 'vendor' for mobile-originated
    vendorOrderId: { type: String },                      // link back to edumid Order._id
  },
  { timestamps: true }
);

// Use the same collection name as the EP Admin Portal so both backends share data
module.exports = mongoose.model('Project', projectSchema, 'projects');
