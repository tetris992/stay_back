// backend/models/RefreshToken.js

import mongoose from 'mongoose';

const RefreshTokenSchema = new mongoose.Schema({
  hotelId: {
    // user -> hotelId로 변경
    type: String,
    required: true,
    unique: true, // 각 호텔 ID당 하나의 리프레시 토큰만 허용
  },
  token: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// 자동으로 만료된 토큰 삭제
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RefreshToken = mongoose.model('RefreshToken', RefreshTokenSchema);

export default RefreshToken;
