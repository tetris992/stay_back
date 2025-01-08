// backend/routes/registerUser.js

import express from 'express';
import { registerUser } from '../controllers/authController.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = express.Router();

// POST: 호텔 아이디 등록 라우트
router.post('/', asyncHandler(registerUser));

export default router;
