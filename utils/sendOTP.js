import fetch from 'node-fetch';
import logger from './logger.js';

/**
 * 전화번호 정규화 함수
 */
export function normalizePhone(phoneNumber) {
  if (!phoneNumber) return '';
  return phoneNumber.replace(/\D/g, '');
}

/**
 * OTP SMS 발송 함수
 */
export async function sendOTP(phoneNumber, otp) {
  try {
    const normalizedPhone = normalizePhone(phoneNumber);
    if (!normalizedPhone) {
      throw new Error('유효하지 않은 전화번호입니다.');
    }

    // 알리고 API 설정
    const apiKey = process.env.ALIGO_API_KEY;
    const userId = process.env.ALIGO_USER_ID;
    const senderKey = process.env.ALIGO_SENDER_KEY;
    const sender = process.env.REGISTERED_SENDER;

    if (!apiKey || !userId || !senderKey || !sender) {
      throw new Error('SMS 발송을 위한 환경 변수가 설정되지 않았습니다.');
    }

    // SMS 메시지 구성
    const message = `[StaySync] 인증번호는 [${otp}] 입니다.`;

    // API 요청 파라미터 구성
    const params = new URLSearchParams();
    params.append('apikey', apiKey);
    params.append('userid', userId);
    params.append('senderkey', senderKey);
    params.append('sender', sender);
    params.append(' receiver', normalizedPhone);
    params.append('message', message);

    // API 요청
    const response = await fetch('https://kakaoapi.aligo.in/akv10/sms/send/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    const data = await response.json();

    if (data.code === 0) {
      logger.info(`SMS 발송 성공: ${normalizedPhone}`);
      return true;
    } else {
      logger.error(`SMS 발송 실패: ${data.message}`);
      throw new Error(`SMS 발송 실패: ${data.message}`);
    }
  } catch (error) {
    logger.error('SMS 발송 중 오류 발생:', error);
    throw error;
  }
} 