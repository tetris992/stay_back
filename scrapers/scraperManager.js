// backend/scrapers/scraperManager.js
import async from 'async';
import dotenv from 'dotenv';
import connectToChrome from './browserConnection.js';
import Yanolja from './yanolja.js';  // === (수정) 다른 OTA 제거
import logger from '../utils/logger.js';

import RefreshToken from '../models/RefreshToken.js';
import ScraperTask from '../models/ScraperTask.js';
import notifier from '../utils/notifier.js'; // 알림 유틸

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

class ScraperManager {
  constructor() {
    this.browserInstance = null;
    this.activeHotels = new Set();
    this.initialized = false;

    // === (수정) 오직 야놀자만 남긴다
    this.scraperFunctions = {
      // key=taskName
      Yanolja,
    };

    // intervalTimers 등 스케줄링 관련
    this.intervalTimers = new Map();
    this.globalIntervals = new Map();

    // 동시성 5
    this.scraperQueue = async.queue(
      async ({ taskFunction, taskName, hotelId, retryCount = 0 }) => {
        logger.info(
          `Starting task: ${taskName} for hotelId: ${hotelId} at ${new Date().toLocaleTimeString()}`
        );
        const startTime = Date.now();

        // === (기존) 스크래핑 상태 in_progress 저장
        try {
          await ScraperTask.findOneAndUpdate(
            { hotelId, taskName },
            { status: 'in_progress', lastRunAt: new Date() },
            { upsert: true, new: true }
          );
        } catch (error) {
          logger.error(
            `Failed to set in_progress for ${taskName} in ${hotelId}:`,
            error
          );
        }

        try {
          // === (30~120초 타임아웃; 여기선 120초)
          await Promise.race([
            taskFunction(hotelId, taskName, this.browserInstance),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Task timed out')), 120000)
            ),
          ]);

          const endTime = Date.now();
          logger.info(
            `Finished task: ${taskName} for hotelId: ${hotelId} (Duration: ${
              endTime - startTime
            } ms)`
          );

          // === 스크래핑 상태 completed
          try {
            await ScraperTask.findOneAndUpdate(
              { hotelId, taskName },
              { status: 'completed', lastRunAt: new Date(), lastError: null },
              { upsert: true, new: true }
            );
          } catch (err2) {
            logger.error('Failed to update completed:', err2);
          }
        } catch (error) {
          logger.error(
            `Error in task: ${taskName}, hotelId: ${hotelId} - ${error.message}`
          );

          // === failed
          try {
            await ScraperTask.findOneAndUpdate(
              { hotelId, taskName },
              {
                status: 'failed',
                lastRunAt: new Date(),
                lastError: error.message,
              },
              { upsert: true, new: true }
            );
          } catch (err3) {
            logger.error('Failed to update failed status:', err3);
          }

          // === 오류 알림
          try {
            await notifier.sendErrorNotification({
              hotelId,
              taskName,
              errorMessage: error.message,
            });
          } catch (notifyError) {
            logger.error('Error sending notification:', notifyError);
          }

          // === 재시도 로직 (1회까지만)
          if (error.message !== 'No reservations found') {
            if (retryCount < 1) {
              const newRetryCount = retryCount + 1;
              logger.info(
                `Re-adding task: ${taskName} for hotelId: ${hotelId} (Retry ${newRetryCount}) in 1 minute`
              );
              setTimeout(() => {
                this.scraperQueue.push({
                  taskFunction,
                  taskName,
                  hotelId,
                  retryCount: newRetryCount,
                });
              }, 60 * 1000);
            } else {
              logger.error(`Max retries reached for ${taskName}, hotelId=${hotelId}`);
            }
          } else {
            logger.info(`No reservations => skipping retry for hotelId=${hotelId}`);
          }
        }
      },
      5
    );

    this.scraperQueue.drain(() => {
      logger.info('All tasks have been processed (Yanolja).');
    });
  }

  // === (새 메서드) 즉시 스크래핑 (리액트에서 "즉시 스크랩" 버튼 눌렀을 때 호출)
  async startScraping(hotelId) {
    if (!this.initialized) {
      await this.initializeQueue(); // 브라우저 연결
    }
    // 큐에 Yanolja 작업 추가
    this.enqueueScrapeTask(hotelId);
  }

  enqueueScrapeTask(hotelId) {
    // taskName= 'Yanolja'
    const taskName = 'Yanolja';
    const taskFunction = this.scraperFunctions[taskName];
    if (!taskFunction) {
      logger.warn('No Yanolja function found. Skipping.');
      return;
    }
    this.scraperQueue.push({ taskFunction, taskName, hotelId });
    logger.info(`[enqueueScrapeTask] Added Yanolja for hotelId: ${hotelId}`);
  }

  // 프로그램 시작 시 초기 작업 (원하면 사용)
  async enqueueInitialTasks() {
    try {
      const hotels = await RefreshToken.find({});
      logger.info(`Found ${hotels.length} hotels to process (initial).`);
      for (const hotel of hotels) {
        // 필요시: 호텔 설정에서 "야놀자 활성화"인지 확인 가능
        // 여기선 단순히 enqueue
        this.enqueueScrapeTask(hotel.hotelId);
      }
    } catch (err) {
      logger.error('Error in enqueueInitialTasks:', err);
    }
  }

  async initializeQueue() {
    try {
      logger.info('Starting ScraperManager for Yanolja...');
      // === (기존 Chrome 접속 or spawn)
      this.browserInstance = await connectToChrome();
      logger.info('Browser instance connected.');
      this.initialized = true;

      // 초기 태스크 (원하면)
      // await this.enqueueInitialTasks();

      // 모니터링
      this.monitorBrowser();
    } catch (error) {
      logger.error('Browser init failed:', error);
      process.exit(1);
    }
  }

  monitorBrowser() {
    setInterval(async () => {
      if (!this.browserInstance || !this.browserInstance.isConnected()) {
        logger.warn('Browser instance not connected => reconnecting...');
        try {
          this.browserInstance = await connectToChrome();
          logger.info('Reconnected to Chrome.');
        } catch (err) {
          logger.error('Failed to reconnect:', err);
        }
      }
    }, 5 * 60 * 1000); // 5분
  }

  // === (수정) 불필요한 스케줄링 로직 제거 or 최소화
  clearDynamicScheduling() {
    for (const [taskName, timers] of this.intervalTimers.entries()) {
      for (const [hotelId, timerId] of timers.entries()) {
        clearInterval(timerId);
        logger.info(`Cleared interval for Yanolja, hotelId=${hotelId}`);
      }
      timers.clear();
    }
    this.intervalTimers.clear();

    for (const [taskName, timerId] of this.globalIntervals.entries()) {
      clearInterval(timerId);
      logger.info('Cleared global interval for Yanolja');
    }
    this.globalIntervals.clear();
  }

  // === (옵션) 스크래핑 중단
  async stopScraping(hotelId) {
    this.scraperQueue.remove((task) => task.hotelId === hotelId);
    logger.info(`Stopped Yanolja scraping for hotelId=${hotelId}`);
  }

  // === (전체 중단)
  async stopAll() {
    this.scraperQueue.kill();
    if (this.browserInstance) {
      try {
        await this.browserInstance.close();
        logger.info('Browser closed.');
      } catch (err) {
        logger.error('Error closing browser:', err);
      }
    }
    this.initialized = false;
  }

  // === (Graceful Shutdown)
  async gracefulShutdown() {
    logger.info('Gracefully shutting down Yanolja queue...');
    this.scraperQueue.kill();
    this.clearDynamicScheduling();

    try {
      if (this.browserInstance) {
        await this.browserInstance.close();
        logger.info('Browser closed.');
      }
    } catch (error) {
      logger.error('Error closing browser:', error);
    }

    this.scraperQueue.drain(() => {
      logger.info('All Yanolja tasks drained. Exiting...');
      process.exit(0);
    });

    setTimeout(() => {
      logger.warn('Forcing shutdown after drain timeout.');
      process.exit(1);
    }, 10000);
  }
}

const scraperManager = new ScraperManager();
export default scraperManager;
