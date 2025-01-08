// backend/utils/isCancelledStatus.js

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

  // reservationStatus에서 취소 키워드 확인
  const statusCancelled = cancelKeywords.some((keyword) =>
    reservationStatus.toLowerCase().includes(keyword.toLowerCase())
  );

  // customerName에 '*' 포함 여부 확인
  const nameCancelled = customerName ? customerName.includes('*') : false;

  // roomInfo에서 취소 키워드 확인
  const roomInfoCancelled = roomInfo
    ? cancelKeywords.some((keyword) =>
        roomInfo.toLowerCase().includes(keyword.toLowerCase())
      )
    : false;

  // reservationNo에서 취소 키워드 확인
  const reservationNoCancelled = reservationNo
    ? cancelKeywords.some((keyword) =>
        reservationNo.toLowerCase().includes(keyword.toLowerCase())
      )
    : false;

  return (
    statusCancelled ||
    nameCancelled ||
    roomInfoCancelled ||
    reservationNoCancelled
  );
}
