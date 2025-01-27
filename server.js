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
import csurf from 'csurf'; // CSRF 방지 미들웨어
import path from 'path';
import fs from 'fs';
import logger from './utils/logger.js';
import connectDB from './config/db.js';
import reservationsRoutes from './routes/reservations.js';
import hotelSettingsRoutes from './routes/hotelSettings.js';
import statusRoutes from './routes/status.js'; // 추가된 상태 관련 라우트
import authRoutes from './routes/auth.js';
import chromeRoutes from './routes/chrome.js';
import scraperTasksRoutes from './routes/scraperTasks.js'; // ScraperTasks 라우트 추가
import scraperManager from './scrapers/scraperManager.js'; // ScraperManager 임포트
import ensureConsent from './middleware/consentMiddleware.js';

// === [ADD] 인증 미들웨어 임포트 ===
import { protect } from './middleware/authMiddleware.js'; // 수정된 부분

import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

// Express 앱 초기화
const app = express();

// 보안 강화 미들웨어
app.use(helmet());
// app.use(morgan('combined'));
app.use(mongoSanitize()); // NoSQL 인젝션 방지
app.use(xss()); // XSS 방지
app.use(hpp()); // HTTP 파라미터 필터링

// __filename, __dirname 재정의
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// CORS_ORIGIN 환경변수가 비어있는 경우를 대비해 처리
let allowedOrigins = [
  'https://tetris992.github.io',
  'https://pms.coolstay.co.kr',
  'https://admin.booking.com',
  'https://ad.goodchoice.kr',
  'https://partner.goodchoice.kr',
  'https://partner.yanolja.com',
  'https://expediapartnercentral.com/',
  'https://apps.expediapartnercentral.com',
  'https://ycs.agoda.com',
  'http://localhost:3000', // 개발용 react 서버 주소 배포 후 실제 프런트엔드 도메인주소를 넣어야 함
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
    origin: allowedOrigins, // 수정된 부분: allowedOrigins 사용
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true,
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Refresh-Token',
      'CSRF-Token', // CSRF-Token 헤더 추가
    ],
  })
);

// 쿠키 파서 미들웨어 추가
app.use(cookieParser());

// JSON 파싱 미들웨어
app.use(express.json());

// CSRF 방지 미들웨어 설정
const csrfProtection = csurf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS 환경에서는 true로 설정
    sameSite: 'none', // SameSite 설정
  },
});

// CSRF 토큰을 클라이언트에 전달하기 위한 라우트 (CSRF 보호 적용)
app.get('/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// CSRF 보호 미들웨어 적용 (특정 라우트 제외)
const csrfExcludedRoutes = [
  /^\/auth\/login$/,
  /^\/auth\/register$/,
  /^\/auth\/refresh-token$/,
  /^\/auth\/reset-password-request$/,
  /^\/auth\/reset-password\/.+$/,
  /^\/csrf-token$/, // 이미 CSRF 보호된 라우트
];

// 모든 라우트에 CSRF 보호 미들웨어 적용 (제외된 라우트는 제외)
app.use((req, res, next) => {
  const isExcluded = csrfExcludedRoutes.some((pattern) => pattern.test(req.path));
  if (isExcluded) {
    return next();
  } else {
    return csrfProtection(req, res, next);
  }
});

// 요청 속도 제한 설정
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 1000, // IP당 최대 요청 수
    message: 'Too many requests from this IP, please try again later.',
  })
);

// MongoDB 연결
connectDB();

// Root route
app.get('/', (req, res) => {
  res.status(200).send('OK - HMS Backend is running');
});

// 라우트 설정
app.use('/auth', authRoutes); // 인증 라우트 (로그인, 회원가입, 비밀번호 재설정 등)

// === [MODIFIED] 인증 및 개인정보 동의 확인 미들웨어 적용 ===
// /reservations 및 /hotel-settings 라우트에 protect 미들웨어를 먼저 적용한 후, ensureConsent 미들웨어를 적용합니다.
app.use('/reservations', protect, ensureConsent, reservationsRoutes); // 수정된 부분
app.use('/hotel-settings', protect, ensureConsent, hotelSettingsRoutes); // 수정된 부분

app.use('/status', statusRoutes);
app.use('/chrome', chromeRoutes);
app.use('/api/scrape', scraperTasksRoutes);
// app.use('/memo', memoRoutes);
// app.use('/api', saveCookiesRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`Unhandled Error: ${err.message}`, err);
  const statusCode = err.statusCode || 500;
  let message =
    process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error';

  // CSRF 오류 처리
  if (err.code === 'EBADCSRFTOKEN') {
    message = 'Form tampered with.';
    return res.status(403).json({ message });
  }

  const response = {
    message,
  };

  // CSRF 토큰이 있는 경우 추가
  if (typeof req.csrfToken === 'function') {
    try {
      response.csrfToken = req.csrfToken();
    } catch (e) {
      // CSRF 토큰을 가져오는 데 실패하면 무시
      logger.error('Failed to retrieve CSRF token during error handling:', e);
    }
  }

  res.status(statusCode).json(response);
});

// 서버 시작 및 전역 설정
const startServer = async () => {
  // ScraperManager 초기화
  // await initializeScraper();

  // 로그 디렉토리 확인 및 생성
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
    logger.info('Logs directory created.');
  }

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
