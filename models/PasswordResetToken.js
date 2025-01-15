// backend/models/PasswordResetToken.js

import mongoose from 'mongoose';

const PasswordResetTokenSchema = new mongoose.Schema({
  hotelId: {
    type: String,
    required: true,
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

const PasswordResetToken = mongoose.model(
  'PasswordResetToken',
  PasswordResetTokenSchema
);

export default PasswordResetToken;
