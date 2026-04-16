const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone is required'],
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
    },
    schoolCode: {
      type: String,
      required: function () {
        return this.role !== 'vendor';
      },
      trim: true,
      uppercase: true,
      default: null,
    },
    schoolName: {
      type: String,
      trim: true,
      default: '',
    },
    vendorCode: {
      type: String,
      required: function () {
        return this.role === 'vendor';
      },
      trim: true,
      uppercase: true,
      default: null,
    },
    role: {
      type: String,
      enum: ['student', 'teacher', 'principal', 'vendor'],
      required: [true, 'Role is required'],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false }
);

module.exports = mongoose.model('User', userSchema);
