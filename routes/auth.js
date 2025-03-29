// backend/routes/auth.js
import express from 'express';
import {
  loginUser,
  refreshAccessToken,
  logout,
  registerUser,
  getUserInfo,
  updateUser,
  postConsent,
  getConsentStatus,
  requestPasswordReset,
  resetPasswordController,
} from '../controllers/authController.js';
import asyncHandler from '../utils/asyncHandler.js';
import logger from '../utils/logger.js';
import { protect } from '../middleware/authMiddleware.js';
import { getAuthStatus } from '../controllers/authController.js';
import HotelSettingsModel from '../models/HotelSettings.js';

const router = express.Router();

// 토큰 유효성 검증 엔드포인트
router.get('/validate', protect, (req, res) => {
  res
    .status(200)
    .json({ message: 'Token is valid', hotelId: req.user.hotelId });
});

// POST /auth/consent
router.post('/consent', protect, asyncHandler(postConsent));

// GET /auth/consent
router.get('/consent', protect, asyncHandler(getConsentStatus));

// 인증 상태 확인 라우트
router.get('/status', protect, asyncHandler(getAuthStatus));

// 로그인 라우트
router.post(
  '/login',
  asyncHandler(async (req, res, next) => {
    logger.info('Login route hit');
    await loginUser(req, res);
  })
);

// Refresh Access Token 라우트
router.post(
  '/refresh-token',
  asyncHandler(async (req, res, next) => {
    logger.info('Refresh Access Token route hit');
    await refreshAccessToken(req, res);
  })
);

// 로그아웃 라우트 (보호 미들웨어 적용 시)
router.post(
  '/logout',
  protect,
  asyncHandler(async (req, res, next) => {
    logger.info('Logout route hit');
    await logout(req, res);
  })
);

// 회원가입 라우트
router.post(
  '/register',
  asyncHandler(async (req, res, next) => {
    logger.info('Register route hit');
    await registerUser(req, res);
  })
);

// 사용자 정보 가져오기 라우트 추가
router.get(
  '/users/:hotelId',
  protect,
  asyncHandler(async (req, res) => {
    logger.info('Get User Info route hit');
    await getUserInfo(req, res);
  })
);

// 사용자 정보 업데이트 라우트 추가
router.patch(
  '/users/:hotelId',
  protect,
  asyncHandler(async (req, res) => {
    logger.info('Update User route hit');
    await updateUser(req, res);
  })
);

// 비밀번호 재설정 요청 라우트
router.post(
  '/reset-password-request',
  asyncHandler(async (req, res) => {
    logger.info('Reset Password Request route hit');
    await requestPasswordReset(req, res);
  })
);

// 비밀번호 재설정 라우트
router.post(
  '/reset-password/:token',
  asyncHandler(async (req, res) => {
    logger.info('Reset Password route hit');
    await resetPasswordController(req, res);
  })
);

// 사진 업로드 페이지 진입 시 비밀번호 인증 라우트
router.post(
  '/validate-upload-password',
  protect,
  asyncHandler(async (req, res) => {
    const { hotelId, password } = req.body;

    if (!hotelId || !password) {
      return res
        .status(400)
        .json({ message: 'hotelId와 password는 필수입니다.' });
    }

    const hotelSettings = await HotelSettingsModel.findOne({ hotelId });
    if (!hotelSettings) {
      return res.status(404).json({ message: '호텔 설정을 찾을 수 없습니다.' });
    }

    // 비밀번호 비교 (실제로는 암호화된 비밀번호를 비교해야 함, 예: bcrypt)
    const isValid = password === hotelSettings.adminPassword; // 임시로 평문 비교
    res.status(200).json({ valid: isValid });
  })
);

export default router;
