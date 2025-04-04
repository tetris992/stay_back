// backend/models/User.js
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import logger from '../utils/logger.js'; // 로거 추가

const UserSchema = new mongoose.Schema(
  {
    hotelId: {
      type: String,
      required: true,
      unique: true,
      minlength: [5, '호텔 ID는 최소 5자 이상이어야 합니다.'],
      maxlength: [20, '호텔 ID는 최대 20자 이하여야 합니다.'],
      index: true,
    },
    password: {
      type: String,
      required: true,
      minlength: [8, '비밀번호는 최소 8자 이상이어야 합니다.'],
    },
    hotelName: {
      type: String,
      required: false,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: /.+\@.+\..+/,
      index: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [
        /^(\+82|0)\s?([0-9]{2,4})\s?-?\s?([0-9]{3,4})\s?-?\s?([0-9]{4})$/,
        '전화번호는 올바른 형식이어야 합니다 (예: 010-2224-4444).',
      ],
      index: true,
    },
    consentChecked: {
      type: Boolean,
      default: false,
    },
    consentAt: {
      type: Date,
      default: null,
    },
    loginAttempts: {
      type: Number,
      default: 0,
      index: true,
    },
    lastAttemptAt: {
      type: Date,
      default: null,
      index: true,
    },
    passwordResetToken: {
      type: String,
      default: null,
    },
    passwordResetExpires: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

UserSchema.pre('save', function (next) {
  if (this.isModified('phoneNumber')) {
    this.phoneNumber = this.phoneNumber
      .replace(/\s+/g, '')
      .replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
  }
  next();
});

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    logger.error('Error hashing password in UserSchema:', {
      message: error.message,
      stack: error.stack,
      hotelId: this.hotelId,
    });
    next(error);
  }
});

UserSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

UserSchema.methods.generatePasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  this.passwordResetExpires = Date.now() + 3600000;
  return resetToken;
};

const User = mongoose.model('User', UserSchema);

export default User;