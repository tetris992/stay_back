import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import logger from './utils/logger.js';
import connectDB from './config/db.js';
import reservationsRoutes from './routes/reservations.js';
import hotelSettingsRoutes from './routes/hotelSettings.js';
import dayUseReservationsRoutes from './routes/dayUseReservations.js';
import authRoutes from './routes/auth.js';
import customerRoutes from './routes/customer.js';
import ensureConsent from './middleware/consentMiddleware.js';
import { protect } from './middleware/authMiddleware.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import reservationsExtensionRoutes from './routes/reservationsExtension.js';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import Customer from './models/Customer.js';
import hotelPhotosRoutes from './routes/hotelPhotos.js';
import { randomBytes } from 'crypto';

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

const csrfTokens = new Map(); // CSRF 토큰 저장소

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
        'http://localhost:3001',
        'http://localhost:3004',
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
        'chrome-extension://gplklapgkbfogdohhjcidcdkbdaolbib',
        'chrome-extension://cnoicicjafgmfcnjclhlehfpojfaelag',
        'https://danjam.in',
        'https://www.danjam.in',
      ];
console.log('Final CORS_ORIGIN:', allowedOrigins);

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
      'X-CSRF-Token',
      'X-CSRF-Token-Id',
      'Refresh-Token',
    ],
  })
);

// 프리플라이트 요청 직접 처리
app.options(
  '*',
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
      'X-CSRF-Token-Id',
      'Refresh-Token',
    ],
  })
);

app.use(cookieParser());
app.use(express.json());

// 요청 로깅 추가
app.use((req, res, next) => {
  logger.info(`Request: ${req.method} ${req.url}`, {
    headers: req.headers,
    userAgent: req.headers['user-agent'],
    origin: req.headers.origin,
  });
  next();
});

// CSRF 토큰 생성 엔드포인트
app.get('/api/csrf-token', async (req, res) => {
  try {
    const csrfToken = randomBytes(32).toString('hex');
    const tokenId = randomBytes(16).toString('hex');
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24시간 유효

    csrfTokens.set(tokenId, { token: csrfToken, expiresAt });

    logger.info(`CSRF token generated: ${csrfToken}`, {
      tokenId,
      origin: req.headers.origin,
      userAgent: req.headers['user-agent'],
      headers: req.headers,
    });
    res.json({ tokenId, csrfToken });
  } catch (error) {
    logger.error(`CSRF token generation failed: ${error.message}`, {
      stack: error.stack,
      headers: req.headers,
      ip: req.ip,
    });
    res
      .status(500)
      .json({ message: 'Failed to generate CSRF token', error: error.message });
  }
});

// 수동 CSRF 검증 미들웨어
const verifyCsrfToken = async (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next(); // GET, HEAD, OPTIONS 요청은 CSRF 검증 제외
  }

  const tokenId = req.headers['x-csrf-token-id'];
  const csrfToken = req.headers['x-csrf-token'];

  if (!tokenId || !csrfToken) {
    logger.warn('CSRF token missing in request', {
      method: req.method,
      url: req.url,
      headers: req.headers,
    });
    return res.status(403).json({ message: 'CSRF token missing' });
  }

  try {
    const storedData = csrfTokens.get(tokenId);

    if (!storedData) {
      logger.warn('CSRF token not found', {
        tokenId,
        providedToken: csrfToken,
        method: req.method,
        url: req.url,
      });
      return res.status(403).json({ message: 'Invalid or expired CSRF token' });
    }

    const { token, expiresAt } = storedData;
    if (token !== csrfToken || expiresAt < Date.now()) {
      logger.warn('Invalid or expired CSRF token', {
        tokenId,
        providedToken: csrfToken,
        method: req.method,
        url: req.url,
      });
      return res.status(403).json({ message: 'Invalid or expired CSRF token' });
    }

    next();
  } catch (error) {
    logger.error(`CSRF token verification failed: ${error.message}`, {
      stack: error.stack,
      headers: req.headers,
      ip: req.ip,
    });
    res
      .status(500)
      .json({ message: 'Failed to verify CSRF token', error: error.message });
  }
};

// CSRF 검증 미들웨어 적용 (특정 라우트에만 적용)
app.use(
  '/api/reservations',
  protect,
  ensureConsent,
  verifyCsrfToken,
  reservationsRoutes
);
app.use(
  '/api/dayuse',
  protect,
  ensureConsent,
  verifyCsrfToken,
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
  verifyCsrfToken,
  hotelSettingsRoutes
);

app.use('/api/customer', verifyCsrfToken, customerRoutes);

app.use(
  '/api/hotel-settings/photos',
  protect,
  ensureConsent,
  verifyCsrfToken,
  hotelPhotosRoutes
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

  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          logger.warn(`WebSocket CORS rejected: ${origin}`);
          callback(new Error('Not allowed by CORS'));
        }
      },
      methods: ['GET', 'POST'],
      credentials: true,
      allowedHeaders: [
        'Authorization',
        'Content-Type',
        'X-CSRF-Token',
        'X-CSRF-Token-Id',
        'Refresh-Token',
      ],
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  io.use(async (socket, next) => {
    const { hotelId, accessToken, customerToken } = socket.handshake.query;

    if (customerToken) {
      try {
        const decoded = jwt.verify(customerToken, process.env.JWT_SECRET);
        logger.info(`Decoded JWT: ${JSON.stringify(decoded)}`);
        const customer = await Customer.findById(decoded.id);
        if (!customer) {
          logger.warn(
            `Customer not found for id: ${decoded.id}, client: ${socket.id}`
          );
          return next(new Error('Authentication error: Customer not found'));
        }
        socket.customer = customer;
        socket.type = 'customer';
        logger.info(
          `Authenticated WebSocket customer: ${socket.id}, customerId: ${customer._id}`
        );
        return next();
      } catch (error) {
        logger.error(
          `Invalid customer token for client ${socket.id}: ${error.message}`,
          { error, customerToken }
        );
        return next(new Error('Authentication error: Invalid customer token'));
      }
    }

    if (hotelId && accessToken) {
      try {
        const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
        logger.info(`Decoded JWT: ${JSON.stringify(decoded)}`);
        socket.user = decoded;
        socket.type = 'hotel';
        logger.info(
          `Authenticated WebSocket client: ${socket.id}, userId: ${decoded.id}`
        );
        return next();
      } catch (error) {
        logger.error(
          `Invalid access token for client ${socket.id}: ${error.message}`,
          { error, accessToken }
        );
        return next(new Error('Authentication error: Invalid access token'));
      }
    }

    logger.warn(
      'Missing hotelId/accessToken or customerToken, disconnecting client:',
      socket.id
    );
    return next(
      new Error(
        'Authentication error: Missing hotelId/accessToken or customerToken'
      )
    );
  });

  io.on('connection', (socket) => {
    const { hotelId } = socket.handshake.query;
    logger.info(
      `New client connected: ${socket.id}, type: ${socket.type}, hotelId: ${hotelId}`
    );

    if (hotelId) {
      socket.join(hotelId);
      logger.info(`Client ${socket.id} joined hotel room: ${hotelId}`);
    }

    socket.on('joinHotel', (hotelId) => {
      socket.join(hotelId);
      logger.info(`Client ${socket.id} joined hotel room: ${hotelId}`);
    });

    if (socket.type === 'customer') {
      socket.on('subscribeToReservationUpdates', (customerId) => {
        socket.join(`customer_${customerId}`);
        logger.info(
          `Client ${socket.id} subscribed to reservation updates for customer: ${customerId}`
        );
      });
    }

    socket.on('createReservation', async (reservationData) => {
      socket.emit('error', {
        message: 'Use HTTP endpoint to create reservations',
      });
    });

    socket.on('updateReservation', async ({ reservationId, updatedData }) => {
      socket.emit('error', {
        message: 'Use HTTP endpoint to update reservations',
      });
    });

    socket.on('deleteReservation', async (reservationId) => {
      socket.emit('error', {
        message: 'Use HTTP endpoint to delete reservations',
      });
    });

    socket.on('connect_error', (error) => {
      logger.error(`WebSocket connect error: ${error.message}`, {
        stack: error.stack,
        socketId: socket.id,
      });
    });

    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
    });
  });

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
