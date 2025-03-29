// // backend/controllers/availabilityController.js
// import getReservationModel from '../models/Reservation.js';
// import HotelSettingsModel from '../models/HotelSettings.js';
// import logger from '../utils/logger.js';
// import { calculateRoomAvailability, getDetailedAvailabilityMessage, computeRemainingInventory } from '../utils/availability.js';

// export const getAvailability = async (req, res) => {
//   const { hotelId, fromDate, toDate } = req.query;

//   if (!hotelId || !fromDate || !toDate) {
//     return res.status(400).json({ message: 'hotelId, fromDate, toDate는 필수입니다.' });
//   }

//   try {
//     const Reservation = getReservationModel(hotelId);
//     const hotelSettings = await HotelSettingsModel.findOne({ hotelId });
//     if (!hotelSettings) {
//       return res.status(404).json({ message: '호텔 설정을 찾을 수 없습니다.' });
//     }

//     const reservations = await Reservation.find({ hotelId, isCancelled: false });
//     const roomTypes = hotelSettings.roomTypes || [];
//     const gridSettings = hotelSettings.gridSettings || null;

//     const availability = calculateRoomAvailability(
//       reservations,
//       roomTypes,
//       fromDate,
//       toDate,
//       gridSettings
//     );

//     res.status(200).json(availability);
//   } catch (error) {
//     logger.error(`Get availability error: ${error.message}`, error);
//     res.status(500).json({ message: '서버 오류가 발생했습니다.', error: error.message });
//   }
// };

// export const getAvailabilityMessage = async (req, res) => {
//   const { hotelId, roomType, rangeStart, rangeEnd } = req.query;

//   if (!hotelId || !roomType || !rangeStart || !rangeEnd) {
//     return res.status(400).json({ message: 'hotelId, roomType, rangeStart, rangeEnd는 필수입니다.' });
//   }

//   try {
//     const Reservation = getReservationModel(hotelId);
//     const hotelSettings = await HotelSettingsModel.findOne({ hotelId });
//     if (!hotelSettings) {
//       return res.status(404).json({ message: '호텔 설정을 찾을 수 없습니다.' });
//     }

//     const reservations = await Reservation.find({ hotelId, isCancelled: false });
//     const roomTypes = hotelSettings.roomTypes || [];
//     const gridSettings = hotelSettings.gridSettings || null;

//     const availability = calculateRoomAvailability(
//       reservations,
//       roomTypes,
//       rangeStart,
//       rangeEnd,
//       gridSettings
//     );

//     const message = getDetailedAvailabilityMessage(
//       new Date(rangeStart),
//       new Date(rangeEnd),
//       roomType.toLowerCase(),
//       availability
//     );

//     res.status(200).json({ message });
//   } catch (error) {
//     logger.error(`Get availability message error: ${error.message}`, error);
//     res.status(500).json({ message: '서버 오류가 발생했습니다.', error: error.message });
//   }
// };

// export const getRemainingInventory = async (req, res) => {
//   const { hotelId } = req.query;

//   if (!hotelId) {
//     return res.status(400).json({ message: 'hotelId는 필수입니다.' });
//   }

//   try {
//     const Reservation = getReservationModel(hotelId);
//     const hotelSettings = await HotelSettingsModel.findOne({ hotelId });
//     if (!hotelSettings) {
//       return res.status(404).json({ message: '호텔 설정을 찾을 수 없습니다.' });
//     }

//     const reservations = await Reservation.find({ hotelId, isCancelled: false });
//     const roomTypes = hotelSettings.roomTypes || [];

//     const remainingInventory = computeRemainingInventory(roomTypes, reservations);

//     res.status(200).json(remainingInventory);
//   } catch (error) {
//     logger.error(`Get remaining inventory error: ${error.message}`, error);
//     res.status(500).json({ message: '서버 오류가 발생했습니다.', error: error.message });
//   }
// };