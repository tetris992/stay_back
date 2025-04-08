// backend/middleware/authMiddleware.js

import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Customer from '../models/Customer.js';
import logger from '../utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

export const protect = async (req, res, next) => {  // 호텔 관리자 인증 미들웨어
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      logger.info(`Decoded token in protect: ${JSON.stringify(decoded)}`);

      // hotelId가 있는 경우에만 User 조회
      if (!decoded.hotelId) {
        logger.warn('No hotelId in token, likely a customer token');
        return res
          .status(401)
          .json({ message: 'Unauthorized, invalid token for hotel admin' });
      }

      req.user = await User.findOne({ hotelId: decoded.hotelId }).select(
        '-password'
      );
      req.hotelId = decoded.hotelId;

      if (!req.user) {
        logger.warn(`User not found for hotelId: ${decoded.hotelId}`);
        return res
          .status(401)
          .json({ message: 'Unauthorized, user not found' });
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

// 고객 인증 미들웨어
export const protectCustomer = async (req, res, next) => {
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    const token = req.headers.authorization.split(' ')[1];
    if (!token || token === 'null') {
      logger.warn(
        'No valid token provided in Authorization header for customer'
      );
      return res.status(401).json({ message: 'Unauthorized, no token' });
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      logger.info(
        `Decoded token in protectCustomer: ${JSON.stringify(decoded)}`
      );
      req.customer = await Customer.findById(decoded.id).select('-password');
      if (!req.customer) {
        logger.warn(`Customer not found for id: ${decoded.id}`);
        return res
          .status(401)
          .json({ message: 'Unauthorized, customer not found' });
      }
      req.isCustomer = true;
      next();
    } catch (error) {
      logger.error(`Customer auth error: ${error.message}`);
      return res.status(401).json({ message: 'Unauthorized, token failed' });
    }
  } else {
    logger.warn('No token provided in Authorization header for customer');
    return res.status(401).json({ message: 'Unauthorized, no token' });
  }
};


// 새로운 미들웨어: protect와 protectCustomer 통합
export const protectOrProtectCustomer = async (req, res, next) => {
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    const token = req.headers.authorization.split(' ')[1];
    if (!token || token === 'null' || token === 'undefined') {
      logger.warn('No valid token provided in Authorization header');
      return res.status(401).json({ message: 'Unauthorized, no token' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      logger.info(`Decoded token in protectOrProtectCustomer: ${JSON.stringify(decoded)}`);

      // hotelId가 있으면 User로 인증 (HMS 프론트엔드)
      if (decoded.hotelId) {
        req.user = await User.findOne({ hotelId: decoded.hotelId }).select('-password');
        req.hotelId = decoded.hotelId;

        if (!req.user) {
          logger.warn(`User not found for hotelId: ${decoded.hotelId}`);
          return res
            .status(401)
            .json({ message: 'Unauthorized, user not found' });
        }
        req.isUser = true;
        next();
      }
      // hotelId가 없으면 Customer로 인증 (단잠앱)
      else if (decoded.id) {
        req.customer = await Customer.findById(decoded.id).select('-password');
        if (!req.customer) {
          logger.warn(`Customer not found for id: ${decoded.id}`);
          return res
            .status(401)
            .json({ message: 'Unauthorized, customer not found' });
        }
        req.isCustomer = true;
        next();
      } else {
        logger.warn('Invalid token structure');
        return res.status(401).json({ message: 'Unauthorized, invalid token structure' });
      }
    } catch (error) {
      logger.error(`Auth error in protectOrProtectCustomer: ${error.message}`, {
        token,
        errorStack: error.stack,
        serverTime: new Date().toISOString(),
      });
      return res.status(401).json({ message: 'Unauthorized, token failed' });
    }
  } else {
    logger.warn('No token provided in Authorization header');
    return res.status(401).json({ message: 'Unauthorized, no token' });
  }
};