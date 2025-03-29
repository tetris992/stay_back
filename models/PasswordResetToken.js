// backend/models/PasswordResetToken.js
import mongoose from 'mongoose';

const PasswordResetTokenSchema = new mongoose.Schema({
  hotelId: {
    type: String,
    required: false, // hotelId는 필수가 아님
    index: true,
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: false, // customerId도 필수가 아님
    index: true,
  },
  token: {
    type: String,
    required: true,
    unique: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: '1h' }, // 토큰 자동 만료 (1시간)
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// hotelId 또는 customerId 중 하나는 필수로 설정
PasswordResetTokenSchema.pre('save', function (next) {
  if (!this.hotelId && !this.customerId) {
    return next(new Error('hotelId 또는 customerId 중 하나는 필수입니다.'));
  }
  if (this.hotelId && this.customerId) {
    return next(new Error('hotelId와 customerId는 동시에 설정될 수 없습니다.'));
  }
  next();
});

// 복합 인덱스 설정
PasswordResetTokenSchema.index({ hotelId: 1, token: 1 });
PasswordResetTokenSchema.index({ customerId: 1, token: 1 });

const PasswordResetToken = mongoose.model(
  'PasswordResetToken',
  PasswordResetTokenSchema
);

export default PasswordResetToken;