// backend/routes/hotelSettings.js

import express from 'express';
import {
  getHotelSettings,
  registerHotel,
  updateHotelSettings,
} from '../controllers/hotelSettingsController.js';
import asyncHandler from '../utils/asyncHandler.js';
import { protect } from '../middleware/authMiddleware.js'; // 보호 미들웨어 추가

const router = express.Router();

// GET: 호텔 설정 가져오기
router.get(
  '/',
  protect, // 인증된 사용자만 접근 가능
  asyncHandler(getHotelSettings)
);

// POST: 호텔 설정 저장 (초기 설정)
router.post(
  '/',
  protect, // 인증된 사용자만 접근 가능
  asyncHandler(registerHotel)
);

// PATCH: 호텔 설정 수정
router.patch(
  '/:hotelId',
  protect, // 인증된 사용자만 접근 가능
  asyncHandler(updateHotelSettings)
);

export default router;
