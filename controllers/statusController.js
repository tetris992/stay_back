// backend/controllers/statusController.js

import puppeteer from 'puppeteer';
import availableOTAs from '../config/otas.js';
import logger from '../utils/logger.js';

/**
 * 서버 상태 및 디버깅 크롬 상태, OTA 로그인 상태 확인 API
 */
export const getStatus = async (req, res) => {
  try {
    const systemStatus = {
      serverStatus: 'OK',
      timestamp: new Date(),
    };

    // Puppeteer 브라우저 연결
    try {
      const browser = await puppeteer.connect({
        browserWSEndpoint: 'ws://127.0.0.1:9223/devtools/browser',
      });

      // 디버깅 크롬 탭 상태 가져오기
      const pages = await browser.pages();
      const tabs = pages.map((page) => page.title());
      systemStatus.debuggerTabs = tabs;

      // OTA 로그인 상태 확인 시청 시
      const otaStatuses = {};
      for (const ota of availableOTAs) {
        const page = await browser.newPage();
        try {
          await page.goto(ota.url, { waitUntil: 'networkidle2' });
          const cookies = await page.cookies();
          const sessionCookie = cookies.find((cookie) =>
            ['session_id', 'laravel_session'].includes(cookie.name)
          );
          otaStatuses[ota.name] = sessionCookie ? 'active' : 'inactive';
        } catch (error) {
          otaStatuses[ota.name] = 'error';
          logger.error(`Failed to check login status for ${ota.name}: ${error.message}`);
        } finally {
          await page.close();
        }
      }
      systemStatus.otaStatuses = otaStatuses;

      // 브라우저 종료
      await browser.disconnect();
    } catch (error) {
      logger.error(`Failed to connect to debugging Chrome: ${error.message}`);
      systemStatus.debuggerTabs = [];
      systemStatus.otaStatuses = {};
    }

    res.status(200).json(systemStatus);
  } catch (error) {
    logger.error(`Error in getStatus: ${error.message}`);
    res.status(500).send({ message: 'Server error' });
  }
};

// 디버깅 크롬 상태 확인 함수
export const getDebuggerStatus = async (req, res) => {
  try {
    // 여기에 디버깅 크롬 상태를 확인하는 로직을 추가하세요.
    const status = { debuggerStatus: 'OK' };
    res.status(200).json(status);
  } catch (error) {
    logger.error(`Error in getDebuggerStatus: ${error.message}`);
    res.status(500).send({ message: 'Server error' });
  }
};

// OTA 로그인 상태 확인 함수
export const getOTAStatus = async (req, res) => {
  try {
    // 여기에 OTA 로그인 상태를 확인하는 로직을 추가하세요.
    const otaStatus = { OTA1: 'active', OTA2: 'inactive' };
    res.status(200).json(otaStatus);
  } catch (error) {
    logger.error(`Error in getOTAStatus: ${error.message}`);
    res.status(500).send({ message: 'Server error' });
  }
};