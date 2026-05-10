/**
 * TemplateGalleryMeta — a lightweight mirror of ProductTemplate fields
 * used exclusively by the public template gallery.
 *
 * Why: ProductTemplate documents can be several MB each (designData blobs).
 * Atlas M0 free tier cold-storage reads for 5 such documents take >60 seconds,
 * making the gallery unresponsive. By mirroring only the metadata fields (no
 * designData) into this separate collection, gallery reads are <100 ms even
 * on Atlas M0 with cold storage.
 *
 * This collection is updated whenever a template is created or updated via the
 * templates route, and is populated at server startup via migrateGalleryMeta().
 */
import mongoose, { Document, Schema } from 'mongoose';

export interface ITemplateGalleryMeta extends Document {
  templateId: mongoose.Types.ObjectId; // FK → ProductTemplate._id
  productId?: mongoose.Types.ObjectId;
  projectId?: string;
  templateName: string;
  description?: string;
  category?: string;
  previewImageUrl?: string;
  preview_image?: string;
  designFileUrl?: string;
  isGlobal: boolean;
  isActive: boolean;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const TemplateGalleryMetaSchema = new Schema<ITemplateGalleryMeta>(
  {
    templateId: { type: Schema.Types.ObjectId, ref: 'ProductTemplate', required: true, unique: true, index: true },
    productId: { type: Schema.Types.ObjectId, index: true },
    projectId: { type: String, index: true },
    templateName: { type: String, required: true },
    description: String,
    category: String,
    previewImageUrl: String,
    preview_image: String,
    designFileUrl: String,
    isGlobal: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true },
    tags: [String],
  },
  { timestamps: true }
);

// Fast gallery query: filter by isGlobal + sort by updatedAt
TemplateGalleryMetaSchema.index({ isGlobal: 1, updatedAt: -1 });

const TemplateGalleryMeta = mongoose.model<ITemplateGalleryMeta>(
  'TemplateGalleryMeta',
  TemplateGalleryMetaSchema
);

export default TemplateGalleryMeta;
