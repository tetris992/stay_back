import express from 'express';
import {
  getReservations,
  createOrUpdateReservations,
  confirmReservation,
  updateReservation,
  deleteReservation,
  getCanceledReservations,
  payPartial,
  payPerNight,
} from '../controllers/reservationsController.js';
import asyncHandler from '../utils/asyncHandler.js';
import { protectOrProtectCustomer } from '../middleware/authMiddleware.js';
import { verifyCsrfToken } from '../middleware/csrfMiddleware.js';
import ensureConsent from '../middleware/consentMiddleware.js';

const router = express.Router();

// 정상 예약 목록 조회
router.get('/', protectOrProtectCustomer, ensureConsent, asyncHandler(getReservations));

// 취소된 예약 목록 조회
router.get('/canceled', protectOrProtectCustomer, ensureConsent, asyncHandler(getCanceledReservations));

// 예약 생성 또는 업데이트
router.post('/', protectOrProtectCustomer, ensureConsent, verifyCsrfToken, asyncHandler(createOrUpdateReservations));

// 특정 예약 수정
router.patch('/:reservationId', protectOrProtectCustomer, ensureConsent, verifyCsrfToken, asyncHandler(updateReservation));

// 특정 예약 삭제
router.delete('/:reservationId', protectOrProtectCustomer, ensureConsent, verifyCsrfToken, asyncHandler(deleteReservation));

// 특정 예약 확정
router.post('/:reservationId/confirm', protectOrProtectCustomer, ensureConsent, verifyCsrfToken, asyncHandler(confirmReservation));

// 부분 결제 처리
router.post('/:reservationId/pay-partial', protectOrProtectCustomer, ensureConsent, verifyCsrfToken, asyncHandler(payPartial));

// 1박씩 결제 처리
router.post('/pay-per-night/:reservationId', protectOrProtectCustomer, ensureConsent, verifyCsrfToken, asyncHandler(payPerNight));

export default router;