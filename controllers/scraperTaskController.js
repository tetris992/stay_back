// // backend/controllers/scraperTaskController.js

// import ScraperTask from '../models/ScraperTask.js';
// import logger from '../utils/logger.js';

// /**
//  * 다중 OTA에 대한 즉시 스크랩 작업을 큐에 추가하는 컨트롤러
//  */
// export const enqueueInstantScrapeTasks = async (req, res, scraperManager) => {
//   const { hotelId, otaNames } = req.body;

//   // 요청 본문 검증
//   if (!hotelId || !Array.isArray(otaNames) || otaNames.length === 0) {
//     return res.status(400).json({ message: 'hotelId와 최소 하나 이상의 otaNames가 필요합니다.' });
//   }

//   try {
//     // 각 OTA에 대해 스크랩 작업을 큐에 추가
//     otaNames.forEach((otaName) => {
//       scraperManager.enqueueScrapeTask(hotelId, otaName);
//     });

//     res.status(200).json({ message: `즉시 스크랩 작업이 추가되었습니다: ${otaNames.join(', ')}` });
//   } catch (error) {
//     console.error('즉시 스크랩 작업 추가 중 오류:', error);
//     res.status(500).json({ message: '서버 오류가 발생했습니다.' });
//   }
// };

// /**
//  * 스크래핑 작업 상태 조회 SG
//  */
// export const getScraperTasks = async (req, res) => {
//   try {
//     const tasks = await ScraperTask.find({});
//     res.status(200).json({ tasks });
//   } catch (error) {
//     logger.error('Error fetching scraper tasks:', error);
//     res.status(500).json({ message: 'Failed to fetch scraper tasks.' });
//   }
// };

// /**
//  * 특정 스크래핑 작업 재시작
//  * @param {Object} scraperManager - ScraperManager 인스턴스
//  */
// export const restartScraperTask = async (req, res, scraperManager) => {
//   const { hotelId, taskName } = req.body;

//   if (!hotelId || !taskName) {
//     return res.status(400).json({ message: 'hotelId와 taskName이 필요합니다.' });
//   }

//   try {
//     // 기존 작업 중지
//     await scraperManager.stopScraping(hotelId);

//     // 작업 재시작
//     await scraperManager.startScraping(hotelId);

//     res.status(200).json({ message: `Scraper task ${taskName} for hotelId ${hotelId} restarted successfully.` });
//   } catch (error) {
//     logger.error(`Error restarting scraper task ${taskName} for hotelId ${hotelId}:`, error);
//     res.status(500).json({ message: 'Failed to restart scraper task.' });
//   }
// };

// /**
//  * 모든 스크래핑 작업 리셋
//  * @param {Object} scraperManager - ScraperManager 인스턴스
//  */
// export const resetAllScraperTasks = async (req, res, scraperManager) => {
//   try {
//     // 모든 작업 중지
//     const allHotels = await ScraperTask.distinct('hotelId');
//     for (const hotelId of allHotels) {
//       await scraperManager.stopScraping(hotelId);
//     }

//     // 모든 작업 재시작
//     for (const hotelId of allHotels) {
//       await scraperManager.startScraping(hotelId);
//     }

//     res.status(200).json({ message: 'All scraper tasks have been reset successfully.' });
//   } catch (error) {
//     logger.error('Error resetting all scraper tasks:', error);
//     res.status(500).json({ message: 'Failed to reset all scraper tasks.' });
//   }
// };
