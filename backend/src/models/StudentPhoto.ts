import mongoose, { Schema, Document } from 'mongoose';

export interface IPhotoVersion {
  version: number;
  url: string;
  type: 'original' | 'processed';
  createdAt: Date;
  note?: string;
}

export interface IStudentPhoto extends Document {
  clientId: mongoose.Types.ObjectId;
  dataRecordId?: mongoose.Types.ObjectId;
  studentName?: string;

  originalPhoto: string;         // URL — never overwritten
  processedPhoto?: string;       // URL — set after processing
  primaryPhoto: string;          // URL — always the current display photo

  processingStatus: 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'restored';
  processingJobId?: string;
  processingError?: string;
  processingStartedAt?: Date;
  processingCompletedAt?: Date;

  isProcessed: boolean;          // true when processedPhoto is active
  isRestored: boolean;           // true when original is active after a restore

  history: IPhotoVersion[];

  createdAt: Date;
  updatedAt: Date;
}

const PhotoVersionSchema = new Schema<IPhotoVersion>(
  {
    version:   { type: Number, required: true },
    url:       { type: String, required: true },
    type:      { type: String, enum: ['original', 'processed'], required: true },
    createdAt: { type: Date, default: Date.now },
    note:      String,
  },
  { _id: false }
);

const StudentPhotoSchema = new Schema<IStudentPhoto>(
  {
    clientId:     { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    dataRecordId: { type: Schema.Types.ObjectId, ref: 'DataRecord', index: true },
    studentName:  { type: String, index: true },

    originalPhoto:  { type: String, required: true },
    processedPhoto: String,
    primaryPhoto:   { type: String, required: true },

    processingStatus: {
      type: String,
      enum: ['pending', 'queued', 'processing', 'completed', 'failed', 'restored'],
      default: 'pending',
      index: true,
    },
    processingJobId:         String,
    processingError:         String,
    processingStartedAt:     Date,
    processingCompletedAt:   Date,

    isProcessed: { type: Boolean, default: false },
    isRestored:  { type: Boolean, default: false },

    history: { type: [PhotoVersionSchema], default: [] },
  },
  { timestamps: true }
);

// Compound index for fast lookup by client + student
StudentPhotoSchema.index({ clientId: 1, studentName: 1 });
StudentPhotoSchema.index({ clientId: 1, dataRecordId: 1 });

export default mongoose.model<IStudentPhoto>('StudentPhoto', StudentPhotoSchema);
