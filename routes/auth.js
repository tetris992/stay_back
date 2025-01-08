// backend/routes/auth.js

import express from 'express';
import {
  loginUser,
  refreshAccessToken,
  logout,
  registerUser,
  getUserInfo, // 추가됨
  updateUser, // 추가됨
} from '../controllers/authController.js';
import asyncHandler from '../utils/asyncHandler.js';
import logger from '../utils/logger.js'; // logger 추가
import { protect } from '../middleware/authMiddleware.js'; 

const router = express.Router();

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
  protect, // 인증된 사용자만 접근 가능 (필요 시)
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

router.post(
  '/reset-password-request',
  asyncHandler(async (req, res) => {
    logger.info('Reset Password Request route hit');
    await requestPasswordReset(req, res);
  })
);

router.post(
  '/reset-password/:token',
  asyncHandler(async (req, res) => {
    logger.info('Reset Password route hit');
    await resetPasswordController(req, res);
  })
);

export default router;
