// backend/utils/isCancelledStatus.js

let loggedWarnings = new Set(); // 경고를 한 번만 기록하기 위한 Set (프로세스 수준에서 공유)

export function isCancelledStatus(
  reservationStatus,
  customerName,
  roomInfo,
  reservationNo
) {
  const cancelKeywords = [
    '취소',
    '예약취소',
    '고객취소',
    '취소된 예약',
    'Canceled',
    'Cancelled',
    'キャンセル',
    'Annullé',
    'Anulado',
    'Abgebrochen',
  ];

  // 입력값 검증 및 기본값 설정
  const safeReservationStatus = reservationStatus || '';
  const safeCustomerName = customerName || '';
  const safeRoomInfo = roomInfo || '';
  const safeReservationNo = reservationNo || '';

  // 디버깅 로그 (한 번만 출력)
  if (process.env.NODE_ENV === 'development') {
    const warningKey = `${safeReservationStatus}-${safeCustomerName}-${safeRoomInfo}-${safeReservationNo}`;
    if (
      !reservationStatus &&
      !loggedWarnings.has(`reservationStatus-${warningKey}`)
    ) {
      console.warn('isCancelledStatus: reservationStatus is undefined');
      loggedWarnings.add(`reservationStatus-${warningKey}`);
    }
    if (!customerName && !loggedWarnings.has(`customerName-${warningKey}`)) {
      console.warn('isCancelledStatus: customerName is undefined');
      loggedWarnings.add(`customerName-${warningKey}`);
    }
    if (!roomInfo && !loggedWarnings.has(`roomInfo-${warningKey}`)) {
      console.warn('isCancelledStatus: roomInfo is undefined');
      loggedWarnings.add(`roomInfo-${warningKey}`);
    }
    if (!reservationNo && !loggedWarnings.has(`reservationNo-${warningKey}`)) {
      console.warn('isCancelledStatus: reservationNo is undefined');
      loggedWarnings.add(`reservationNo-${warningKey}`);
    }
  }

  // reservationStatus에서 취소 키워드 확인
  const statusCancelled = cancelKeywords.some((keyword) =>
    safeReservationStatus.toLowerCase().includes(keyword.toLowerCase())
  );

  // customerName에 '*' 포함 여부 확인
  const nameCancelled = safeCustomerName.includes('*');

  // roomInfo에서 취소 키워드 확인
  const roomInfoCancelled = cancelKeywords.some((keyword) =>
    safeRoomInfo.toLowerCase().includes(keyword.toLowerCase())
  );

  // reservationNo에서 취소 키워드 확인
  const reservationNoCancelled = cancelKeywords.some((keyword) =>
    safeReservationNo.toLowerCase().includes(keyword.toLowerCase())
  );

  return (
    statusCancelled ||
    nameCancelled ||
    roomInfoCancelled ||
    reservationNoCancelled
  );
}

// 프로세스 종료 시 경고 기록 초기화 (Node.js 환경)
if (process.env.NODE_ENV === 'development') {
  process.on('exit', () => {
    loggedWarnings.clear();
  });
}
