// backend/utils/sendAlimtalk.js

import { format } from 'date-fns';

/**
 * 전화번호에서 숫자만 추출하는 헬퍼 함수
 */
function sanitizePhoneNumber(phoneNumber) {
  if (!phoneNumber) return '';
  return phoneNumber.replace(/\D/g, '');
}

/**
 * 알림톡 API 인증 정보 (실제 발급받은 값을 사용해야 함)
 */
const authData = {
  apikey: process.env.ALIGO_API_KEY || 'YOUR_API_KEY', // 환경변수 또는 기본값
  userid: process.env.ALIGO_USER_ID || 'YOUR_USER_ID',  // 환경변수 또는 기본값
};

/**
 * 현장예약인 경우 예약확정 알림톡(카카오 알림톡)을 전송하는 함수.
 * 예약 정보와 호텔 설정 정보가 모두 제공되어야 합니다.
 *
 * @param {Object} reservation - 예약 정보 객체
 * @param {Object} hotelSettings - 호텔 설정 정보 객체 (hotelId, hotelName, phoneNumber 등 포함)
 */
export async function sendReservationConfirmation(reservation, hotelSettings) {
  // 현장예약인 경우에만 전송 (그 외는 전송하지 않음)
  if (reservation.siteName !== '현장예약') return;

  // 호텔 설정 정보에 hotelId가 반드시 있어야 함
  if (!hotelSettings || !hotelSettings.hotelId) {
    console.warn('호텔 설정 정보에 hotelId가 없습니다. 알림톡 전송을 건너뜁니다.');
    return;
  }

  // 인증 정보가 기본값이면 경고 후 전송 중단
  if (authData.apikey === 'YOUR_API_KEY' || authData.userid === 'YOUR_USER_ID') {
    console.warn(
      'Alimtalk API 인증 정보가 설정되지 않았습니다. (API 키 또는 User ID 없음) 예약 알림톡 전송을 건너뜁니다.'
    );
    return;
  }

  // 알림톡 메시지 구성 (필요에 따라 템플릿 코드와 발신번호를 조정)
  const message =
    `고객님의 호텔 예약이 확정되었습니다.\n\n` +
    `호텔명: ${hotelSettings.hotelName} (${hotelSettings.hotelId})\n` +
    `예약번호: ${reservation.reservationNo}\n` +
    `체크인: ${format(new Date(reservation.checkIn), 'yyyy-MM-dd HH:mm')}\n` +
    `체크아웃: ${format(new Date(reservation.checkOut), 'yyyy-MM-dd HH:mm')}\n` +
    `객실정보: ${reservation.roomInfo}\n` +
    `예약일: ${format(new Date(reservation.reservationDate), 'yyyy-MM-dd HH:mm')}\n` +
    `총 금액: ${reservation.price}원\n` +
    `결제 방식: ${reservation.paymentMethod}\n\n` +
    `문의사항은 ${hotelSettings.phoneNumber}로 연락 주시기 바랍니다.\n감사합니다.`;

  const payload = {
    senderkey: process.env.ALIGO_SENDER_KEY || 'YOUR_SENDER_KEY', // 환경변수 또는 기본값
    tpl_code: 'TX_8844', // 실제 템플릿 코드로 교체하세요.
    sender: hotelSettings.phoneNumber,
    receiver_1: sanitizePhoneNumber(reservation.phoneNumber),
    recvname_1: reservation.customerName,
    subject_1: '예약 확인',
    message_1: message,
  };

  console.log('알림톡 페이로드:', payload);

  try {
    // 동적 import를 통해 aligoapi 모듈 로드
    const { default: aligoapi } = await import('aligoapi');
    const req = { body: payload };
    const response = await aligoapi.alimtalkSend(req, authData);
    console.log('알림톡 전송 결과:', response);
  } catch (error) {
    console.error('알림톡 전송 실패:', error);
  }
}
