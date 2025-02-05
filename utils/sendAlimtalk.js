// backend/utils/sendAlimtalk.js
import aligoapi from 'aligoapi'; // npm install aligoapi
import { format } from 'date-fns';

/**
 * 전화번호에서 숫자만 추출하는 헬퍼 함수
 */
function sanitizePhoneNumber(phoneNumber) {
  if (!phoneNumber) return '';
  return phoneNumber.replace(/\D/g, '');
}

/**
 * 알림톡 API 인증 정보 (나중에 발급받은 실제 값을 사용하세요)
 */
const authData = {
  apikey: 'YOUR_API_KEY',   // TODO: 실제 발급받은 API Key로 교체
  userid: 'YOUR_USER_ID',   // TODO: 실제 발급받은 User ID로 교체
};

/**
 * 현장예약인 경우에만 예약확정 알림톡(카카오톡 알림톡)을 전송하는 함수
 * 참고: 알리고 API SPEC에 따르면 알림톡 전송 시 아래와 같은 필수 파라미터가 있습니다.
 *   - senderkey: 발신프로필 키 (YOUR_SENDER_KEY)
 *   - tpl_code: 템플릿 코드 (예제에서는 'TX_8844'; 실제 템플릿 코드로 교체)
 *   - sender: 발신자 연락처 (호텔의 연락처)
 *   - receiver_1: 수신자 연락처 (숫자만 전달)
 *   - recvname_1: 수신자 이름
 *   - subject_1: 알림톡 제목
 *   - message_1: 알림톡 본문 (템플릿에 포함된 변수 치환)
 *   - senddate: (선택) 예약 전송일 (YYYYMMDDHHMMSS 형식, 필요시 추가)
 *   - testMode, button_1, failover 등 추가 옵션은 필요에 따라 구성 가능
 *
 * @param {Object} reservation - 예약 정보 (예: reservationNo, customerName, phoneNumber, checkIn, checkOut, reservationDate, roomInfo, price, paymentMethod, siteName 등)
 * @param {Object} hotelSettings - 호텔 설정 정보 (예: hotelName, hotelId, phoneNumber 등)
 */
export async function sendReservationConfirmation(reservation, hotelSettings) {
  // 현장예약이 아닌 경우 메시지 전송하지 않음
  if (reservation.siteName !== '현장예약') return;

  // 알림톡 템플릿에 맞춰 메시지 본문 구성
  const message =
    `고객님의 호텔 예약이 확정되었습니다.\n\n` +
    `호텔명: ${hotelSettings.hotelName} (${hotelSettings.hotelId})\n` +
    `예약번호: ${reservation.reservationNo}\n` +
    `체크인: ${format(new Date(reservation.checkIn), "yyyy-MM-dd HH:mm")}\n` +
    `체크아웃: ${format(new Date(reservation.checkOut), "yyyy-MM-dd HH:mm")}\n` +
    `객실정보: ${reservation.roomInfo}\n` +
    `예약일: ${format(new Date(reservation.reservationDate), "yyyy-MM-dd HH:mm")}\n` +
    `총 금액: ${reservation.price}원\n` +
    `결제 방식: ${reservation.paymentMethod}\n\n` +
    `문의사항은 ${hotelSettings.phoneNumber}로 연락 주시기 바랍니다.\n감사합니다.`;

  // 알림톡 전송에 필요한 payload 구성
  const payload = {
    senderkey: 'YOUR_SENDER_KEY', // TODO: 실제 발급받은 발신프로필 키로 교체
    tpl_code: 'TX_8844',          // TODO: 실제 사용 템플릿 코드로 교체
    sender: hotelSettings.phoneNumber, // 발신자 번호 (호텔 연락처)
    receiver_1: sanitizePhoneNumber(reservation.phoneNumber), // 수신자 번호 (숫자만)
    // 수신자 이름은 API 스펙상 recvname_1로 전달해야 합니다.
    recvname_1: reservation.customerName,
    subject_1: '예약 확인', // 원하는 알림톡 제목
    message_1: message,
    // 선택 사항: 예약 전송일 (즉시 전송할 경우 생략 가능)
    // senddate: format(new Date(), "yyyyMMddHHmmss"),
    // testMode: 'N', // 테스트 모드 사용 여부 (필요시 'Y'로 설정)
    // 추가 옵션: 버튼 정보, 실패 시 대체문자 전송 옵션 등 필요 시 추가
    // button_1: JSON.stringify({ button: [ { name: '버튼명', linkType: 'WL', linkMo: 'http://...', linkPc: 'http://...' } ] }),
    // failover: 'Y', fsubject_1: '대체문자 제목', fmessage_1: '대체문자 내용'
  };

  try {
    // aligoapi.alimtalkSend는 Express의 req 객체 형태의 { body: ... }를 받습니다.
    const req = { body: payload };
    const response = await aligoapi.alimtalkSend(req, authData);
    console.log('알림톡 전송 결과:', response);
  } catch (error) {
    console.error('알림톡 전송 실패:', error);
  }
}
