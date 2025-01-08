// backend/routes/reservations.js

import express from 'express';
import {
  getReservations,
  createOrUpdateReservations,
  confirmReservation,
  updateReservation,
  deleteReservation,
  getCanceledReservations, // 추가한 컨트롤러 임포트
} from '../controllers/reservationsController.js';
import asyncHandler from '../utils/asyncHandler.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// 정상 예약 목록 조회
router.get('/', protect, asyncHandler(getReservations));

// 취소된 예약 목록 조회
router.get('/canceled', protect, asyncHandler(getCanceledReservations));

// 예약 생성 또는 업데이트
router.post('/', protect, asyncHandler(createOrUpdateReservations));

// 특정 예약 수정
router.patch('/:reservationId', protect, asyncHandler(updateReservation));

// 특정 예약 삭제
router.delete('/:reservationId', protect, asyncHandler(deleteReservation));

// 특정 예약 확정
router.post('/:reservationId/confirm', protect, asyncHandler(confirmReservation));

export default router;
