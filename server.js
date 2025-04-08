// backend/app.js
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
import { randomBytes } from 'crypto';
import mongoose from 'mongoose';
import multer from 'multer';
import {
  verifyCsrfToken,
  generateCsrfToken,
} from './middleware/csrfMiddleware.js';

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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ALLOWED_FORMATS = ['image/jpeg', 'image/png', 'image/webp'];
    if (!ALLOWED_FORMATS.includes(file.mimetype)) {
      return cb(new Error('허용된 파일 형식: JPEG, PNG, WebP'));
    }
    cb(null, true);
  },
});

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

app.use((req, res, next) => {
  logger.info(`Request: ${req.method} ${req.url}`, {
    headers: req.headers,
    userAgent: req.headers['user-agent'],
    origin: req.headers.origin,
  });
  next();
});

app.get('/api/csrf-token', async (req, res) => {
  try {
    const { tokenId, csrfToken } = generateCsrfToken();
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

// GET 요청에 대해 CSRF 검증 제외
app.use(
  '/api/customer',
  (req, res, next) => {
    if (req.method === 'GET') {
      return next();
    }
    return verifyCsrfToken(req, res, next);
  },
  customerRoutes
);

app.use('/api/hotel-settings', upload.array('photo', 10), hotelSettingsRoutes);

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
  if (err instanceof multer.MulterError) {
    logger.error(`Multer error: ${err.message}`, err);
    return res
      .status(400)
      .json({ message: '파일 업로드 오류', error: err.message });
  }
  logger.error(`Unhandled Error: ${err.message}`, err);
  const statusCode = err.statusCode || 500;
  const message =
    NODE_ENV === 'development' ? err.message : 'Internal Server Error';
  res.status(statusCode).json({
    message,
    stack: NODE_ENV === 'development' ? err.stack : undefined,
  });
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
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  io.use(async (socket, next) => {
    const { hotelId, accessToken, customerToken } = socket.handshake.query;

    if (accessToken || customerToken) {
      try {
        const token = accessToken || customerToken;
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        logger.info(`Decoded JWT: ${JSON.stringify(decoded)}`);

        if (decoded.hotelId) {
          const user = await User.findOne({ hotelId: decoded.hotelId });
          if (!user) {
            logger.warn(
              `User not found for hotelId: ${decoded.hotelId}, client: ${socket.id}`
            );
            return next(new Error('Authentication error: User not found'));
          }
          socket.user = user;
          socket.type = 'hotel';
          logger.info(
            `Authenticated WebSocket client: ${socket.id}, userId: ${user._id}`
          );
        } else if (decoded.id) {
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
        } else {
          logger.warn('Invalid token structure');
          return next(
            new Error('Authentication error: Invalid token structure')
          );
        }
        return next();
      } catch (error) {
        logger.error(
          `Invalid token for client ${socket.id}: ${error.message}`,
          { error, token }
        );
        return next(new Error('Authentication error: Invalid token'));
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
    mongoose.connection.close(() => {
      logger.info('MongoDB connection closed.');
      server.close(() => {
        logger.info('Server closed.');
        process.exit(0);
      });
    });
  });

  process.on('SIGTERM', () => {
    logger.info('Gracefully shutting down server...');
    mongoose.connection.close(() => {
      logger.info('MongoDB connection closed.');
      server.close(() => {
        logger.info('Server closed.');
        process.exit(0);
      });
    });
  });
};

if (NODE_ENV !== 'test') {
  startServer();
}

export default app;
