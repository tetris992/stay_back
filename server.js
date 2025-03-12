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
import dayUseReservationsRoutes from './routes/dayUseReservations.js';
import authRoutes from './routes/auth.js';
import ensureConsent from './middleware/consentMiddleware.js';
import { protect } from './middleware/authMiddleware.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import reservationsExtensionRoutes from './routes/reservationsExtension.js';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken'; // JWT 검증 추가

dotenv.config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = process.env.PORT || 3003;

console.log('Loaded NODE_ENV:', NODE_ENV);
console.log('PORT from .env:', process.env.PORT || PORT);
console.log(
  'EXTENSION_ID:',
  process.env.EXTENSION_ID || 'Default Extension ID'
);
console.log('CORS_ORIGIN from .env:', process.env.CORS_ORIGIN);

const app = express();

app.use(helmet());
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const corsOriginsFromEnv = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : [];
const allowedOrigins =
  corsOriginsFromEnv.length > 0
    ? corsOriginsFromEnv
    : [
        'https://staysync.me',
        'http://localhost:3000',
        'http://localhost:3003',
        'https://tetris992.github.io',
        'https://pms.coolstay.co.kr',
        'https://admin.booking.com',
        'https://ad.goodchoice.kr',
        'https://partner.goodchoice.kr',
        'https://partner.yanolja.com',
        'https://expediapartnercentral.com',
        'https://apps.expediapartnercentral.com',
        'https://ycs.agoda.com',
        'https://staysync.org',
        'chrome-extension://bhfggeheelkddgmlegkppgpkmioldfkl',
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

const csrfProtection = csurf({
  cookie: {
    key: '_csrf',
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
  },
  value: (req) => req.headers['x-csrf-token'] || req.body.csrfToken,
});

app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

app.use(
  '/api/reservations',
  protect,
  ensureConsent,
  csrfProtection,
  reservationsRoutes
);

app.use(
  '/api/dayuse', // 대실 예약 라우트 추가
  protect,
  ensureConsent,
  csrfProtection,
  dayUseReservationsRoutes
);

app.use(
  '/api/reservations-extension',
  protect,
  ensureConsent,
  reservationsExtensionRoutes
);
app.use('/api/auth', authRoutes);

app.use(
  '/api/hotel-settings',
  protect,
  ensureConsent,
  csrfProtection,
  hotelSettingsRoutes
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).json({
        message: 'You have exceeded the 1000 requests in 15 minutes limit!',
      }),
  })
);

connectDB();

app.get('/', (req, res) => {
  res.status(200).send('OK - HMS Backend is running');
});

app.use((err, req, res, next) => {
  logger.error(`Unhandled Error: ${err.message}`, err);
  const statusCode = err.statusCode || 500;
  let message =
    NODE_ENV === 'development' ? err.message : 'Internal Server Error';

  if (err.code === 'EBADCSRFTOKEN') {
    message = 'Invalid CSRF token. Please include a valid token.';
    return res
      .status(403)
      .json({ message, csrfToken: req.csrfToken ? req.csrfToken() : null });
  }

  const response = {
    message,
    stack: NODE_ENV === 'development' ? err.stack : undefined,
  };
  res.status(statusCode).json(response);
});

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

  // WebSocket 설정
  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // WebSocket 인증 로직 (protect 미들웨어 재사용)
  io.use(async (socket, next) => {
    const { hotelId, accessToken } = socket.handshake.query;
    if (!hotelId || !accessToken) {
      logger.warn(
        'Missing hotelId or accessToken, disconnecting client:',
        socket.id
      );
      return next(
        new Error('Authentication error: Missing hotelId or accessToken')
      );
    }

    try {
      // JWT 토큰 검증
      const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
      socket.user = decoded; // 사용자 정보 저장
      logger.info(
        `Authenticated WebSocket client: ${socket.id}, userId: ${decoded.id}`
      );
      next();
    } catch (error) {
      logger.warn(
        `Invalid access token for client ${socket.id}: ${error.message}`
      );
      return next(new Error('Authentication error: Invalid access token'));
    }
  });

  io.on('connection', (socket) => {
    const { hotelId } = socket.handshake.query;
    logger.info(`New client connected: ${socket.id}, hotelId: ${hotelId}`);

    // 호텔 방에 조인
    socket.join(hotelId);
    logger.info(`Client ${socket.id} joined hotel room: ${hotelId}`);

    socket.on('joinHotel', (hotelId) => {
      socket.join(hotelId);
      logger.info(`Client ${socket.id} joined hotel room: ${hotelId}`);
    });

    // 예약 생성 이벤트 (직접 처리 제거, 컨트롤러에서 처리됨)
    socket.on('createReservation', async (reservationData) => {
      socket.emit('error', {
        message: 'Use HTTP endpoint to create reservations',
      });
    });

    // 예약 업데이트 이벤트 (직접 처리 제거, 컨트롤러에서 처리됨)
    socket.on('updateReservation', async ({ reservationId, updatedData }) => {
      socket.emit('error', {
        message: 'Use HTTP endpoint to update reservations',
      });
    });

    // 예약 삭제 이벤트 (직접 처리 제거, 컨트롤러에서 처리됨)
    socket.on('deleteReservation', async (reservationId) => {
      socket.emit('error', {
        message: 'Use HTTP endpoint to delete reservations',
      });
    });

    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
    });
  });

  // io 객체를 app에 저장하여 라우터에서 접근 가능하도록 설정
  app.set('io', io);

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
