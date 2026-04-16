const mongoose = require('mongoose');

const formFieldSchema = new mongoose.Schema(
  {
    label:    { type: String, required: true },
    type:     { type: String, enum: ['text', 'dropdown', 'number', 'date'], required: true },
    required: { type: Boolean, default: true },
    order:    { type: Number, required: true },
  },
  { _id: false }
);

const idCardFormSchema = new mongoose.Schema(
  {
    principalId:   { type: String, required: true, unique: true },    // one form per principal
    formFields:      { type: [formFieldSchema], default: [] },         // array of form fields (label/type/required/order)
    formTitle:       { type: String, default: 'ID Card Form' },        // form title/name
    formDescription: { type: String, default: '' },                   // optional description
  },
  { timestamps: true }
);

module.exports = mongoose.model('IdCardForm', idCardFormSchema);
