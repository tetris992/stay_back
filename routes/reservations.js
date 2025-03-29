import express from 'express';
import {
  getReservations,
  createOrUpdateReservations,
  confirmReservation,
  updateReservation,
  deleteReservation,
  getCanceledReservations,
  payPartial, // 새 컨트롤러 함수 추가
  payPerNight, // 새 컨트롤러 함수 추가
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

// 부분 결제 처리
router.post('/:reservationId/pay-partial', protect, asyncHandler(payPartial));

// 1박씩 결제 처리
router.post('/pay-per-night/:reservationId', protect, asyncHandler(payPerNight));

export default router;