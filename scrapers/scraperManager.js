// // backend/scrapers/scraperManager.js
// import async from 'async';
// import dotenv from 'dotenv';
// import path from 'path';
// import { fileURLToPath } from 'url';

// import logger from '../utils/logger.js';
// import connectToChrome from './browserConnection.js';
// import Yanolja from './yanolja.js';

// import RefreshToken from '../models/RefreshToken.js';
// import ScraperTask from '../models/ScraperTask.js';
// import notifier from '../utils/notifier.js';

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// dotenv.config({ path: path.resolve(__dirname, '../.env') });

// class ScraperManager {
//   constructor() {
//     // this.browserInstance = null;
//     // this.initialized = false;

//     // (1) OTA 스크래퍼 맵
//     this.scraperFunctions = {
//       Yanolja,
//     };

//     // (2) 동시성 5개의 작업 큐
//     this.scraperQueue = async.queue(
//       async ({ taskFunction, taskName, hotelId, retryCount = 0 }) => {
//         logger.info(
//           `Starting task: ${taskName} for hotelId: ${hotelId} at ${new Date().toLocaleTimeString()}`
//         );
//         const startTime = Date.now();

//         // ScraperTask DB에 상태 = 'in_progress'
//         try {
//           await ScraperTask.findOneAndUpdate(
//             { hotelId, taskName },
//             { status: 'in_progress', lastRunAt: new Date() },
//             { upsert: true, new: true }
//           );
//         } catch (err) {
//           logger.error(
//             `Failed to set in_progress for ${taskName} in ${hotelId}:`,
//             err
//           );
//         }

//         let browser = null; // [ADDED] 브라우저 인스턴스 참조

//         try {
//           // [ADDED] 각 작업마다 Puppeteer 브라우저를 새로 띄움
//           browser = await connectToChrome();
//           logger.info(
//             `[ScraperManager] Launched new browser for hotelId=${hotelId}`
//           );

//           // 실행 (120초 타임아웃)
//           await Promise.race([
//             // [CHANGED] browser 인스턴스를 인자로 넘김
//             taskFunction(hotelId, taskName, browser),
//             new Promise((_, reject) =>
//               setTimeout(() => reject(new Error('Task timed out')), 120_000)
//             ),
//           ]);

//           // 완료 => 'completed'
//           const endTime = Date.now();
//           logger.info(
//             `Finished task: ${taskName} for hotelId: ${hotelId} (Duration: ${
//               endTime - startTime
//             } ms)`
//           );
//           try {
//             await ScraperTask.findOneAndUpdate(
//               { hotelId, taskName },
//               { status: 'completed', lastRunAt: new Date(), lastError: null },
//               { upsert: true, new: true }
//             );
//           } catch (err2) {
//             logger.error('Failed to update completed:', err2);
//           }
//         } catch (error) {
//           // 오류 처리
//           logger.error(
//             `Error in task: ${taskName}, hotelId: ${hotelId} - ${error.message}`
//           );

//           try {
//             await ScraperTask.findOneAndUpdate(
//               { hotelId, taskName },
//               {
//                 status: 'failed',
//                 lastRunAt: new Date(),
//                 lastError: error.message,
//               },
//               { upsert: true, new: true }
//             );
//           } catch (err3) {
//             logger.error('Failed to update failed status:', err3);
//           }

//           // 오류 알림
//           try {
//             await notifier.sendErrorNotification({
//               hotelId,
//               taskName,
//               errorMessage: error.message,
//             });
//           } catch (notifyError) {
//             logger.error('Error sending notification:', notifyError);
//           }

//           // 재시도(1회)
//           if (error.message !== 'No reservations found') {
//             if (retryCount < 1) {
//               const newRetryCount = retryCount + 1;
//               logger.info(
//                 `Re-adding task: ${taskName} for hotelId: ${hotelId} (Retry ${newRetryCount}) in 1 minute`
//               );
//               setTimeout(() => {
//                 this.scraperQueue.push({
//                   taskFunction,
//                   taskName,
//                   hotelId,
//                   retryCount: newRetryCount,
//                 });
//               }, 60_000);
//             } else {
//               logger.error(
//                 `Max retries reached for ${taskName}, hotelId=${hotelId}`
//               );
//             }
//           } else {
//             logger.info(
//               `No reservations => skipping retry for hotelId=${hotelId}`
//             );
//           }
//         } finally {
//           // [ADDED] 스크래핑 작업 종료 후 항상 브라우저 닫기
//           if (browser) {
//             try {
//               await browser.close();
//               logger.info(
//                 `[ScraperManager] Closed browser for hotelId=${hotelId}`
//               );
//             } catch (closeErr) {
//               logger.error(
//                 `Error closing browser for hotelId=${hotelId}: ${closeErr.message}`
//               );
//             }
//           }
//         }
//       },
//       5 // 동시성
//     );

//     // 큐가 빌 때
//     this.scraperQueue.drain(() => {
//       logger.info('All tasks have been processed (Yanolja).');
//     });
//   }

//   // 스크래핑 시작
//   async startScraping(hotelId) {
//     // [REMOVED] if (!this.initialized) { ... }
//     // [REMOVED] await this.initializeQueue();
//     this.enqueueScrapeTask(hotelId);
//   }

//   enqueueScrapeTask(hotelId) {
//     const taskName = 'Yanolja';
//     const taskFunction = this.scraperFunctions[taskName];
//     if (!taskFunction) {
//       logger.warn('No Yanolja function found. Skipping.');
//       return;
//     }
//     this.scraperQueue.push({ taskFunction, taskName, hotelId });
//     logger.info(`[enqueueScrapeTask] Added Yanolja for hotelId: ${hotelId}`);
//   }

//   // (선택) 서버 시작 시 초기 태스크
//   async enqueueInitialTasks() {
//     try {
//       const hotels = await RefreshToken.find({});
//       logger.info(`Found ${hotels.length} hotels to process (initial).`);
//       for (const hotel of hotels) {
//         this.enqueueScrapeTask(hotel.hotelId);
//       }
//     } catch (err) {
//       logger.error('Error in enqueueInitialTasks:', err);
//     }
//   }

//   // // 브라우저 초기화
//   // async initializeQueue() {
//   //   try {
//   //     logger.info('Starting ScraperManager for Yanolja...');
//   //     this.browserInstance = await connectToChrome(); // launch 기반
//   //     logger.info('Browser instance connected.');
//   //     this.initialized = true;

//   //     // this.monitorBrowser(); // 필요시
//   //   } catch (error) {
//   //     logger.error('Browser init failed:', error);
//   //     process.exit(1);
//   //   }
//   // }

//   // // (선택) 브라우저 모니터링
//   // monitorBrowser() {
//   //   setInterval(async () => {
//   //     if (!this.browserInstance?.isConnected()) {
//   //       logger.warn('Browser instance not connected => reconnecting...');
//   //       try {
//   //         this.browserInstance = await connectToChrome();
//   //         logger.info('Reconnected to Chrome.');
//   //       } catch (err) {
//   //         logger.error('Failed to reconnect:', err);
//   //       }
//   //     }
//   //   }, 5 * 60_000);
//   // }

//   // 특정 호텔 스크래핑 중단
//   async stopScraping(hotelId) {
//     this.scraperQueue.remove((task) => task.hotelId === hotelId);
//     logger.info(`Stopped Yanolja scraping for hotelId=${hotelId}`);
//   }

//   // 전체 중단
//   async stopAll() {
//     this.scraperQueue.kill();
//     // [REMOVED] if (this.browserInstance) { ... }
//     logger.info('All tasks stopped.');
//   }

//   // Graceful Shutdown
//   async gracefulShutdown() {
//     logger.info('Gracefully shutting down Yanolja queue...');
//     this.scraperQueue.kill();

//     // [REMOVED] if (this.browserInstance) { await this.browserInstance.close(); ... }

//     this.scraperQueue.drain(() => {
//       logger.info('All Yanolja tasks drained. Exiting...');
//       process.exit(0);
//     });

//     setTimeout(() => {
//       logger.warn('Forcing shutdown after drain timeout.');
//       process.exit(1);
//     }, 10000);
//   }
// }

// const scraperManager = new ScraperManager();
// export default scraperManager;
