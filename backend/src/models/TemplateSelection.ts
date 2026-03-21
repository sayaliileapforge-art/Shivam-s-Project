import mongoose, { Schema, Document } from 'mongoose';

export type SelectionAction = 'customize' | 'direct_order';

export interface ITemplateSelection extends Document {
  userId?: string;
  productId: mongoose.Types.ObjectId;
  templateId: mongoose.Types.ObjectId;
  action: SelectionAction;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const TemplateSelectionSchema = new Schema<ITemplateSelection>(
  {
    userId: { type: String, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    templateId: { type: Schema.Types.ObjectId, ref: 'ProductTemplate', required: true, index: true },
    action: { type: String, enum: ['customize', 'direct_order'], required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export default mongoose.model<ITemplateSelection>('TemplateSelection', TemplateSelectionSchema);
