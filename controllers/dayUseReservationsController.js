import getReservationModel from '../models/Reservation.js';
import logger from '../utils/logger.js';
import initializeHotelCollection from '../utils/initializeHotelCollection.js';
import { format, startOfDay, addHours } from 'date-fns';
import { checkConflict } from '../utils/checkConflict.js'; // 이름 변경
import HotelSettingsModel from '../models/HotelSettings.js';

// 헬퍼 함수
const sanitizePhoneNumber = (phoneNumber) =>
  phoneNumber ? phoneNumber.replace(/\D/g, '') : '';
const parsePrice = (priceString) => {
  if (priceString == null) return 0;
  if (typeof priceString === 'number') return priceString;
  const match = String(priceString).match(/\d[\d,]*/);
  return match ? parseInt(match[0].replace(/,/g, ''), 10) || 0 : 0;
};

async function assignRoomNumber(updateData, finalHotelId, Reservation) {
  if (updateData.roomNumber) return updateData.roomNumber;

  const hotelSettings = await HotelSettingsModel.findOne({ hotelId: finalHotelId });
  if (!hotelSettings?.gridSettings?.containers) {
    logger.warn('Hotel settings or gridSettings.containers not found.');
    return '';
  }

  const containers = hotelSettings.gridSettings.containers.filter(
    (c) => c.roomInfo.toLowerCase() === updateData.roomInfo.toLowerCase()
  );

  containers.sort((a, b) =>
    a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true })
  );

  const desiredCheckIn = new Date(updateData.checkIn + (updateData.checkIn.includes('+') ? '' : '+09:00'));
  const desiredCheckOut = new Date(updateData.checkOut + (updateData.checkOut.includes('+') ? '' : '+09:00'));

  for (const container of containers) {
    const overlappingReservations = await Reservation.find({
      roomNumber: container.roomNumber,
      isCancelled: false,
      $or: [
        { checkIn: { $lt: desiredCheckOut } },
        { checkOut: { $gt: desiredCheckIn } },
      ],
    });

    if (!overlappingReservations.length) return container.roomNumber;
  }

  logger.warn(
    `재고 부족: ${updateData.roomInfo} 객실이 ${format(desiredCheckIn, 'yyyy-MM-dd')} ~ ${format(desiredCheckOut, 'yyyy-MM-dd')} 사이에 모두 예약됨.`
  );
  return '';
}

export const createDayUseReservation = async (req, res) => {
  const { siteName, reservation, hotelId } = req.body;
  const finalHotelId = hotelId || req.user?.hotelId;

  if (!siteName || !reservation || !finalHotelId) {
    return res.status(400).send({ message: 'siteName, reservation, hotelId 필드는 필수입니다.' });
  }

  try {
    await initializeHotelCollection(finalHotelId);
    const Reservation = getReservationModel(finalHotelId);

    const reservationId = `${siteName}-${reservation.reservationNo || Date.now()}`;
    const now = new Date();
    const checkIn = format(now, "yyyy-MM-dd'T'HH:mm:ss+09:00");
    const checkOut = format(addHours(now, reservation.duration || 4), "yyyy-MM-dd'T'HH:mm:ss+09:00");

    const updateData = {
      siteName,
      customerName: reservation.customerName || `대실:${format(now, 'HH:mm:ss')}`,
      phoneNumber: sanitizePhoneNumber(reservation.phoneNumber),
      roomInfo: reservation.roomInfo,
      checkIn, // 문자열로 저장
      checkOut, // 문자열로 저장
      reservationDate: format(now, "yyyy-MM-dd'T'HH:mm:ss+09:00"), // 문자열로 저장
      reservationStatus: 'Pending',
      price: parsePrice(reservation.price),
      specialRequests: reservation.specialRequests || null,
      additionalFees: reservation.additionalFees || 0,
      couponInfo: reservation.couponInfo || null,
      paymentStatus: '확인 필요',
      paymentMethod: reservation.paymentMethod || 'Pending',
      hotelId: finalHotelId,
      type: 'dayUse',
      duration: reservation.duration || 4,
    };

    updateData.roomNumber = await assignRoomNumber(updateData, finalHotelId, Reservation);

    const allReservations = await Reservation.find({ hotelId: finalHotelId, isCancelled: false });
    const { isConflict, conflictReservation } = checkConflict(
      { ...updateData, _id: reservationId },
      updateData.roomNumber,
      allReservations
    );

    if (isConflict) {
      const conflictCheckIn = format(new Date(conflictReservation.checkIn), 'yyyy-MM-dd HH:mm');
      const conflictCheckOut = format(new Date(conflictReservation.checkOut), 'yyyy-MM-dd HH:mm');
      return res.status(409).send({
        message: `객실 ${updateData.roomNumber}은 이미 예약이 존재합니다.\n충돌 예약자: ${conflictReservation.customerName}\n예약 기간: ${conflictCheckIn} ~ ${conflictCheckOut}`,
        conflictingReservation,
      });
    }

    const newReservation = new Reservation({
      _id: reservationId,
      ...updateData,
      isCancelled: false,
    });
    await newReservation.save();

    if (req.app.get('io')) {
      logger.info(`Emitting reservationCreated for ${finalHotelId}, ${reservationId}`);
      req.app.get('io').to(finalHotelId).emit('reservationCreated', {
        reservation: newReservation.toObject(),
      });
    }

    res.status(201).json({
      message: 'Day use reservation created successfully',
      reservationId,
    });
  } catch (error) {
    logger.error('Error creating day use reservation:', error);
    res.status(500).send({ message: '서버 오류가 발생했습니다.' });
  }
};

export const deleteDayUseReservation = async (req, res) => {
  const { reservationId } = req.params;
  const { hotelId, siteName } = req.query;
  const finalHotelId = hotelId || req.user?.hotelId;

  if (!reservationId || !siteName || !finalHotelId) {
    return res.status(400).send({ message: 'reservationId, siteName, hotelId는 필수입니다.' });
  }

  try {
    const Reservation = getReservationModel(finalHotelId);
    const reservation = await Reservation.findOne({
      _id: reservationId,
      hotelId: finalHotelId,
      siteName,
      type: 'dayUse',
    });

    if (!reservation) {
      return res.status(404).send({ message: '해당 대실 예약을 찾을 수 없습니다.' });
    }

    if (req.app.get('io')) {
      logger.info(`Emitting reservationDeleted for ${finalHotelId}, ${reservationId}`);
      req.app.get('io').to(finalHotelId).emit('reservationDeleted', { reservationId });
    }

    await Reservation.deleteOne({ _id: reservationId });
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting day use reservation:', error);
    res.status(500).send({ message: '서버 오류가 발생했습니다.' });
  }
};

export const updateDayUseReservation = async (req, res) => {
  const { reservationId } = req.params;
  const { reservation, hotelId } = req.body;
  const finalHotelId = hotelId || req.user?.hotelId;

  if (!reservationId || !reservation || !finalHotelId) {
    return res.status(400).send({ message: 'reservationId, reservation, hotelId는 필수입니다.' });
  }

  try {
    const Reservation = getReservationModel(finalHotelId);
    const existingReservation = await Reservation.findOne({
      _id: reservationId,
      hotelId: finalHotelId,
      type: 'dayUse',
    });

    if (!existingReservation) {
      return res.status(404).send({ message: '해당 대실 예약을 찾을 수 없습니다.' });
    }

    const now = new Date();
    const updatedCheckIn = existingReservation.checkIn; // 기존 체크인 유지
    const updatedCheckOut = format(
      addHours(new Date(updatedCheckIn), reservation.duration || existingReservation.duration || 4),
      "yyyy-MM-dd'T'HH:mm:ss+09:00"
    );

    const updateData = {
      siteName: reservation.siteName || existingReservation.siteName,
      customerName: reservation.customerName || existingReservation.customerName,
      phoneNumber: sanitizePhoneNumber(reservation.phoneNumber) || existingReservation.phoneNumber,
      roomInfo: reservation.roomInfo || existingReservation.roomInfo,
      checkIn: updatedCheckIn, // 문자열로 유지
      checkOut: updatedCheckOut, // 문자열로 저장
      reservationDate: format(now, "yyyy-MM-dd'T'HH:mm:ss+09:00"), // 문자열로 저장
      reservationStatus: reservation.reservationStatus || existingReservation.reservationStatus || 'Pending',
      price: parsePrice(reservation.price) || existingReservation.price,
      specialRequests: reservation.specialRequests || existingReservation.specialRequests || null,
      additionalFees: reservation.additionalFees || existingReservation.additionalFees || 0,
      couponInfo: reservation.couponInfo || existingReservation.couponInfo || null,
      paymentStatus: reservation.paymentStatus || existingReservation.paymentStatus || '확인 필요',
      paymentMethod: reservation.paymentMethod || existingReservation.paymentMethod || 'Pending',
      hotelId: finalHotelId,
      type: 'dayUse',
      duration: reservation.duration || existingReservation.duration || 4,
    };

    const originalRoomNumber = existingReservation.roomNumber;
    updateData.roomNumber = reservation.roomNumber || (await assignRoomNumber(updateData, finalHotelId, Reservation));

    const allReservations = await Reservation.find({ hotelId: finalHotelId, isCancelled: false });
    const { isConflict, conflictingReservation } = checkConflict(
      { ...updateData, _id: reservationId },
      updateData.roomNumber,
      allReservations,
      reservationId
    );

    if (isConflict) {
      const conflictCheckIn = format(new Date(conflictingReservation.checkIn), 'yyyy-MM-dd HH:mm');
      const conflictCheckOut = format(new Date(conflictingReservation.checkOut), 'yyyy-MM-dd HH:mm');
      return res.status(409).send({
        message: `해당 객실(${updateData.roomNumber})은 이미 예약이 존재합니다.\n충돌 예약자: ${conflictingReservation.customerName}\n예약 기간: ${conflictCheckIn} ~ ${conflictCheckOut}`,
        conflictingReservation,
      });
    }

    await Reservation.updateOne({ _id: reservationId }, updateData, {
      runValidators: true,
      strict: true,
      overwrite: true,
    });

    const updatedReservation = await Reservation.findById(reservationId);

    if (req.app.get('io')) {
      logger.info(`Emitting reservationUpdated for ${finalHotelId}, ${reservationId}`);
      req.app.get('io').to(finalHotelId).emit('reservationUpdated', {
        reservation: updatedReservation.toObject(),
      });
    }

    res.status(200).send({
      message: 'Day use reservation updated successfully',
      reservation: updatedReservation.toObject(),
    });
  } catch (error) {
    logger.error('Error updating day use reservation:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).send({
        message: '유효성 검사 오류가 발생했습니다.',
        details: error.errors,
      });
    }
    res.status(500).send({ message: '서버 오류가 발생했습니다.' });
  }
};

export const getDayUseReservations = async (req, res) => {
  const { hotelId } = req.query;
  const finalHotelId = hotelId || req.user?.hotelId;

  if (!finalHotelId) {
    return res.status(400).send({ message: 'hotelId는 필수입니다.' });
  }

  try {
    const Reservation = getReservationModel(finalHotelId);
    const reservations = await Reservation.find({
      hotelId: finalHotelId,
      type: 'dayUse',
      isCancelled: false,
    }).sort({ createdAt: -1 });

    const plain = reservations.map((doc) => doc.toObject()); // 문자열 그대로 반환
    res.send(plain);
  } catch (error) {
    logger.error('Error fetching day use reservations:', error);
    res.status(500).send({ message: '서버 오류가 발생했습니다.' });
  }
};