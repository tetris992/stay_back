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
import authRoutes from './routes/auth.js';
import ensureConsent from './middleware/consentMiddleware.js';
import { protect } from './middleware/authMiddleware.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// 1) .env 파일 로딩
dotenv.config();

// 2) NODE_ENV, PORT 등 환경변수를 변수에 할당
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = process.env.PORT || 3004; // 기본값 3004 (개발용)

// 디버그용 콘솔 출력
console.log('Loaded NODE_ENV:', NODE_ENV);
console.log('PORT from .env:', process.env.PORT || PORT);
console.log(
  'EXTENSION_ID:',
  process.env.EXTENSION_ID || 'Default Extension ID'
);
console.log('CORS_ORIGIN from .env:', process.env.CORS_ORIGIN);

// 3) Express 앱 초기화
const app = express();

// 4) 보안 강화 미들웨어
app.use(helmet());
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

// __filename, __dirname 재정의
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 5) CORS 설정
const corsOriginsFromEnv = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : [];
const allowedOrigins =
  corsOriginsFromEnv.length > 0
    ? corsOriginsFromEnv
    : [
        'https://staysync.me',
        'https://tetris992.github.io',
        'https://pms.coolstay.co.kr',
        'https://admin.booking.com',
        'https://ad.goodchoice.kr',
        'https://partner.goodchoice.kr',
        'https://partner.yanolja.com',
        'https://expediapartnercentral.com',
        'https://apps.expediapartnercentral.com',
        'https://ycs.agoda.com',
        'http://localhost:3000',
        'chrome-extension://cnoicicjafgmfcnjclhlehfpojfaelag',
      ];
console.log('Final CORS_ORIGIN:', allowedOrigins);

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
      'X-CSRF-Token',
      'Refresh-Token',
    ],
  })
);

app.use(cookieParser());
app.use(express.json());

// 6) CSRF 방지 미들웨어
const csrfProtection = csurf({
  cookie: {
    key: '_csrf',
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
  },
  value: (req) => req.headers['x-csrf-token'] || req.body.csrfToken,
});

// CSRF 토큰 발급 라우트
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

app.use(csrfProtection);

// 7) 요청 제한 (Rate Limiter)
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 1000,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        message: 'You have exceeded the 1000 requests in 15 minutes limit!',
      });
    },
  })
);

// 8) MongoDB 연결
connectDB();

// 9) 루트 라우트
app.get('/', (req, res) => {
  res.status(200).send('OK - HMS Backend is running');
});

// 10) API 라우트 설정
app.use('/api/auth', authRoutes);
app.use('/api/reservations', protect, ensureConsent, reservationsRoutes);
app.use('/api/hotel-settings', protect, ensureConsent, hotelSettingsRoutes);

// 11) 에러 처리 미들웨어
app.use((err, req, res, next) => {
  logger.error(`Unhandled Error: ${err.message}`, err);
  const statusCode = err.statusCode || 500;
  let message =
    NODE_ENV === 'development' ? err.message : 'Internal Server Error';

  if (err.code === 'EBADCSRFTOKEN') {
    message = 'Invalid CSRF token. Please include a valid token.';
    return res.status(403).json({
      message,
      csrfToken: req.csrfToken ? req.csrfToken() : null,
    });
  }

  const response = {
    message,
    stack: NODE_ENV === 'development' ? err.stack : undefined,
  };

  res.status(statusCode).json(response);
});

// 12) 서버 시작 함수
const startServer = async () => {
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
    logger.info('Logs directory created.');
  }

  const server = app.listen(PORT, () => {
    logger.info(`Server started on port ${PORT} in ${NODE_ENV} mode`);
    console.log(`Server started on port ${PORT} in ${NODE_ENV} mode`);
  });

  process.on('SIGINT', () => {
    logger.info('Gracefully shutting down server...');
    server.close(() => {
      logger.info('Server closed.');
      process.exit(0);
    });
  });
  process.on('SIGTERM', () => {
    logger.info('Gracefully shutting down server...');
    server.close(() => {
      logger.info('Server closed.');
      process.exit(0);
    });
  });
};

if (NODE_ENV !== 'test') {
  startServer();
}

export default app;
