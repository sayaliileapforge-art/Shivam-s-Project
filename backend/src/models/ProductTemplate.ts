import mongoose, { Schema, Document } from 'mongoose';

export type TemplateCategory = 'Business' | 'Wedding' | 'Minimal' | 'Corporate' | 'Festival' | 'Other';

export interface IProductTemplate extends Document {
  productId: mongoose.Types.ObjectId;
  templateName: string;
  category: TemplateCategory;
  previewImageUrl: string;
  designFileUrl?: string;
  designData: Record<string, any>;
  isActive: boolean;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const ProductTemplateSchema = new Schema<IProductTemplate>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    templateName: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['Business', 'Wedding', 'Minimal', 'Corporate', 'Festival', 'Other'],
      default: 'Other',
      index: true,
    },
    previewImageUrl: { type: String, required: true },
    designFileUrl: String,
    designData: { type: Schema.Types.Mixed, default: {} },
    isActive: { type: Boolean, default: true, index: true },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

ProductTemplateSchema.index({ productId: 1, templateName: 1 }, { unique: true });

export default mongoose.model<IProductTemplate>('ProductTemplate', ProductTemplateSchema);
