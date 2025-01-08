// backend/scrapers/browserConnection.js
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';
import logger from '../utils/logger.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

// Stealth Plugin 사용하여 헤드리스 탐지 우회
puppeteer.use(StealthPlugin());

/**
 * 기존에 실행 중인 Chrome 인스턴스에 연결하거나, 없을 경우 자동으로 시작.
 * 모든 스크래핑은 기존에 열려 있는 세션을 기반으로 작동.
 * @returns {Browser} Puppeteer Browser 인스턴스
 */
const connectToChrome = async () => {
  try {
    // 현재 파일의 디렉토리 경로 계산
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // .env 파일에서 사용자 데이터 디렉토리 가져오기
    const userDataDir =
      process.env.CHROME_USER_DATA_DIR ||
      path.resolve(__dirname, '../chrome_dev_test');

    // 이미 실행 중인 Chrome 인스턴스에 연결 시도
    const response = await axios.get('http://127.0.0.1:9223/json/version', {
      timeout: 5000,
    });
    const { webSocketDebuggerUrl } = response.data;

    const browser = await puppeteer.connect({
      browserWSEndpoint: webSocketDebuggerUrl,
    });
    logger.info('Successfully connected to existing Chrome instance');
    return browser;
  } catch (error) {
    logger.warn(
      'Failed to connect to existing Chrome instance:',
      error.message
    );
    logger.info(
      'Attempting to start a new headless Chrome instance with remote debugging'
    );

    try {
      // 현재 파일의 디렉토리 경로 계산
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);

      // .env 파일에서 사용자 데이터 디렉토리 가져오기
      const userDataDir =
        process.env.CHROME_USER_DATA_DIR ||
        path.resolve(__dirname, '../chrome_dev_test');

      // Chrome 실행 경로 설정 (운영체제에 맞게 수정 필요)
      let chromePath;
      if (process.platform === 'win32') {
        chromePath =
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      } else if (process.platform === 'darwin') {
        chromePath =
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      } else {
        chromePath = '/usr/bin/google-chrome';
      }

      // Chrome이 존재하는지 확인
      try {
        await fs.access(chromePath);
      } catch (err) {
        logger.error(
          'Google Chrome executable not found. Please ensure Chrome is installed.'
        );
        throw err;
      }

      // 새 Chrome 인스턴스 시작 (헤드리스 모드)
      const chromeProcess = spawn(
        chromePath,
        [
          // '--headless', // 헤드리스 모드
          '--remote-debugging-port=9223',
          `--user-data-dir=${userDataDir}`,
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-extensions', // 확장 프로그램 비활성화
          '--disable-gpu', // GPU 사용 안함
          '--window-size=2080,1680', // 창 크기 설정
        ],
        {
          detached: true,
          stdio: 'ignore',
        }
      );

      chromeProcess.unref();

      // Chrome이 시작될 시간을 기다림
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Chrome did not start within expected time'));
        }, 10000); // 10초 대기

        // Chrome이 시작되면 연결 시도
        const attemptConnect = async () => {
          try {
            const response = await axios.get(
              'http://127.0.0.1:9223/json/version',
              { timeout: 5000 }
            );
            clearTimeout(timeout);
            resolve(true);
          } catch (err) {
            setTimeout(attemptConnect, 500); // 0.5초 후 재시도
          }
        };

        attemptConnect();
      });

      // 다시 연결 시도
      const response = await axios.get('http://127.0.0.1:9223/json/version', {
        timeout: 5000,
      });
      const { webSocketDebuggerUrl } = response.data;

      const browser = await puppeteer.connect({
        browserWSEndpoint: webSocketDebuggerUrl,
      });
      logger.info(
        'Successfully started and connected to new headless Chrome instance'
      );
      return browser;
    } catch (err) {
      logger.error(
        'Failed to start and connect to Chrome instance:',
        err.message
      );
      throw err;
    }
  }
};

export default connectToChrome;
