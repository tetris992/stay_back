// routes/dayUseReservations.js
import express from 'express';
import {
  createDayUseReservation,
  deleteDayUseReservation,
  updateDayUseReservation,
  getDayUseReservations,
} from '../controllers/dayUseReservationsController.js';
import asyncHandler from '../utils/asyncHandler.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// 대실 예약 목록 조회
router.get('/', protect, asyncHandler(getDayUseReservations));

// 대실 예약 생성
router.post('/', protect, asyncHandler(createDayUseReservation));

// 대실 예약 수정
router.patch('/:reservationId', protect, asyncHandler(updateDayUseReservation));

// 대실 예약 삭제
router.delete('/:reservationId', protect, asyncHandler(deleteDayUseReservation));

export default router;