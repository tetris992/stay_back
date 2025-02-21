// backend/server.js

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import csurf from 'csurf';
import path from 'path';
import fs from 'fs';
import logger from './utils/logger.js';
import connectDB from './config/db.js';
import reservationsRoutes from './routes/reservations.js';
import hotelSettingsRoutes from './routes/hotelSettings.js';
import statusRoutes from './routes/status.js';
import authRoutes from './routes/auth.js';
import chromeRoutes from './routes/chrome.js';
import scraperTasksRoutes from './routes/scraperTasks.js';
import scraperManager from './scrapers/scraperManager.js';
import ensureConsent from './middleware/consentMiddleware.js';

// === [ADD] 인증 미들웨어 임포트 ===
import { protect } from './middleware/authMiddleware.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// 개발/프로덕션 환경별 .env 파일 로드
if (process.env.NODE_ENV === 'development') {
  dotenv.config({ path: '.env.development' });
} else {
  dotenv.config({ path: '.env' });
}

console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);

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
  //아래 OTA 지우면 안됨(크롬 확장용)
  'https://staysync.me',
  'https://pms.coolstay.co.kr',
  'https://admin.booking.com',
  'https://ad.goodchoice.kr',
  'https://partner.goodchoice.kr',
  'https://partner.yanolja.com',
  'https://expediapartnercentral.com/',
  'https://apps.expediapartnercentral.com',
  'https://ycs.agoda.com',
  'http://localhost:3000',
  'chrome-extension://cnoicicjafgmfcnjclhlehfpojfaelag',
];
if (process.env.CORS_ORIGIN) {
  allowedOrigins = process.env.CORS_ORIGIN.split(',');
}

// CORS 설정
app.use(
  cors({
    origin: allowedOrigins,
    methods: [
      'GET',
      'POST',
      'PATCH',
      'DELETE',
      'PUT',
      'OPTIONS',
      'HEAD',
      'CONNECT',
      'TRACE',
    ],
    credentials: true,
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Refresh-Token',
      'CSRF-Token', // CSRF-Token 헤더 추가
    ],
  })
);

app.use(cookieParser());
app.use(express.json());

// CSRF 방지 미들웨어 설정
const csrfProtection = csurf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS 환경에서는 true로 설정
    sameSite: 'none',
  },
});

// CSRF 토큰을 클라이언트에 전달하기 위한 라우트 (CSRF 보호 적용)
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// CSRF 보호 미들웨어 적용 (특정 라우트 제외)
const csrfExcludedRoutes = [
  /^\/auth\/login$/,
  /^\/login\//,
  /^\/auth\/logout$/,
  /^\/logout\//,
  /^\/auth\/register$/,
  /^\/register\//,
  /^\/auth\/refresh-token$/,
  /^\/reservations$/,
  /^\/reservations\//,
  /^\/hotel-settings$/,
  /^\/hotel-settings\//,
  /^\/auth\/refresh-token$/,
  /^\/auth\/reset-password\/.+$/,
  /^\/csrf-token$/,
];

// 모든 라우트에 CSRF 보호 미들웨어 적용 (제외된 라우트는 제외)
app.use((req, res, next) => {
  const isExcluded = csrfExcludedRoutes.some((pattern) =>
    pattern.test(req.path)
  );
  if (isExcluded) {
    return next();
  } else {
    return csrfProtection(req, res, next);
  }
});

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true, // RateLimit 관련 헤더 추가
    legacyHeaders: false, // X-RateLimit-* 헤더 비활성화
    handler: (req, res) => {
      res.status(429).json({
        message: 'You have exceeded the 500 requests in 15 minutes limit!',
      });
    },
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
    process.env.NODE_ENV === 'development'
      ? err.message
      : 'Internal Server Error';

  // CSRF 오류 처리
  if (err.code === 'EBADCSRFTOKEN') {
    message = 'Form tampered with.';
    return res.status(403).json({ message });
  }

  const response = {
    message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
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
  // 로그 디렉토리 확인 및 생성
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
    logger.info('Logs directory created.');
  }

  const server = app.listen(process.env.PORT || 3003, () => {
    logger.info(`Server started on port ${process.env.PORT || 3003}`);
    console.log(`Server started on port ${process.env.PORT || 3003}`);
  });

  // Graceful Shutdown 설정
  const gracefulShutdown = async () => {
    logger.info('Gracefully shutting down scraper queue and server...');
    try {
      await scraperManager.gracefulShutdown();
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

export default app;
