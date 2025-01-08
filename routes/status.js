// backend/routes/status.js
import express from 'express';
import { getStatus, getDebuggerStatus, getOTAStatus } from '../controllers/statusController.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = express.Router();

// GET: 서버 상태 확인
router.get('/', asyncHandler(getStatus));

// GET: 디버깅 상태 확인
router.get('/debugger', asyncHandler(getDebuggerStatus));

// GET: OTA 로그인 상태 확인
router.get('/ota', asyncHandler(getOTAStatus));

export default router;
