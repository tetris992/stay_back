import express from 'express';
import { registerUser } from '../controllers/authController.js';
import asyncHandler from '../utils/asyncHandler.js';
import { verifyCsrfToken } from '../middleware/csrfMiddleware.js';

const router = express.Router();

// POST: 호텔 아이디 등록 라우트
router.post('/', verifyCsrfToken, asyncHandler(registerUser));

export default router;