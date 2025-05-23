import express from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import { protectCustomer } from '../middleware/authMiddleware.js';
import {
  loginCustomer,
  loginCustomerSocial,
  registerCustomer,
  createReservation,
  getReservationHistory,
  requestCustomerPasswordReset,
  resetCustomerPassword,
  cancelReservation,
  connectSocialAccount,
  getHotelList,
  getHotelAvailability,
  getCustomerHotelSettings,
  logoutCustomer,
  getSocialLoginSettings,
  refreshCustomerToken,
  updateCustomer, // 추가
  getAgreements, // 추가
  checkDuplicate,
  activateAccount,
} from '../controllers/customerController.js';

const router = express.Router();

// 고객 로그인
router.post('/login', asyncHandler(loginCustomer));

// 소셜 로그인
router.post('/login/social/:provider', asyncHandler(loginCustomerSocial));

// 고객 로그아웃
router.post('/logout', protectCustomer, asyncHandler(logoutCustomer));

// 리프레시 토큰 엔드포인트 추가
router.post('/refresh-token', asyncHandler(refreshCustomerToken));

// 회원 정보 수정 (추가)
router.put('/update', protectCustomer, asyncHandler(updateCustomer));

// 동의 내역 조회 (추가)
router.get('/agreements', protectCustomer, asyncHandler(getAgreements));

// 중복 내역 조회 (추가)
router.post('/check-duplicate', asyncHandler(checkDuplicate));

// 회원가입
router.post('/register', asyncHandler(registerCustomer));
// 계정 활성화 (추가)
router.post('/activate-account', asyncHandler(activateAccount));

router.get(
  '/hotel-settings',
  protectCustomer,
  asyncHandler(getCustomerHotelSettings)
);

// 소셜 계정 연결 엔드포인트 추가
router.post(
  '/connect-social/:provider',
  protectCustomer,
  asyncHandler(connectSocialAccount)
);

// 호텔 목록 조회
router.get('/hotel-list', protectCustomer, asyncHandler(getHotelList));

// 호텔별 가용 객실 조회
router.get(
  '/hotel-availability',
  protectCustomer,
  asyncHandler(getHotelAvailability)
);

// 예약 생성 (인증 필요)
router.post('/reservation', protectCustomer, asyncHandler(createReservation));

// 예약 히스토리 조회 (인증 필요)
router.get('/history', protectCustomer, asyncHandler(getReservationHistory));

// 비밀번호 재설정 요청
router.post(
  '/request-password-reset',
  asyncHandler(requestCustomerPasswordReset)
);

// 비밀번호 재설정 처리
router.post('/reset-password/:token', asyncHandler(resetCustomerPassword));

// 소셜 로그인 설정 조회 (추가된 라우트)
router.get(
  '/social-login-settings',
  protectCustomer,
  asyncHandler(getSocialLoginSettings)
);

// 예약 취소 (인증 필요)
router.delete(
  '/reservation/:reservationId',
  protectCustomer,
  cancelReservation
);

export default router;
