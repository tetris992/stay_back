// sendAlimtalk.js
import { format } from 'date-fns';
import axios from 'axios';
import logger from '../utils/logger.js';
import User from '../models/User.js';

/**
 * 전화번호에서 숫자만 추출하는 헬퍼 함수
 */
function sanitizePhoneNumber(phoneNumber) {
  if (!phoneNumber) {
    logger.error('전화번호가 제공되지 않았습니다.');
    return '';
  }
  return phoneNumber.replace(/\D/g, '');
}

/**
 * 고객 이름 정규화 함수 (특수문자 및 비정상 데이터 제거)
 */
function normalizeCustomerName(name) {
  if (!name || typeof name !== 'string') return '고객';
  const normalized = name.replace(/현장:[\d:]+/, '').trim();
  return normalized || '고객';
}

/**
 * 알림톡 API 인증 정보
 */
const authData = {
  apikey: process.env.ALIGO_API_KEY || 'rrk50u7d01qxstrusulj5rt45k04nh07',
  userid: process.env.ALIGO_USER_ID || 'staysync',
};

/**
 * 템플릿 코드를 7바이트 이내로 검증하는 헬퍼 함수
 * @param {string} tplCode - 템플릿 코드
 * @param {string} eventType - 이벤트 타입 (디버깅용)
 * @returns {string} - 유효한 템플릿 코드
 */
function validateTemplateCode(tplCode, eventType) {
  const defaultCodes = {
    create: 'TX_8844',
    cancel: 'TY_3799',
  };
  const code = tplCode || defaultCodes[eventType] || 'TX_8844';
  logger.debug(`Raw template code for ${eventType}: ${code}`);

  const byteLength = Buffer.from(code).length;
  if (byteLength > 7) {
    logger.warn(
      `Template code ${code} for ${eventType} exceeds 7 bytes (${byteLength} bytes), truncating to first 7 bytes`
    );
    return code.slice(0, 7);
  }
  return code;
}

/**
 * 알림톡 메시지를 전송하는 함수 (예약 생성, 취소만 유지)
 * @param {Object} reservation - 예약 정보 객체
 * @param {String} hotelId - 호텔 ID
 * @param {String} eventType - 이벤트 타입 ('create', 'cancel')
 * @param {Function} getShortReservationNumber - 예약번호 단축 함수 (외부에서 주입)
 */
export async function sendReservationNotification(
  reservation,
  hotelId,
  eventType = 'create',
  getShortReservationNumber
) {
  try {
    logger.debug(
      `Processing notification for ${eventType}, reservation ID: ${reservation._id}, siteName: ${reservation.siteName}`
    );

    const user = await User.findOne({ hotelId });
    if (!user) {
      logger.warn(`호텔 정보를 찾을 수 없습니다 (hotelId: ${hotelId})`);
      return;
    }

    if (!getShortReservationNumber) {
      throw new Error('getShortReservationNumber function is required');
    }
    const reservationNumber = getShortReservationNumber(reservation._id);
    logger.debug(`Shortened reservation number: ${reservationNumber}`);

    const customerName = normalizeCustomerName(reservation.customerName);
    logger.debug(`Normalized customer name: ${customerName}`);

    let tplCode, subject, fsubject, message, fmessage;
    switch (eventType) {
      case 'create':
        tplCode = validateTemplateCode(
          process.env.ALIGO_TEMPLATE_CODE_CREATE,
          'create'
        );
        logger.debug(`Using template code for create: ${tplCode}`);
        subject = '예약 확인';
        fsubject = '예약 확인';
        message = `
안녕하세요, ${customerName}님.\n\n고객님의 호텔 예약이 확정되었습니다.\n호텔명: ${
          user.hotelName
        }\n예약번호: ${reservationNumber}\n체크인: ${format(
          new Date(reservation.checkIn),
          'yyyy-MM-dd HH:mm'
        )}\n체크아웃: ${format(
          new Date(reservation.checkOut),
          'yyyy-MM-dd HH:mm'
        )}\n객실정보: ${reservation.roomInfo}\n예약일: ${format(
          new Date(reservation.reservationDate),
          'yyyy-MM-dd HH:mm'
        )}\n총 금액: ${reservation.price || 0}원\n결제 방식: ${
          reservation.paymentMethod || 'Pending'
        }\n\n문의사항은 ${user.phoneNumber}로 연락 주시기 바랍니다.\n감사합니다.
        `;
        fmessage = `안녕하세요, ${customerName}님.\n\n고객님의 ${user.hotelName} 예약이 확정되었습니다. 감사합니다.`;
        break;

      case 'cancel':
        tplCode = validateTemplateCode(
          process.env.ALIGO_TEMPLATE_CODE_CANCEL,
          'cancel'
        );
        logger.debug(`Using template code for cancel: ${tplCode}`);
        subject = '예약 취소';
        fsubject = '예약 취소';
        message = `
안녕하세요, ${customerName}님.\n\n고객님의 요청으로 예약이 취소되었습니다.\n호텔명: ${
          user.hotelName
        }\n예약번호: ${reservationNumber}\n체크인: ${format(
          new Date(reservation.checkIn),
          'yyyy-MM-dd HH:mm'
        )}\n체크아웃: ${format(
          new Date(reservation.checkOut),
          'yyyy-MM-dd HH:mm'
        )}\n객실정보: ${reservation.roomInfo}\n예약일: ${format(
          new Date(reservation.reservationDate),
          'yyyy-MM-dd HH:mm'
        )}\n\n취소 관련 문의사항은 ${
          user.phoneNumber
        }로 연락 주십시오.\n감사합니다.
        `;
        fmessage = `안녕하세요, ${customerName}님.\n\n고객님의 ${user.hotelName} 예약이 취소되었습니다. 감사합니다.`;
        break;

      default:
        logger.warn(`Unknown event type: ${eventType}, skipping notification`);
        return;
    }

    const receiverPhone =
      sanitizePhoneNumber(reservation.phoneNumber) || '01000000000';
    logger.debug(`Sending to receiver phone: ${receiverPhone}`);
    const registeredSender = process.env.REGISTERED_SENDER || '010-9338-7563';
    const senderKey =
      process.env.ALIGO_SENDER_KEY ||
      '4223713161fbcb516366ac9c0d020d1a39f9d8fa';

    const params = new URLSearchParams();
    params.append('apikey', authData.apikey);
    params.append('userid', authData.userid);
    params.append('senderkey', senderKey);
    params.append('tpl_code', tplCode);
    params.append('sender', registeredSender);
    params.append('receiver_1', receiverPhone);
    params.append('recvname_1', customerName);
    params.append('subject_1', subject);
    params.append('message_1', message);
    params.append('fsubject_1', fsubject);
    params.append('fmessage_1', fmessage);

    logger.debug(
      `Alimtalk request params: ${JSON.stringify(Object.fromEntries(params))}`
    );

    const url = 'https://kakaoapi.aligo.in/akv10/alimtalk/send/';

    const response = await axios.post(url, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    logger.debug(`Alimtalk API response: ${JSON.stringify(response.data)}`);

    if (response.data && response.data.code === 0) {
      logger.info(`알림톡 전송 성공 (${eventType}):`, response.data);
      logger.debug(
        `Notification sent, mid: ${response.data.info.mid}, check status with Aligo`
      );
    } else {
      logger.error(`알림톡 전송 실패 (${eventType}):`, response.data);
      throw new Error(`알림톡 전송 실패: ${response.data.message}`);
    }
  } catch (error) {
    logger.error(`알림톡 전송 중 예외 발생 (${eventType}):`, error);
    throw error;
  }
}
