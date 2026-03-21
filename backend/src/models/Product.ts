import mongoose, { Schema, Document } from 'mongoose';

export interface IProduct extends Document {
  name: string;
  description?: string;
  descriptionHtml?: string;
  sku: string;
  category: string;
  price: number;
  cost?: number;
  stock?: number;
  visibility: 'public' | 'private' | 'restricted';
  isVisible: boolean;
  applicableFor: Array<'Vendor' | 'Client' | 'Public'>;
  width?: number;
  height?: number;
  unit?: string;
  image?: string;
  images: string[];
  thumbnailImage?: string;
  videoUrl?: string;
  youtubeLink?: string;
  instagramLink?: string;
  vendorPrice: number;
  clientPrice: number;
  publicPrice: number;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, unique: true },
    description: String,
    descriptionHtml: String,
    sku: { type: String, required: true, unique: true },
    category: { type: String, default: 'general' },
    price: { type: Number, required: true },
    cost: Number,
    stock: { type: Number, default: 0 },
    visibility: {
      type: String,
      enum: ['public', 'private', 'restricted'],
      default: 'public',
    },
    isVisible: { type: Boolean, default: true },
    applicableFor: {
      type: [{ type: String, enum: ['Vendor', 'Client', 'Public'] }],
      default: ['Public'],
    },
    width: Number,
    height: Number,
    unit: String,
    image: String,
    images: { type: [String], default: [] },
    thumbnailImage: String,
    videoUrl: String,
    youtubeLink: String,
    instagramLink: String,
    vendorPrice: { type: Number, default: 0 },
    clientPrice: { type: Number, default: 0 },
    publicPrice: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<IProduct>('Product', ProductSchema);
