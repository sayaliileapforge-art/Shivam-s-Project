import mongoose, { Schema, Document } from 'mongoose';

export interface IDataRecord extends Document {
  projectId: mongoose.Schema.Types.ObjectId;
  variables: Record<string, any>;
  qrCode?: string;
  barcode?: string;
  status: 'pending' | 'processed' | 'printed' | 'shipped';
  createdAt: Date;
  updatedAt: Date;
}

const DataRecordSchema = new Schema<IDataRecord>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    variables: { type: Schema.Types.Mixed, required: true },
    qrCode: String,
    barcode: String,
    status: {
      type: String,
      enum: ['pending', 'processed', 'printed', 'shipped'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

export default mongoose.model<IDataRecord>('DataRecord', DataRecordSchema);
