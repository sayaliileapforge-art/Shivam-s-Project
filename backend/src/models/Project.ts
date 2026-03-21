import mongoose, { Schema, Document } from 'mongoose';

export interface IProject extends Document {
  name: string;
  description?: string;
  clientId?: mongoose.Schema.Types.ObjectId;
  client?: string;
  templateId?: mongoose.Schema.Types.ObjectId;
  status: 'draft' | 'active' | 'archived' | 'completed';
  stage?: string;
  priority?: 'urgent' | 'high' | 'medium' | 'low';
  dueDate?: string;
  assignee?: string;
  amount?: number;
  workflowType?: 'variable_data' | 'direct_print';
  pages: number;
  canvasData: Record<string, any>[];
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProject>(
  {
    name: { type: String, required: true },
    description: String,
    clientId: { type: Schema.Types.ObjectId, ref: 'Client' },
    client: String,
    templateId: { type: Schema.Types.ObjectId, ref: 'Template' },
    status: {
      type: String,
      enum: ['draft', 'active', 'archived', 'completed'],
      default: 'draft',
    },
    stage: { type: String, default: 'draft' },
    priority: {
      type: String,
      enum: ['urgent', 'high', 'medium', 'low'],
      default: 'medium',
    },
    dueDate: String,
    assignee: String,
    amount: { type: Number, default: 0 },
    workflowType: {
      type: String,
      enum: ['variable_data', 'direct_print'],
      default: 'variable_data',
    },
    pages: { type: Number, default: 1 },
    canvasData: [Schema.Types.Mixed],
  },
  { timestamps: true }
);

export default mongoose.model<IProject>('Project', ProjectSchema);
