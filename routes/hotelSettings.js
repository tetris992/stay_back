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
import { protect } from '../middleware/authMiddleware.js';
import { verifyCsrfToken } from '../middleware/csrfMiddleware.js';
import multer from 'multer';

// Multer 설정: 메모리에 파일 저장 (S3 업로드 후 버퍼 사용)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB 제한
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('이미지 파일만 업로드 가능합니다.'));
    }
    cb(null, true);
  },
});

const router = express.Router();

// GET /hotel-settings - 호텔 설정 조회
router.get('/', protect, asyncHandler(getHotelSettings));

// POST /hotel-settings - 호텔 설정 등록
router.post('/', protect, verifyCsrfToken, asyncHandler(registerHotel));

// PATCH /hotel-settings/:hotelId - 호텔 설정 수정
router.patch('/:hotelId', protect, verifyCsrfToken, asyncHandler(updateHotelSettings));

// POST /hotel-settings/photos - 사진 업로드
router.post('/photos', protect, verifyCsrfToken, upload.single('photo'), asyncHandler(uploadHotelPhoto));

// GET /hotel-settings/photos - 사진 목록 조회
router.get('/photos', protect, asyncHandler(getHotelPhotos));

// DELETE /hotel-settings/photos - 사진 삭제
router.delete('/photos', protect, verifyCsrfToken, asyncHandler(deleteHotelPhoto));

export default router;