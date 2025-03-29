// backend/utils/roomGridUtils.js
import logger from './logger.js';
import HotelSettingsModel from '../models/HotelSettings.js';

/**
 * 예약 가능한 객실 번호를 할당하는 함수 (floors / containers 둘 다 지원)
 * @param {Object} reservationData - 예약 데이터 (checkIn, checkOut, roomInfo 등)
 * @param {String} hotelId - 호텔 ID
 * @param {Model} ReservationModel - Reservation mongoose 모델
 * @returns {String} - 할당된 객실 번호 (사용 가능한 객실이 없는 경우 빈 문자열 반환)
 */
export const assignRoomNumber = async (reservationData, hotelId, ReservationModel) => {
  // 1) 호텔 설정 조회
  const hotelSettings = await HotelSettingsModel.findOne({ hotelId });
  if (!hotelSettings) {
    logger.warn(`[assignRoomNumber] Hotel settings not found for hotelId=${hotelId}`);
    return '';
  }

  const gridSettings = hotelSettings.gridSettings || {};

  // 2) floors 기반인지, containers 기반인지 판단하여 containers를 평탄화
  let allContainers = [];
  if (Array.isArray(gridSettings.floors) && gridSettings.floors.length > 0) {
    // floors가 있으면 floors[].containers를 전부 모읍니다.
    allContainers = gridSettings.floors.flatMap((floor) => floor.containers || []);
  } else if (Array.isArray(gridSettings.containers)) {
    // 과거 구조: gridSettings.containers가 바로 존재
    allContainers = gridSettings.containers;
  } else {
    logger.warn('[assignRoomNumber] gridSettings에 floors도 containers도 없습니다.');
    return '';
  }

  // 3) roomInfo(객실타입)에 해당하는 container만 필터
  const targetType = (reservationData.roomInfo || '').toLowerCase();
  const filteredContainers = allContainers.filter((c) => {
    // roomInfo, isActive 체크
    const cType = (c.roomInfo || '').toLowerCase();
    return cType === targetType && (c.isActive !== false);
  });

  if (!filteredContainers.length) {
    logger.warn(`[assignRoomNumber] No containers matching roomInfo=${reservationData.roomInfo}`);
    return '';
  }

  // 4) 이미 할당된 객실번호(취소되지 않고, 수동퇴실이 아닌) 목록 조회
  const existingReservations = await ReservationModel.find({
    hotelId,
    isCancelled: false,
    manuallyCheckedOut: false,
    roomNumber: { $ne: '' },
  }).select('roomNumber');

  const assignedSet = new Set(existingReservations.map((r) => r.roomNumber));

  // 5) 객실번호(문자열) 정렬: 숫자/문자 혼합 대비 localeCompare + numeric 옵션
  filteredContainers.sort((a, b) =>
    a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true })
  );

  // 6) 첫 번째로 사용 가능한(이미 배정되지 않은) container를 할당
  for (const cont of filteredContainers) {
    if (!assignedSet.has(cont.roomNumber)) {
      // 사용 가능
      return cont.roomNumber;
    }
  }

  logger.warn(`[assignRoomNumber] 재고 부족: roomInfo=${reservationData.roomInfo}`);
  return '';
};
