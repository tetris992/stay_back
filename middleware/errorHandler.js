// backend/middleware/errorHandler.js

import CustomError from '../utils/CustomError.js';

const errorHandler = (err, req, res, next) => {
  console.error('Unhandled Error:', err); // 모든 오류를 콘솔에 로그

  // Mongoose 유효성 검사 에러 처리
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      message: err.message,
      status: 400,
      timestamp: new Date().toISOString(),
    });
  }

  // JWT 에러 처리
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      message: '유효하지 않은 토큰입니다.',
      status: 401,
      timestamp: new Date().toISOString(),
    });
  }

  if (err instanceof CustomError) {
    res.status(err.statusCode).json({
      message: err.message,
      status: err.statusCode,
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(500).json({
      message: '서버 오류가 발생했습니다.',
      status: 500,
      timestamp: new Date().toISOString(),
    });
  }
};

export default errorHandler;
