// backend/server.js

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet'; // 보안 강화 미들웨어
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit'; // 요청 속도 제한 미들웨어
import cookieParser from 'cookie-parser'; // 쿠키 파서 미들웨어 추가
// import morgan from 'morgan';
import logger from './utils/logger.js';
import connectDB from './config/db.js';
import reservationsRoutes from './routes/reservations.js';
import hotelSettingsRoutes from './routes/hotelSettings.js';
import statusRoutes from './routes/status.js'; // 추가된 상태 관련 라우트
import authRoutes from './routes/auth.js';
import chromeRoutes from './routes/chrome.js';
import scraperTasksRoutes from './routes/scraperTasks.js'; // ScraperTasks 라우트 추가
import scraperManager from './scrapers/scraperManager.js'; // ScraperManager 임포트
// import saveCookiesRoutes from './routes/saveCookies.js';

dotenv.config();

// Express 앱 초기화
const app = express();

// 보안 강화 미들웨어
app.use(helmet());
// app.use(morgan('combined'));
app.use(mongoSanitize()); // NoSQL 인젝션 방지
app.use(xss()); // XSS 방지
app.use(hpp()); // HTTP 파라미터 폴터링

// CORS_ORIGIN 환경변수가 비어있는 경우를 대비해 처리
let allowedOrigins = [
  'https://tetris992.github.io',
  'https://ad.goodchoice.kr',
  'https://partner.goodchoice.kr',
  'https://partner.yanolja.com',
  'https://ycs.agoda.com',
  'http://localhost:3000', //개발용 react 서버 주소 배포후 실제 프런트엔드 도메인주소를 넣어야 함?
  'https://container-service-1.302qcbg9eaynw.ap-northeast-2.cs.amazonlightsail.com',
  'chrome-extension://bhfggeheelkddgmlegkppgpkmioldfkl',
];
if (process.env.CORS_ORIGIN) {
  // 쉼표로 구분된 여러 도메인을 환경변수에서 가져오기
  allowedOrigins = process.env.CORS_ORIGIN.split(',');
}

// CORS 설정
app.use(
  cors({
    origin: process.env.CORS_ORIGIN.split(','), // 허용 도메인 목록을 쉼표로 구분하여 설정
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'Refresh-Token'],
  })
);

// 쿠키 파서 미들웨어 추가
app.use(cookieParser());

// JSON 파싱 미들웨어
app.use(express.json());

// 요청 속도 제한 설정
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 1000, // IP당 최대 요청 수
  message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter); // 속도 제한 미들웨어 적용

// MongoDB 연결
connectDB();

app.get('/', (req, res) => {
  res.status(200).send('OK - HMS Backend is running');
});

// 라우트 설정 해당 경로에 라우트 마운트
app.use('/auth', authRoutes);
app.use('/reservations', reservationsRoutes);
app.use('/hotel-settings', hotelSettingsRoutes);
app.use('/status', statusRoutes);
app.use('/chrome', chromeRoutes);
app.use('/api/scrape', scraperTasksRoutes);
// app.use('/memo', memoRoutes);
// app.use('/api', saveCookiesRoutes);

// 오류 처리 미들웨어
app.use((err, req, res, next) => {
  logger.error(`Unhandled Error: ${err.message}`, err);
  const statusCode = err.statusCode || 500;
  const message =
    process.env.NODE_ENV === 'development'
      ? err.message
      : 'Internal Server Error';
  res.status(statusCode).json({ message });
});

// 서버 시작 및 전역 설정
const startServer = async () => {
  // ScraperManager 초기화
  // await initializeScraper();

  const PORT = process.env.PORT || 3003;
  const server = app.listen(PORT, () => {
    logger.info(`Server started on port ${PORT}`);
  });

  // Graceful Shutdown 설정
  const gracefulShutdown = async () => {
    logger.info('Gracefully shutting down scraper queue and server...');
    try {
      await scraperManager.gracefulShutdown(); // ScraperManager 작업 중지 및 브라우저 종료
      logger.info('ScraperManager stopped successfully.');
    } catch (error) {
      logger.error('Error during ScraperManager shutdown:', error);
    }

    server.close(() => {
      logger.info('Server closed.');
      process.exit(0);
    });
  };

  // 시그널 핸들링
  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
};

// 테스트 환경을 위한 서버 시작 조건 설정
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app; // 테스트를 위해 app을 export
