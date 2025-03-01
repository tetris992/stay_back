// import express from 'express';
// import {
//   getScraperTasks,
//   restartScraperTask,
//   resetAllScraperTasks,
//   enqueueInstantScrapeTasks,
// } from '../controllers/scraperTaskController.js';
// import { protect } from '../middleware/authMiddleware.js';
// import asyncHandler from '../utils/asyncHandler.js';
// import logger from '../utils/logger.js';

// // 주석: 현재 서버 스크랩 기능은 사용되지 않으며, 미래 복원을 위해 코드 유지
// // import scraperManager from '../scrapers/scraperManager.js';

// const router = express.Router();

// // 스크래핑 작업 상태 조회 라우트
// router.get(
//   '/',
//   protect,
//   asyncHandler(async (req, res) => {
//     logger.info('Get Scraper Tasks route hit');
//     await getScraperTasks(req, res);
//   })
// );

// // 스크래핑 작업 재시작 라우트 (현재 비활성)
// router.post(
//   '/restart',
//   protect,
//   asyncHandler(async (req, res) => {
//     logger.info('Restart Scraper Task route hit');
//     // await restartScraperTask(req, res, scraperManager); // 비활성
//     res.status(501).json({ message: '서버 스크랩 기능은 현재 비활성 상태입니다.' });
//   })
// );

// // 모든 스크래핑 작업 리셋 라우트 (현재 비활성)
// router.post(
//   '/reset-all',
//   protect,
//   asyncHandler(async (req, res) => {
//     logger.info('Reset All Scraper Tasks route hit');
//     // await resetAllScraperTasks(req, res, scraperManager); // 비활성
//     res.status(501).json({ message: '서버 스크랩 기능은 현재 비활성 상태입니다.' });
//   })
// );

// // 즉시 스크랩 작업 추가 라우트 (현재 비활성)
// router.post(
//   '/instant',
//   protect,
//   asyncHandler(async (req, res) => {
//     logger.info('Enqueue Instant Scrape Tasks route hit');
//     // await enqueueInstantScrapeTasks(req, res, scraperManager); // 비활성
//     res.status(501).json({ message: '서버 스크랩 기능은 현재 비활성 상태입니다.' });
//   })
// );

// export default router;