import mongoose, { Schema, Document } from 'mongoose';

export interface IAuthPasswordReset extends Document {
  email: string;
  otpHash: string;
  expiresAt: Date;
  isVerified: boolean;
  isUsed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AuthPasswordResetSchema = new Schema<IAuthPasswordReset>(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    isVerified: { type: Boolean, default: false },
    isUsed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default mongoose.model<IAuthPasswordReset>('AuthPasswordReset', AuthPasswordResetSchema);
