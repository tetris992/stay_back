// backend/utils/initializeHotelCollection.js

import getReservationModel from '../models/Reservation.js';

const initializeHotelCollection = async (hotelId) => {
  try {
    const Reservation = getReservationModel(hotelId);

    // 인덱스 추가 (hotelId는 이미 컬렉션이 분리되어 있으므로 제외)
    await Reservation.createIndexes([
      { customerName: 1 },
      { createdAt: -1 },
    ]);

    console.log(`Initialized collection and indexes for hotel: ${hotelId}`);
  } catch (error) {
    console.error(`Error initializing collection for hotel ${hotelId}:`, error);
    throw error; // 호출자에게 오류 전달
  }
};

export default initializeHotelCollection;
