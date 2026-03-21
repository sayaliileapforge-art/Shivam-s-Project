import mongoose, { Schema, Document } from 'mongoose';

export type OrderStatus = 'pending' | 'processing' | 'completed' | 'cancelled';

export interface ITemplateOrder extends Document {
  userId?: string;
  productId: mongoose.Types.ObjectId;
  templateId: mongoose.Types.ObjectId;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  customDesignData?: Record<string, any>;
  selectedTemplateSnapshot?: {
    templateName?: string;
    previewImageUrl?: string;
    category?: string;
  };
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
}

const TemplateOrderSchema = new Schema<ITemplateOrder>(
  {
    userId: { type: String, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    templateId: { type: Schema.Types.ObjectId, ref: 'ProductTemplate', required: true, index: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    customDesignData: { type: Schema.Types.Mixed },
    selectedTemplateSnapshot: {
      templateName: String,
      previewImageUrl: String,
      category: String,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'cancelled'],
      default: 'pending',
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model<ITemplateOrder>('TemplateOrder', TemplateOrderSchema);
