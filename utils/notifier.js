// backend/utils/notifier.js

import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import logger from './logger.js';
import User from '../models/User.js'; // User 모델 임포트

dotenv.config();
/**
 * 이메일 전송을 위한 트랜스포터 설정
 */
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST, // 예: smtp.gmail.com
  port: process.env.EMAIL_PORT, // 예: 587
  secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER, // 이메일 계정
    pass: process.env.EMAIL_PASS, // 이메일 비밀번호 또는 앱 비밀번호
  },
});

/**
 * 오류 알림 이메일 전송 함수
 * @param {Object} params - 이메일 전송에 필요한 매개변수
 * @param {String} params.hotelId - 호텔 ID
 * @param {String} params.taskName - OTA 이름
 * @param {String} params.errorMessage - 오류 메시지
 */
const sendErrorNotification = async ({ hotelId, taskName, errorMessage }) => {
  try {
    // 호텔 ID에 해당하는 사용자 정보 조회
    const user = await User.findOne({ hotelId });
    if (!user) {
      logger.warn(`User not found for hotelId: ${hotelId}. Cannot send error notification.`);
      return;
    }

    const mailOptions = {
      from: `"호텔 관리 시스템" <${process.env.EMAIL_USER}>`, // 발신자 주소
      to: user.email, // 수신자 주소
      subject: `[알림] ${taskName} 스크래핑 작업 오류 발생`, // 메일 제목
      text: `안녕하세요, ${user.hotelId} 호텔 담당자님.\n\n${taskName} 스크래핑 작업 중 오류가 발생했습니다.\n오류 메시지: ${errorMessage}\n\n문제를 해결하기 위해 로그인 후 스크래핑 작업을 재시작해주시기 바랍니다.\n\n감사합니다.`, // 메일 내용
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Sent error notification email to ${user.email} for hotelId: ${hotelId}, taskName: ${taskName}`);
  } catch (error) {
    logger.error(`Failed to send error notification email for hotelId: ${hotelId}, taskName: ${taskName}`, error);
  }
};

export default {
  sendErrorNotification,
};
