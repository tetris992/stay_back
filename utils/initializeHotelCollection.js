import getReservationModel from '../models/Reservation.js';
import logger from '../utils/logger.js';

// 초기화된 hotelId를 추적하기 위한 Set
const initializedHotels = new Set();

const initializeHotelCollection = async (hotelId) => {
  try {
    // 이미 초기화된 hotelId라면 스킵
    if (initializedHotels.has(hotelId)) {
      logger.debug(`Collection already initialized for hotel: ${hotelId}`);
      return;
    }

    const Reservation = getReservationModel(hotelId);

    // reservationModel.js에서 이미 인덱스를 정의했으므로 별도 인덱스 생성 불필요
    // 필요 시 추가적인 초기화 작업(예: 기본 데이터 삽입)을 여기에 구현

    initializedHotels.add(hotelId);
    logger.info(`Initialized collection for hotel: ${hotelId}`);
  } catch (error) {
    logger.error(`Error initializing collection for hotel ${hotelId}:`, error);
    throw error; // 호출자에게 오류 전달
  }
};

export default initializeHotelCollection;
