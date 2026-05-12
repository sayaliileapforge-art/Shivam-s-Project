const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema(
  {
    name:            { type: String, required: true, unique: true },
    description:     String,
    descriptionHtml: String,
    sku:             { type: String, required: true, unique: true },
    category:        { type: String, default: 'general' },
    price:           { type: Number, required: true, default: 0 },
    cost:            Number,
    stock:           { type: Number, default: 0 },
    visibility:      {
      type: String,
      enum: ['public', 'private', 'restricted'],
      default: 'public',
    },
    isVisible:       { type: Boolean, default: true },
    applicableFor:   { type: [String], default: ['Public'] },
    width:           Number,
    height:          Number,
    unit:            String,
    image:           String,
    images:          { type: [String], default: [] },
    thumbnailImage:  String,
    videoUrl:        String,
    youtubeLink:     String,
    instagramLink:   String,
    vendorPrice:     { type: Number, default: 0 },
    clientPrice:     { type: Number, default: 0 },
    publicPrice:     { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', ProductSchema);
