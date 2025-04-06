//backend availability.js

import logger from './logger.js'; // logger 임포트 추가
import {
  format,
  startOfDay,
  addDays,
  differenceInCalendarDays,
  addMonths,
  areIntervalsOverlapping,
} from 'date-fns';

/**
 * calculateRoomAvailability
 * - 일반 예약(숙박): 점유 구간은 [checkIn, startOfDay(checkOut)) (즉, 체크아웃 당일은 점유하지 않음)
 * - 대실(dayUse): 아직 체크아웃되지 않았다면 체크인 날만 점유
 *
 * 서버에서 취소 예약은 이미 필터링되었다고 가정합니다.
 */
export function calculateRoomAvailability(
  reservations,
  roomTypes,
  fromDate,
  toDate,
  gridSettings = null
) {
  if (!fromDate || isNaN(new Date(fromDate))) {
    console.error('Invalid fromDate:', { fromDate });
    return {};
  }

  const calcFromDate = startOfDay(new Date(fromDate));
  const calcToDate = toDate
    ? startOfDay(new Date(toDate))
    : startOfDay(addMonths(calcFromDate, 3));
  const numDays = differenceInCalendarDays(calcToDate, calcFromDate) + 1;
  const dateList = [];
  for (let i = 0; i < numDays; i++) {
    dateList.push(format(addDays(calcFromDate, i), 'yyyy-MM-dd'));
  }

  // roomTypes 검증 및 필터링
  if (!Array.isArray(roomTypes)) {
    logger.error('[calculateRoomAvailability] roomTypes is not an array:', roomTypes);
    return {};
  }

  // 객실 타입별 정보 구성: roomNumbers와 gridSettings 기준으로 객실 수 계산
  const roomDataByType = {};
  roomTypes.forEach((rt, index) => {
    // rt가 객체이고 roomInfo 속성이 있는지 확인
    if (!rt || typeof rt !== 'object' || !rt.roomInfo || typeof rt.roomInfo !== 'string') {
      logger.warn(
        `[calculateRoomAvailability] Invalid roomType at index ${index}:`,
        rt
      );
      return; // 유효하지 않은 roomType은 건너뜀
    }

    const tKey = rt.roomInfo.toLowerCase();
    let rooms = rt.roomNumbers || [];
    let stock = rt.stock || 0;

    // roomNumbers가 비어 있거나 유효하지 않은 경우 gridSettings를 사용
    if (!rooms || rooms.length === 0 || rooms.length !== stock) {
      if (gridSettings?.floors) {
        rooms = gridSettings.floors
          .flatMap((floor) => floor.containers || [])
          .filter((cell) => {
            const cellTypeKey = (cell.roomInfo || 'standard').toLowerCase();
            return (
              cellTypeKey === tKey &&
              cell.roomNumber &&
              cell.roomNumber.trim() !== '' &&
              cell.isActive
            );
          })
          .map((cell) => cell.roomNumber)
          .sort();
        stock = rooms.length; // gridSettings 기준으로 stock 재계산
      } else {
        logger.warn(
          `[calculateRoomAvailability] No gridSettings provided for ${tKey}, using stock from roomTypes`
        );
        rooms = Array.from({ length: stock }, (_, i) => `room-${i + 1}`);
      }
    }

    roomDataByType[tKey] = { stock, rooms };
    logger.info(
      `[calculateRoomAvailability] ${tKey}: stock=${stock}, rooms=${rooms.join(', ')}`
    );
  });

  // 날짜별 사용량 초기화
  const usageByDate = {};
  dateList.forEach((ds) => {
    usageByDate[ds] = {};
    Object.keys(roomDataByType).forEach((typeKey) => {
      usageByDate[ds][typeKey] = {
        count: 0,
        assignedRooms: new Set(),
        checkedOutRooms: new Set(),
        reservations: [],
        checkedOutReservations: [],
      };
    });
    usageByDate[ds]['unassigned'] = {
      count: 0,
      checkedOutCount: 0,
      reservations: [],
      checkedOutReservations: [],
    };
  });

  // 각 예약별 점유 계산
  reservations.forEach((res) => {
    const ci = new Date(res.checkIn);
    const co = new Date(res.checkOut);
    if (
      !res.checkIn ||
      !res.checkOut ||
      isNaN(ci.getTime()) ||
      isNaN(co.getTime())
    ) {
      logger.warn(
        '[calculateRoomAvailability] Invalid reservation dates:',
        res
      );
      return;
    }

    let typeKey = res.roomInfo ? res.roomInfo.toLowerCase() : 'standard';
    if (!res.roomNumber || !res.roomNumber.trim()) {
      typeKey = 'unassigned';
    }

    const isDayUse = res.type === 'dayUse';
    const isCheckedOut = res.manuallyCheckedOut || false;
    const occupancyEnd = isDayUse ? startOfDay(ci) : startOfDay(co);

    dateList.forEach((ds) => {
      const dayStart = startOfDay(new Date(ds));
      const dayEnd = addDays(dayStart, 1);

      if (usageByDate[ds] && usageByDate[ds][typeKey]) {
        if (typeKey === 'unassigned') {
          if (isDayUse) {
            const isSameDay = format(ci, 'yyyy-MM-dd') === ds;
            if (isSameDay) {
              if (isCheckedOut) {
                usageByDate[ds][typeKey].checkedOutCount++;
                usageByDate[ds][typeKey].checkedOutReservations.push({
                  ...res,
                });
              } else {
                usageByDate[ds][typeKey].count++;
                usageByDate[ds][typeKey].reservations.push({
                  ...res,
                });
              }
            }
          } else {
            if (ci < dayEnd && occupancyEnd > dayStart) {
              if (isCheckedOut) {
                usageByDate[ds][typeKey].checkedOutCount++;
                usageByDate[ds][typeKey].checkedOutReservations.push({
                  ...res,
                });
              } else {
                usageByDate[ds][typeKey].count++;
                usageByDate[ds][typeKey].reservations.push({
                  ...res,
                });
              }
            }
          }
        } else {
          if (isDayUse) {
            const isSameDay = format(ci, 'yyyy-MM-dd') === ds;
            if (isSameDay) {
              if (isCheckedOut) {
                usageByDate[ds][typeKey].checkedOutRooms.add(res.roomNumber);
                usageByDate[ds][typeKey].checkedOutReservations.push({
                  ...res,
                });
              } else {
                usageByDate[ds][typeKey].count++;
                if (res.roomNumber) {
                  usageByDate[ds][typeKey].assignedRooms.add(res.roomNumber);
                }
                usageByDate[ds][typeKey].reservations.push({
                  ...res,
                });
              }
            }
          } else {
            if (ci < dayEnd && occupancyEnd > dayStart) {
              if (isCheckedOut) {
                usageByDate[ds][typeKey].checkedOutRooms.add(res.roomNumber);
                usageByDate[ds][typeKey].checkedOutReservations.push({
                  ...res,
                });
              } else {
                usageByDate[ds][typeKey].count++;
                if (res.roomNumber) {
                  usageByDate[ds][typeKey].assignedRooms.add(res.roomNumber);
                }
                usageByDate[ds][typeKey].reservations.push({
                  ...res,
                });
              }
            }
          }
        }
      }
    });
  });

  // 잔여 재고 계산
  const availability = {};
  dateList.forEach((ds) => {
    availability[ds] = {};
    Object.entries(usageByDate[ds]).forEach(([typeKey, usage]) => {
      if (typeKey === 'unassigned') {
        availability[ds][typeKey] = {
          count: usage.count,
          checkedOutCount: usage.checkedOutCount,
          reservations: usage.reservations,
          checkedOutReservations: usage.checkedOutReservations,
        };
      } else {
        const allRooms = roomDataByType[typeKey]?.rooms || [];
        const assigned = Array.from(usage.assignedRooms);
        const checkedOut = Array.from(usage.checkedOutRooms);
        const totalStock = roomDataByType[typeKey]?.stock || 0;
        const leftoverRooms = allRooms.filter(
          (rnum) => !assigned.includes(rnum) && !checkedOut.includes(rnum)
        );
        const remain = Math.max(totalStock - usage.count, 0);
        availability[ds][typeKey] = {
          remain,
          leftoverRooms,
          assignedRooms: assigned,
          checkedOutRooms: checkedOut,
          reservations: usage.reservations,
          checkedOutReservations: usage.checkedOutReservations,
        };
      }
    });
  });

  return availability;
}

/**
 * getDetailedAvailabilityMessage
 * 선택한 날짜 범위 내에, 각 날짜별 사용 가능한 객실 번호(잔여 객실)를 메시지로 생성합니다.
 */
export function getDetailedAvailabilityMessage(
  rangeStart,
  rangeEnd,
  roomTypeKey,
  availabilityByDate
) {
  let msg =
    '예약이 불가능합니다.\n선택한 날짜 범위에서 날짜별 사용 가능한 객실번호는 다음과 같습니다:\n';
  let cursor = startOfDay(rangeStart);
  while (cursor < startOfDay(rangeEnd)) {
    const ds = format(cursor, 'yyyy-MM-dd');
    const freeRooms =
      availabilityByDate[ds]?.[roomTypeKey.toLowerCase()]?.leftoverRooms || [];
    msg += `${ds}: ${freeRooms.length > 0 ? freeRooms.join(', ') : '없음'}\n`;
    cursor = addDays(cursor, 1);
  }
  msg += '\n(이미 배정된 예약을 다른 객실로 옮긴 후 재시도해주세요.)';
  return msg;
}

/**
 * canSwapReservations
 * 두 예약을 서로의 객실 번호로 교환할 수 있는지 판단합니다.
 * 점유 간격은:
 * - 일반 예약: [checkIn, startOfDay(checkOut))
 * - 대실: [checkIn, checkIn]
 */
export function canSwapReservations(reservationA, reservationB, reservations) {
  const roomTypeA = reservationA.roomInfo
    ? reservationA.roomInfo.toLowerCase()
    : '';
  const roomTypeB = reservationB.roomInfo
    ? reservationB.roomInfo.toLowerCase()
    : '';

  const intervalA = {
    start: new Date(reservationA.checkIn),
    end:
      reservationA.type === 'dayUse'
        ? new Date(reservationA.checkIn)
        : startOfDay(new Date(reservationA.checkOut)),
  };
  const intervalB = {
    start: new Date(reservationB.checkIn),
    end:
      reservationB.type === 'dayUse'
        ? new Date(reservationB.checkIn)
        : startOfDay(new Date(reservationB.checkOut)),
  };

  const conflictA = reservations.some((r) => {
    if (r._id === reservationA._id || r._id === reservationB._id) return false;
    if (!r.roomNumber || !r.roomInfo) return false;
    if (r.roomInfo.toLowerCase() !== roomTypeA) return false;
    if (r.roomNumber !== reservationB.roomNumber) return false;

    const resInterval = {
      start: new Date(r.checkIn),
      end:
        r.type === 'dayUse'
          ? new Date(r.checkIn)
          : startOfDay(new Date(r.checkOut)),
    };

    return areIntervalsOverlapping(intervalA, resInterval, {
      inclusive: false,
    });
  });
  if (conflictA) return false;

  const conflictB = reservations.some((r) => {
    if (r._id === reservationA._id || r._id === reservationB._id) return false;
    if (!r.roomNumber || !r.roomInfo) return false;
    if (r.roomInfo.toLowerCase() !== roomTypeB) return false;
    if (r.roomNumber !== reservationA.roomNumber) return false;

    const resInterval = {
      start: new Date(r.checkIn),
      end:
        r.type === 'dayUse'
          ? new Date(r.checkIn)
          : startOfDay(new Date(r.checkOut)),
    };

    return areIntervalsOverlapping(intervalB, resInterval, {
      inclusive: false,
    });
  });

  return !conflictB;
}

/**
 * isRoomAvailableForPeriod
 * 지정된 객실 번호와 예약 기간에 대해 점유 충돌이 있는지 확인하고,
 * 충돌이 발생한 날짜(문자열 배열)를 반환합니다.
 * 점유 간격은:
 * - 일반 예약: [checkIn, startOfDay(checkOut))
 * - 대실: [checkIn, checkIn]
 */
export function isRoomAvailableForPeriod(
  roomNumber,
  roomTypeKey,
  checkInDateTime,
  checkOutDateTime,
  reservations,
  excludeReservationId = null
) {
  const newInterval = {
    start: new Date(checkInDateTime),
    end: (() => {
      const candidate = reservations.find(
        (r) => r._id === excludeReservationId
      );
      if (candidate && candidate.type === 'dayUse') {
        return new Date(checkInDateTime);
      }
      return startOfDay(new Date(checkOutDateTime));
    })(),
  };

  const conflictingReservations = reservations.filter((r) => {
    if (excludeReservationId && r._id === excludeReservationId) return false;
    if (!r.roomNumber || !r.roomInfo) return false;
    if (r.roomInfo.toLowerCase() !== roomTypeKey) return false;
    if (r.roomNumber !== String(roomNumber)) return false;

    const resInterval = {
      start: new Date(r.checkIn),
      end:
        r.type === 'dayUse'
          ? new Date(r.checkIn)
          : startOfDay(new Date(r.checkOut)),
    };

    return areIntervalsOverlapping(newInterval, resInterval, {
      inclusive: false,
    });
  });

  const conflictDays = [];
  if (conflictingReservations.length > 0) {
    let d = startOfDay(newInterval.start);
    const end = startOfDay(newInterval.end);
    while (d < end) {
      // 안전하게 현재 날짜를 캡처
      const currentDay = d;
      const dayStr = format(currentDay, 'yyyy-MM-dd');
      const conflict = conflictingReservations.some((r) => {
        const intervalStart = new Date(r.checkIn);
        const intervalEnd =
          r.type === 'dayUse'
            ? new Date(r.checkIn)
            : startOfDay(new Date(r.checkOut));
        return (
          currentDay < intervalEnd && addDays(currentDay, 1) > intervalStart
        );
      });
      if (conflict) conflictDays.push(dayStr);
      d = addDays(d, 1);
    }
  }

  return { canMove: conflictDays.length === 0, conflictDays };
}

/**
 * checkContainerOverlap
 * 같은 컨테이너(객실) 내에서 예약 점유가 겹치는지 확인합니다.
 */
export function checkContainerOverlap(
  roomNumber,
  roomTypeKey,
  checkInDateTime,
  checkOutDateTime,
  reservations
) {
  const newInterval = {
    start: new Date(checkInDateTime),
    end: (() => {
      const candidate = reservations.find(
        (r) =>
          r.roomNumber === roomNumber &&
          r.roomInfo.toLowerCase() === roomTypeKey
      );
      if (candidate && candidate.type === 'dayUse') {
        return new Date(checkInDateTime);
      }
      return startOfDay(new Date(checkOutDateTime));
    })(),
  };

  const conflictDays = [];
  let d = startOfDay(newInterval.start);
  const end = startOfDay(newInterval.end);
  while (d < end) {
    const currentDay = d; // 안전하게 캡처
    const dayStr = format(currentDay, 'yyyy-MM-dd');
    const conflictingReservations = reservations.filter((r) => {
      if (!r.roomNumber || !r.roomInfo) return false;
      if (r.roomInfo.toLowerCase() !== roomTypeKey) return false;
      if (r.roomNumber !== String(roomNumber)) return false;

      const intervalStart = new Date(r.checkIn);
      const intervalEnd =
        r.type === 'dayUse'
          ? new Date(r.checkIn)
          : startOfDay(new Date(r.checkOut));

      return currentDay < intervalEnd && addDays(currentDay, 1) > intervalStart;
    });
    if (conflictingReservations.length > 1) {
      conflictDays.push(dayStr);
    }
    d = addDays(d, 1);
  }
  return { canMove: conflictDays.length === 0, conflictDays };
}

/**
 * canMoveToRoom
 * 특정 객실에 대해, 예약 점유 가능 여부와 컨테이너 내 점유 충돌 여부를 모두 확인하여 이동 가능 여부를 반환합니다.
 */
export function canMoveToRoom(
  roomNumber,
  roomTypeKey,
  checkInDateTime,
  checkOutDateTime,
  availabilityByDate,
  reservations,
  excludeReservationId = null
) {
  const result1 = isRoomAvailableForPeriod(
    roomNumber,
    roomTypeKey,
    checkInDateTime,
    checkOutDateTime,
    reservations,
    excludeReservationId
  );
  const result2 = checkContainerOverlap(
    roomNumber,
    roomTypeKey,
    checkInDateTime,
    checkOutDateTime,
    reservations
  );
  return {
    canMove: result1.canMove && result2.canMove,
    conflictDays: [...result1.conflictDays, ...result2.conflictDays],
  };
}

/**
 * checkConflict
 * 드래그된 예약과 대상 객실의 기존 예약 간의 점유 충돌 여부를 판단합니다.
 * - 일반 예약: [checkIn, startOfDay(checkOut))
 * - 대실: [checkIn, checkIn]
 * - 과거 체크인 예약은 이동 불가
 */
export const checkConflict = (
  draggedReservation,
  targetRoomNumber,
  fullReservations
) => {
  const draggedCheckIn = new Date(draggedReservation.checkIn);
  const draggedCheckOut = new Date(draggedReservation.checkOut);
  const isDayUseDragged = draggedReservation.type === 'dayUse';
  const currentDate = startOfDay(new Date());

  if (startOfDay(draggedCheckIn) < currentDate) {
    console.log(
      `[checkConflict] 예약 ${draggedReservation._id}는 과거 체크인 예약으로 이동할 수 없습니다.`
    );
    return { isConflict: true, conflictReservation: draggedReservation };
  }

  const draggedInterval = {
    start: draggedCheckIn,
    end: isDayUseDragged
      ? new Date(draggedCheckIn)
      : startOfDay(draggedCheckOut),
  };

  for (const reservation of fullReservations) {
    if (
      reservation.roomNumber !== targetRoomNumber ||
      reservation._id === draggedReservation._id
    ) {
      continue;
    }

    const resCheckIn = new Date(reservation.checkIn);
    const resCheckOut = new Date(reservation.checkOut);
    const isDayUseRes = reservation.type === 'dayUse';
    const resInterval = {
      start: resCheckIn,
      end: isDayUseRes ? new Date(resCheckIn) : startOfDay(resCheckOut),
    };

    if (isDayUseDragged && isDayUseRes) {
      if (
        areIntervalsOverlapping(draggedInterval, resInterval, {
          inclusive: false,
        })
      ) {
        return { isConflict: true, conflictReservation: reservation };
      }
    } else {
      const draggedCI = startOfDay(draggedCheckIn);
      const draggedCO = startOfDay(draggedCheckOut);
      const resCI = startOfDay(resCheckIn);
      const resCO = startOfDay(resCheckOut);
      if (draggedCI < resCO && draggedCO > resCI) {
        console.log(
          `[checkConflict] 충돌 발생: 예약 ${draggedReservation._id}와 ${reservation._id}`
        );
        return { isConflict: true, conflictReservation: reservation };
      }
    }
  }
  return { isConflict: false };
};

export function computeRemainingInventory(roomTypes, reservations) {
  const today = new Date();
  const availability = calculateRoomAvailability(
    reservations,
    roomTypes,
    startOfDay(today),
    endOfDay(today),
    null // gridSettings는 필요 없음
  );

  const remainingInventory = {};
  const todayStr = format(today, 'yyyy-MM-dd');
  roomTypes.forEach((rt) => {
    const typeKey = rt.roomInfo.toLowerCase();
    const dailyData = availability[todayStr]?.[typeKey] || {
      remain: rt.stock || 0,
      leftoverRooms: rt.roomNumbers || [],
    };
    remainingInventory[typeKey] = dailyData.remain;
  });

  return remainingInventory;
}
