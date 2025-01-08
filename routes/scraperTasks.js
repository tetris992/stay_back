// backend/routes/scraperTasks.js

import express from 'express';
import {
  getScraperTasks,
  restartScraperTask,
  resetAllScraperTasks,
  enqueueInstantScrapeTasks, // 새로 추가된 컨트롤러
} from '../controllers/scraperTaskController.js';
import { protect } from '../middleware/authMiddleware.js';
import asyncHandler from '../utils/asyncHandler.js';
import logger from '../utils/logger.js';
import scraperManager from '../scrapers/scraperManager.js';

const router = express.Router();

// 스크래핑 작업 상태 조회 라우트
router.get(
  '/',
  protect,
  asyncHandler(async (req, res) => {
    logger.info('Get Scraper Tasks route hit');
    await getScraperTasks(req, res);
  })
);

// 스크래핑 작업 재시작 라우트
router.post(
  '/restart',
  protect,
  asyncHandler(async (req, res) => {
    logger.info('Restart Scraper Task route hit');
    await restartScraperTask(req, res, scraperManager); // ScraperManager 전달
  })
);

// 모든 스크래핑 작업 리셋 라우트
router.post(
  '/reset-all',
  protect,
  asyncHandler(async (req, res) => {
    logger.info('Reset All Scraper Tasks route hit');
    await resetAllScraperTasks(req, res, scraperManager); // ScraperManager 전달
  })
);

// 즉시 스크랩 작업 추가 라우트
router.post(
  '/instant',
  protect,
  asyncHandler(async (req, res) => {
    logger.info('Enqueue Instant Scrape Tasks route hit');
    await enqueueInstantScrapeTasks(req, res, scraperManager); // ScraperManager 전달
  })
);

export default router;
