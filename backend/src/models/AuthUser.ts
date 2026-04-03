import mongoose, { Schema, Document } from 'mongoose';

export interface IAuthUser extends Document {
  name: string;
  email: string;
  mobile: string;
  role: string;
  passwordHash: string;
  firmName?: string;
  profileImage?: string;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const AuthUserSchema = new Schema<IAuthUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    mobile: { type: String, required: true, unique: true, trim: true },
    role: { type: String, default: 'sub_vendor', required: true },
    passwordHash: { type: String, required: true },
    firmName: { type: String, default: '' },
    profileImage: { type: String, default: '' },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export default mongoose.model<IAuthUser>('AuthUser', AuthUserSchema);
