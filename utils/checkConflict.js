import {
  startOfDay,
  areIntervalsOverlapping,
  format,
  differenceInCalendarDays,
} from 'date-fns';

export const checkConflict = (
  draggedReservation,
  targetRoomNumber,
  fullReservations,
  selectedDate
) => {
  const draggedCheckIn = new Date(draggedReservation.checkIn);
  const draggedCheckOut = new Date(draggedReservation.checkOut);
  const isCheckedOutDragged = draggedReservation.isCheckedOut || false;
  const isDayUseDragged = draggedReservation.type === 'dayUse';
  const currentDate = startOfDay(new Date());
  const selectedDateOnly = startOfDay(new Date(selectedDate));

  // 글로벌 원칙 1: 체크아웃 지난 예약 드래그 불가
  const draggedEnd = startOfDay(draggedCheckOut);
  if (currentDate > draggedEnd) {
    console.log(
      `[checkConflict] Cannot drag reservation ${
        draggedReservation._id
      }: Check-out passed (Check-out: ${format(
        draggedEnd,
        'yyyy-MM-dd'
      )}, Current Date: ${format(currentDate, 'yyyy-MM-dd')})`
    );
    return { isConflict: true, conflictReservation: draggedReservation };
  }

  // 글로벌 원칙 2: 연박 예약은 첫 번째 날짜에서만 드래그 가능
  const draggedStart = startOfDay(draggedCheckIn);
  if (
    draggedStart < selectedDateOnly &&
    differenceInCalendarDays(draggedEnd, draggedStart) > 0
  ) {
    console.log(
      `[checkConflict] Cannot drag reservation ${
        draggedReservation._id
      }: Past check-in in multi-day reservation (Check-in: ${format(
        draggedStart,
        'yyyy-MM-dd'
      )}, Selected Date: ${format(selectedDateOnly, 'yyyy-MM-dd')})`
    );
    return { isConflict: true, conflictReservation: draggedReservation };
  }

  const draggedInterval = {
    start: draggedCheckIn,
    end:
      isDayUseDragged && isCheckedOutDragged
        ? draggedCheckIn
        : startOfDay(draggedCheckOut),
  };

  for (const reservation of fullReservations) {
    if (
      reservation.roomNumber !== targetRoomNumber ||
      reservation._id === draggedReservation._id ||
      reservation.isCancelled
    )
      continue;

    const resCheckIn = new Date(reservation.checkIn);
    const resCheckOut = new Date(reservation.checkOut);
    const isCheckedOutRes = reservation.isCheckedOut || false;
    const isDayUseRes = reservation.type === 'dayUse';

    const resInterval = {
      start: resCheckIn,
      end:
        isDayUseRes && isCheckedOutRes ? resCheckIn : startOfDay(resCheckOut),
    };

    if (
      areIntervalsOverlapping(draggedInterval, resInterval, {
        inclusive: false,
      })
    ) {
      console.log(
        `[checkConflict] Point occupancy conflict detected between ${draggedReservation._id} and ${reservation._id} (Target Room: ${targetRoomNumber})`
      );
      return { isConflict: true, conflictReservation: reservation };
    }
  }

  return { isConflict: false, conflictReservation: null };
};
