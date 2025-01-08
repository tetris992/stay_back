// backend/utils/sendEmail.js

import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import logger from './logger.js';

dotenv.config();

// 이메일 전송을 위한 트랜스포터 생성
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// 트랜스포터 연결 확인
transporter.verify((error, success) => {
  if (error) {
    logger.error('이메일 트랜스포터 설정 오류:', error);
  } else {
    logger.info('이메일 트랜스포터가 정상적으로 연결되었습니다.');
  }
});

/**
 * 이메일 전송 함수
 * @param {Object} options - 이메일 옵션
 * @param {string} options.to - 수신자 이메일 주소
 * @param {string} options.subject - 이메일 제목
 * @param {string} options.html - 이메일 본문 (HTML 형식)
 */
const sendEmail = async ({ to, subject, html }) => {
  const mailOptions = {
    from: `"No Reply" <${process.env.EMAIL_FROM}>`,
    to,
    subject,
    html,
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info(`이메일이 성공적으로 전송되었습니다: ${to}`);
  } catch (error) {
    logger.error(`이메일 전송 실패 (${to}):`, error);
    throw new Error('이메일 전송에 실패했습니다.');
  }
};

export default sendEmail;
