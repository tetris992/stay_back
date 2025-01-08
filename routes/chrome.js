// backend/routes/chrome.js

import express from 'express';
import logger from '../utils/logger.js';
import { protect } from '../middleware/authMiddleware.js'; // 인증 미들웨어
import connectToChrome from '../scrapers/browserConnection.js';

const router = express.Router();

// 브라우저 상태 확인 엔드포인트 (인증 필요)
router.get('/status', protect, async (req, res) => {
  try {
    const browser = await connectToChrome();
    const pages = await browser.pages();
    res.json({ success: true, message: 'Browser is running', pages: pages.length });
  } catch (error) {
    logger.error('Error checking browser status:', error.message);
    res.status(500).json({ success: false, message: 'Browser is not running' });
  }
});

export default router;
