import mongoose, { Schema, Document } from 'mongoose';

export interface IClient extends Document {
  clientName: string;
  email: string;
  contact: string;
  gstNumber?: string;
  gstName?: string;
  gstStateCode?: string;
  gstAddress?: string;
  deliveryMode: string;
  type: string;
  address?: string;
  pincode?: string;
  city?: string;
  state?: string;
  district?: string;
  schoollogUniqueId?: string;
  busStop?: string;
  route?: string;
  status: 'active' | 'inactive' | 'blocked';
  salesPerson?: string;
  maxCredit?: number;
  balance?: number;
  createdAt: Date;
  updatedAt: Date;
}

const ClientSchema = new Schema<IClient>(
  {
    clientName: { type: String, required: true },
    email: { type: String, required: true },
    contact: { type: String, required: true },
    gstNumber: String,
    gstName: String,
    gstStateCode: String,
    gstAddress: String,
    deliveryMode: { type: String, required: true },
    type: { type: String, required: true },
    address: String,
    pincode: String,
    city: String,
    state: String,
    district: String,
    schoollogUniqueId: String,
    busStop: String,
    route: String,
    status: {
      type: String,
      enum: ['active', 'inactive', 'blocked'],
      default: 'active',
    },
    salesPerson: String,
    maxCredit: Number,
    balance: Number,
  },
  { timestamps: true }
);

export default mongoose.model<IClient>('Client', ClientSchema);
