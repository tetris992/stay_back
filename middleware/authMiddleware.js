// backend/middleware/authMiddleware.js

import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * 인증 미들웨어
 * - Authorization 헤더에서 Bearer 토큰을 추출
 * - 토큰을 검증하고, 유효한 경우 req.user에 사용자 정보 설정
 * - 토큰이 없거나 유효하지 않은 경우 401 Unauthorized 응답 반환
 */
export const protect = async (req, res, next) => {
  let token;

  // Authorization 헤더에서 토큰 추출
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];

      // 토큰 검증
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // hotelId로 사용자 찾기
      req.user = await User.findOne({ hotelId: decoded.hotelId }).select('-password');
      req.hotelId = decoded.hotelId; // JWT에서 hotelId 설정

      if (!req.user) {
        logger.warn(`User not found for hotelId: ${decoded.hotelId}`);
        return res.status(401).json({ message: 'Unauthorized, user not found' });
      }

      next();
    } catch (error) {
      logger.error(`Auth error: ${error.message}`);
      res.status(401).json({ message: 'Unauthorized, token failed' });
    }
  } else {
    logger.warn('No token provided in Authorization header');
    res.status(401).json({ message: 'Unauthorized, no token' });
  }
};


