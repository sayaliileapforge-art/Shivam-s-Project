import mongoose, { Schema, Document } from 'mongoose';

export interface IProjectDesignTemplate extends Document {
  projectId: string;
  clientId?: string;
  templateName: string;
  templateType: string;
  canvas: { width: number; height: number };
  margin: { top: number; left: number; right: number; bottom: number };
  applicableFor?: string;
  canvasJSON?: string;
  thumbnail?: string;
  isPublic: boolean;
  isDefault: boolean;
}

const ProjectDesignTemplateSchema = new Schema<IProjectDesignTemplate>(
  {
    projectId: { type: String, required: true, index: true },
    clientId: { type: String, index: true },
    templateName: { type: String, required: true, trim: true },
    templateType: { type: String, default: 'id_card' },
    canvas: {
      width: { type: Number, default: 297 },
      height: { type: Number, default: 210 },
    },
    margin: {
      top: { type: Number, default: 1 },
      left: { type: Number, default: 1 },
      right: { type: Number, default: 1 },
      bottom: { type: Number, default: 1 },
    },
    applicableFor: String,
    canvasJSON: String,
    thumbnail: String,
    isPublic: { type: Boolean, default: false },
    isDefault: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

export default mongoose.model<IProjectDesignTemplate>(
  'ProjectDesignTemplate',
  ProjectDesignTemplateSchema
);
