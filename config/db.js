// backend/config/db.js

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

// MongoDB 연결 설정 함수
const connectDB = async () => {
  try {
    await mongoose.connect(DATABASE_URL);
    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error(`MongoDB Connection Error: ${error.message}`);
    process.exit(1); // 연결 실패 시 서버 종료
  }
};

export default connectDB;
