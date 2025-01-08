// backend/utils/logger.js

import { createLogger, format, transports } from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// 현재 파일의 디렉토리 경로 계산
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 로그 디렉토리가 존재하지 않으면 생성
const logDir = path.resolve(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// 로거 생성
const logger = createLogger({
  level: 'debug', // 개발모드 로깅 레벨
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  transports: [
    // 파일에 모든 로그 저장
    new transports.File({ filename: `${logDir}/error.log`, level: 'error' }),
    new transports.File({ filename: `${logDir}/combined.log` }),
  ],
});

// 개발 환경에서는 콘솔에도 로그 출력
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new transports.Console({
      format: format.combine(format.colorize(), format.simple()),
    })
  );
}

export default logger;
