import { startOfDay, areIntervalsOverlapping } from 'date-fns';

export const checkConflict = (
  draggedReservation,
  targetRoomNumber,
  fullReservations,
  excludeReservationId = null
) => {
  // 문자열 시간 처리: +09:00(KST) 시간대 보장
  const draggedCheckIn = new Date(
    draggedReservation.checkIn.endsWith('Z') || draggedReservation.checkIn.includes('+')
      ? draggedReservation.checkIn
      : `${draggedReservation.checkIn}+09:00`
  );
  const draggedCheckOut = new Date(
    draggedReservation.checkOut.endsWith('Z') || draggedReservation.checkOut.includes('+')
      ? draggedReservation.checkOut
      : `${draggedReservation.checkOut}+09:00`
  );

  // 입력 유효성 검사
  if (isNaN(draggedCheckIn.getTime()) || isNaN(draggedCheckOut.getTime())) {
    throw new Error('Invalid checkIn or checkOut date in draggedReservation');
  }

  const isDayUseDragged = draggedReservation.type === 'dayUse';

  for (const reservation of fullReservations) {
    // 필터 조건: 동일 객실, 동일 예약 제외, 취소된 예약 제외
    if (
      reservation.roomNumber !== targetRoomNumber ||
      reservation._id === draggedReservation._id ||
      (excludeReservationId && reservation._id === excludeReservationId) ||
      reservation.isCancelled
    ) {
      continue;
    }

    // 문자열 시간 처리
    const resCheckIn = new Date(
      reservation.checkIn.endsWith('Z') || reservation.checkIn.includes('+')
        ? reservation.checkIn
        : `${reservation.checkIn}+09:00`
    );
    const resCheckOut = new Date(
      reservation.checkOut.endsWith('Z') || reservation.checkOut.includes('+')
        ? reservation.checkOut
        : `${reservation.checkOut}+09:00`
    );

    // 입력 유효성 검사
    if (isNaN(resCheckIn.getTime()) || isNaN(resCheckOut.getTime())) {
      continue; // 유효하지 않은 날짜는 건너뜀
    }

    const isDayUseRes = reservation.type === 'dayUse';

    // 충돌 검사 로직
    if (isDayUseDragged && isDayUseRes) {
      // 대실 예약 간 충돌: 시간 단위로 확인
      const draggedInterval = { start: draggedCheckIn, end: draggedCheckOut };
      const resInterval = { start: resCheckIn, end: resCheckOut };
      if (
        areIntervalsOverlapping(draggedInterval, resInterval, { inclusive: false })
      ) {
        return { isConflict: true, conflictReservation: reservation };
      }
    } else if (isDayUseDragged || isDayUseRes) {
      // 대실과 숙박 간 충돌: 날짜 단위로 확인
      const draggedCheckInDate = startOfDay(draggedCheckIn);
      const draggedCheckOutDate = startOfDay(draggedCheckOut);
      const resCheckInDate = startOfDay(resCheckIn);
      const resCheckOutDate = startOfDay(resCheckOut);
      if (
        draggedCheckInDate < resCheckOutDate &&
        draggedCheckOutDate > resCheckInDate
      ) {
        return { isConflict: true, conflictReservation: reservation };
      }
    } else {
      // 숙박 예약 간 충돌: 시간 단위로 확인 (체크아웃 당일 제외)
      if (
        draggedCheckIn < resCheckOut &&
        draggedCheckOut > resCheckIn &&
        draggedCheckIn.getTime() !== resCheckOut.getTime()
      ) {
        return { isConflict: true, conflictReservation: reservation };
      }
    }
  }

  return { isConflict: false, conflictReservation: null };
};