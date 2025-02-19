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
 * 알림톡 API 인증 정보 (실제 발급받은 값을 사용)
 */
const authData = {
  apikey: process.env.ALIGO_API_KEY || 'YOUR_API_KEY',
  userid: process.env.ALIGO_USER_ID || 'YOUR_USER_ID',
};

/**
 * 현장예약인 경우 예약확정 알림톡 메시지를 전송하는 함수.
 * 승인된 템플릿에 따라 메시지 내용을 구성하고, axios를 통해 POST 요청을 보냅니다.
 *
 * @param {Object} reservation - 예약 정보 객체
 * @param {String} hotelId - 예약한 호텔의 ID (User 모델에서 호텔 정보를 조회하기 위해 사용)
 */
export async function sendReservationConfirmation(reservation, hotelId) {
  try {
    if (reservation.siteName !== '현장예약') return;

    const user = await User.findOne({ hotelId });
    if (!user) {
      logger.warn(`호텔 정보를 찾을 수 없습니다 (hotelId: ${hotelId})`);
      return;
    }

    if (!authData.apikey || authData.apikey === 'YOUR_API_KEY') {
      logger.error(
        'Alimtalk API 인증 정보가 설정되지 않았습니다. (API 키 누락)'
      );
      return;
    }
    if (!authData.userid || authData.userid === 'YOUR_USER_ID') {
      logger.error(
        'Alimtalk API User ID가 설정되지 않았습니다. (User ID 누락)'
      );
      return;
    }

    // _id에서 "현장예약-" 접두어 제거
    const reservationNumber = reservation._id.startsWith('현장예약-')
      ? reservation._id.substring('현장예약-'.length)
      : reservation._id;

    const message =
      `안녕하세요, ${reservation.customerName}님.\n\n` +
      `고객님의 호텔 예약이 확정되었습니다.\n` +
      `호텔명: ${user.hotelName}\n` +
      `예약번호: ${reservationNumber}\n` + // _id에서 접두어 제거한 값 사용
      `체크인: ${format(new Date(reservation.checkIn), 'yyyy-MM-dd HH:mm')}\n` +
      `체크아웃: ${format(
        new Date(reservation.checkOut),
        'yyyy-MM-dd HH:mm'
      )}\n` +
      `객실정보: ${reservation.roomInfo}\n` +
      `예약일: ${format(
        new Date(reservation.reservationDate),
        'yyyy-MM-dd HH:mm'
      )}\n` +
      `총 금액: ${reservation.price}원\n` +
      `결제 방식: ${reservation.paymentMethod}\n\n` +
      `문의사항은 ${user.phoneNumber}로 연락 주시기 바랍니다.\n감사합니다.`;

    const fmessage =
      `안녕하세요, ${reservation.customerName}님.\n\n` +
      `고객님의 ${user.hotelName} 예약이 확정되었습니다. 감사합니다.`;

    const receiverPhone =
      reservation.phoneNumber && reservation.phoneNumber.trim() !== ''
        ? sanitizePhoneNumber(reservation.phoneNumber)
        : '01000000000';

    // 발신번호는 알리고에 등록된 번호 사용 (환경변수 또는 상수)
    const registeredSender = process.env.REGISTERED_SENDER || '010-9338-7563';

    const params = new URLSearchParams();
    params.append('apikey', authData.apikey);
    params.append('userid', authData.userid);
    params.append(
      'senderkey',
      process.env.ALIGO_SENDER_KEY || 'YOUR_SENDER_KEY'
    );
    params.append(
      'tpl_code',
      process.env.ALIGO_TEMPLATE_CODE || '호텔예약알림_STAYSYNC'
    );
    params.append('sender', registeredSender);
    params.append('receiver_1', receiverPhone);
    params.append('recvname_1', reservation.customerName);
    params.append('subject_1', '예약 확인');
    params.append('message_1', message);
    params.append('fsubject_1', '예약 확인');
    params.append('fmessage_1', fmessage);

    // logger.info('알림톡 페이로드:', params.toString());

    const url = 'https://kakaoapi.aligo.in/akv10/alimtalk/send/';

    const response = await axios.post(url, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (response.data && response.data.code === 0) {
      logger.info('알림톡 전송 성공:', response.data);
    } else {
      logger.error('알림톡 전송 실패:', response.data);
    }
  } catch (error) {
    logger.error('알림톡 전송 중 예외 발생:', error);
  }
}
