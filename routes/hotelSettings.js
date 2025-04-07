// backend/routes/hotelSettings.js


import express from 'express';
import {
  getHotelSettings,
  registerHotel,
  updateHotelSettings,
  uploadHotelPhoto,
  getHotelPhotos,
  deleteHotelPhoto,
} from '../controllers/hotelSettingsController.js';
import asyncHandler from '../utils/asyncHandler.js';
import { protect, protectOrProtectCustomer } from '../middleware/authMiddleware.js';
import { verifyCsrfToken } from '../middleware/csrfMiddleware.js';

const router = express.Router();

// 호텔 관리자용 엔드포인트
router.get('/', protect, asyncHandler(getHotelSettings));
router.post('/', protect, verifyCsrfToken, asyncHandler(registerHotel));
router.patch('/:hotelId', protect, verifyCsrfToken, asyncHandler(updateHotelSettings));
router.post('/photos', protect, verifyCsrfToken, asyncHandler(uploadHotelPhoto));
router.delete('/photos', protect, verifyCsrfToken, asyncHandler(deleteHotelPhoto));

// 고객과 관리자 모두 접근 가능한 사진 조회 엔드포인트
router.get('/photos', protectOrProtectCustomer, asyncHandler(getHotelPhotos));

export default router;