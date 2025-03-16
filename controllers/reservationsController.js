import getReservationModel from '../models/Reservation.js';
import getCanceledReservationModel from '../models/CanceledReservation.js';
import logger from '../utils/logger.js';
import initializeHotelCollection from '../utils/initializeHotelCollection.js';
import availableOTAs from '../config/otas.js';
import { isCancelledStatus } from '../utils/isCancelledStatus.js';
import { format, startOfDay, addHours } from 'date-fns';
import { checkConflict } from '../utils/checkConflict.js';
import HotelSettingsModel from '../models/HotelSettings.js';
import { sendReservationNotification } from '../utils/sendAlimtalk.js';

// 헬퍼 함수
const sanitizePhoneNumber = (phoneNumber) =>
  phoneNumber ? phoneNumber.replace(/\D/g, '') : '';
const parsePrice = (priceString) => {
  if (priceString == null) return 0;
  if (typeof priceString === 'number') return priceString;
  const match = String(priceString).match(/\d[\d,]*/);
  return match ? parseInt(match[0].replace(/,/g, ''), 10) || 0 : 0;
};

function getShortReservationNumber(reservationId) {
  const prefix = '현장예약-';
  if (reservationId.startsWith(prefix)) {
    const uuidPart = reservationId.substring(prefix.length);
    return `${prefix}${uuidPart.slice(0, 8)}`;
  }
  return reservationId.slice(0, 13);
}

async function assignRoomNumber(updateData, finalHotelId, Reservation) {
  if (updateData.roomNumber) return updateData.roomNumber;

  const hotelSettings = await HotelSettingsModel.findOne({
    hotelId: finalHotelId,
  });
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

  const desiredCheckIn = new Date(updateData.checkIn);
  const desiredCheckOut = new Date(updateData.checkOut);

  for (const container of containers) {
    const overlappingReservations = await Reservation.find({
      roomNumber: container.roomNumber,
      isCancelled: false,
      $or: [
        { checkIn: { $lt: desiredCheckOut.toISOString() } },
        { checkOut: { $gt: desiredCheckIn.toISOString() } },
      ],
    });

    if (!overlappingReservations.length) return container.roomNumber;
  }

  logger.warn(
    `재고 부족: ${updateData.roomInfo} 객실이 ${format(
      desiredCheckIn,
      'yyyy-MM-dd'
    )} ~ ${format(desiredCheckOut, 'yyyy-MM-dd')} 사이에 모두 예약됨.`
  );
  return '';
}

export const getReservations = async (req, res) => {
  const { name, hotelId } = req.query;

  if (!hotelId) return res.status(400).send({ message: 'hotelId is required' });

  const Reservation = getReservationModel(hotelId);
  const filter = { isCancelled: false };
  if (name) filter.customerName = { $regex: new RegExp(`^${name}$`, 'i') };

  try {
    const reservations = await Reservation.find(filter).sort({ createdAt: -1 });
    const plain = reservations.map((doc) => doc.toObject());
    res.send(plain);
  } catch (error) {
    logger.error('Error fetching reservations:', error);
    res.status(500).send({ message: '서버 오류가 발생했습니다.' });
  }
};

export const createOrUpdateReservations = async (req, res) => {
  const { siteName, reservations, hotelId } = req.body;
  const finalHotelId = hotelId || req.user?.hotelId;

  if (!siteName || !reservations || !finalHotelId) {
    return res.status(400).send({ message: 'siteName, reservations, hotelId 필드는 필수입니다.' });
  }

  try {
    await initializeHotelCollection(finalHotelId);
    const Reservation = getReservationModel(finalHotelId);
    const CanceledReservation = getCanceledReservationModel(finalHotelId);
    const createdReservationIds = [];
    const hotelSettings = await HotelSettingsModel.findOne({ hotelId: finalHotelId });

    for (const reservation of reservations) {
      if (!reservation.reservationNo || reservation.reservationNo === 'N/A') {
        logger.warn('Skipping reservation with invalid reservation number', reservation);
        continue;
      }

      const reservationId = `${siteName}-${reservation.reservationNo}`;
      let checkIn, checkOut, reservationDate;

      if (siteName === '현장예약') {
        const checkInTime = hotelSettings?.checkInTime || '15:00';
        const checkOutTime = hotelSettings?.checkOutTime || '11:00';
        const now = new Date();

        if (reservation.type === 'dayUse') {
          checkIn = format(now, "yyyy-MM-dd'T'HH:mm:ss+09:00");
          checkOut = format(addHours(now, reservation.duration || 4), "yyyy-MM-dd'T'HH:mm:ss+09:00");
        } else {
          checkIn = `${reservation.checkInDate}T${checkInTime}:00+09:00`;
          checkOut = `${reservation.checkOutDate}T${checkOutTime}:00+09:00`;
        }
        reservationDate = format(now, "yyyy-MM-dd'T'HH:mm:ss+09:00");
      } else {
        checkIn = reservation.checkIn;
        checkOut = reservation.checkOut || `${reservation.checkIn.split(' ')[0]}T11:00:00+09:00`;
        reservationDate = reservation.reservationDate || format(new Date(), "yyyy-MM-dd'T'HH:mm:ss+09:00");
      }

      if (!checkIn || !checkOut || checkIn >= checkOut) {
        logger.warn('Skipping reservation with invalid dates', reservation);
        continue;
      }

      logger.debug('Data before save:', { reservationId, checkIn, checkOut });

      const paymentMethod = availableOTAs.includes(siteName)
        ? reservation.paymentMethod?.trim() || 'OTA'
        : siteName === '현장예약'
        ? reservation.paymentMethod || 'Pending'
        : reservation.paymentMethod || 'Pending';

      const updateData = {
        siteName,
        customerName: reservation.customerName,
        phoneNumber: sanitizePhoneNumber(reservation.phoneNumber),
        roomInfo: reservation.roomInfo,
        checkIn,
        checkOut,
        reservationDate,
        reservationStatus: reservation.reservationStatus || 'Pending',
        price: parsePrice(reservation.price),
        specialRequests: reservation.specialRequests || null,
        additionalFees: reservation.additionalFees || 0,
        couponInfo: reservation.couponInfo || null,
        paymentStatus: reservation.paymentStatus || '확인 필요',
        paymentMethod,
        hotelId: finalHotelId,
        type: reservation.type || 'stay', // type 추가
        duration: reservation.type === 'dayUse' ? (reservation.duration || 4) : null, // duration 추가
      };

      const cancelled = isCancelledStatus(
        updateData.reservationStatus,
        updateData.customerName,
        updateData.roomInfo,
        reservation.reservationNo
      );
      updateData.isCancelled = cancelled;

      const existingReservation = await Reservation.findById(reservationId);
      const existingCanceled = await CanceledReservation.findById(reservationId);

      if (existingCanceled) {
        if (cancelled) {
          await CanceledReservation.updateOne(
            { _id: reservationId },
            updateData,
            { runValidators: true, strict: true, overwrite: true }
          );
          logger.info(`Updated canceled reservation: ${reservationId}`);
        } else {
          await CanceledReservation.deleteOne({ _id: reservationId });
          const newReservation = new Reservation({
            _id: reservationId,
            ...updateData,
            isCancelled: false,
          });
          await newReservation.save();
          logger.info(`Moved canceled reservation back to normal: ${reservationId}`);
          createdReservationIds.push(reservationId);

          if (req.app.get('io')) {
            req.app.get('io').to(finalHotelId).emit('reservationCreated', {
              reservation: newReservation.toObject(),
            });
          }

          // 숙박 예약 생성 시 알림톡 전송
          if (siteName === '현장예약' && updateData.type === 'stay') {
            try {
              const shortReservationNumber = getShortReservationNumber(newReservation._id);
              await sendReservationNotification(
                newReservation.toObject(),
                finalHotelId,
                'create',
                getShortReservationNumber
              );
              logger.info(`알림톡 전송 성공 (생성): ${shortReservationNumber}`);
            } catch (err) {
              logger.error(`알림톡 전송 실패 (생성, ID: ${getShortReservationNumber(newReservation._id)}):`, err);
            }
          }
        }
        continue;
      }

      if (existingReservation) {
        if (cancelled) {
          await Reservation.deleteOne({ _id: reservationId });
          const newCanceled = new CanceledReservation({
            _id: reservationId,
            ...updateData,
          });
          await newCanceled.save();
          logger.info(`Moved reservation to canceled: ${reservationId}`);

          if (req.app.get('io')) {
            req.app.get('io').to(finalHotelId).emit('reservationDeleted', { reservationId });
          }

          // 숙박 예약 취소 시 알림톡 전송
          if (siteName === '현장예약' && existingReservation.type === 'stay') {
            try {
              const shortReservationNumber = getShortReservationNumber(existingReservation._id);
              await sendReservationNotification(
                existingReservation.toObject(),
                finalHotelId,
                'cancel',
                getShortReservationNumber
              );
              logger.info(`알림톡 전송 성공 (취소): ${shortReservationNumber}`);
            } catch (err) {
              logger.error(
                `알림톡 전송 실패 (취소, ID: ${getShortReservationNumber(existingReservation._id)}):`,
                err
              );
            }
          }
        } else {
          if (availableOTAs.includes(siteName)) {
            updateData.roomNumber = existingReservation.roomNumber;
            updateData.roomInfo = existingReservation.roomInfo;
            updateData.price = existingReservation.price;
          }
          const allReservations = await Reservation.find({
            hotelId,
            isCancelled: false,
          });
          const { isConflict, conflictReservation = {} } = checkConflict(
            { ...updateData, _id: reservationId },
            updateData.roomNumber || existingReservation.roomNumber,
            allReservations,
            reservationId
          );
          if (isConflict) {
            const conflictCheckIn = conflictReservation.checkIn
              ? format(new Date(conflictReservation.checkIn), 'yyyy-MM-dd HH:mm')
              : '정보 없음';
            const conflictCheckOut = conflictReservation.checkOut
              ? format(new Date(conflictReservation.checkOut), 'yyyy-MM-dd HH:mm')
              : '정보 없음';
            return res.status(409).send({
              message: `객실 ${
                updateData.roomNumber || existingReservation.roomNumber
              }은 이미 예약이 존재합니다.\n충돌 예약자: ${
                conflictReservation.customerName || '정보 없음'
              }\n예약 기간: ${conflictCheckIn} ~ ${conflictCheckOut}`,
              conflictingReservation: conflictReservation,
            });
          }

          await Reservation.updateOne(
            { _id: reservationId },
            updateData,
            { runValidators: true, strict: true, overwrite: true }
          );
          logger.info(`Updated reservation: ${reservationId}`);

          const updatedReservation = await Reservation.findById(reservationId);
          if (req.app.get('io') && updatedReservation) {
            req.app.get('io').to(finalHotelId).emit('reservationUpdated', {
              reservation: updatedReservation.toObject(),
            });
          }
        }
      } else {
        if (cancelled) {
          const newCanceled = new CanceledReservation({
            _id: reservationId,
            ...updateData,
          });
          await newCanceled.save();
          logger.info(`Created new canceled reservation: ${reservationId}`);
        } else {
          if (!reservation.roomNumber || reservation.roomNumber.trim() === '') {
            updateData.roomNumber = await assignRoomNumber(updateData, finalHotelId, Reservation);
          } else {
            updateData.roomNumber = reservation.roomNumber;
          }
          const allReservations = await Reservation.find({
            hotelId,
            isCancelled: false,
          });
          const { isConflict, conflictReservation = {} } = checkConflict(
            { ...updateData, _id: reservationId },
            updateData.roomNumber,
            allReservations
          );
          if (isConflict) {
            const conflictCheckIn = conflictReservation.checkIn
              ? format(new Date(conflictReservation.checkIn), 'yyyy-MM-dd HH:mm')
              : '정보 없음';
            const conflictCheckOut = conflictReservation.checkOut
              ? format(new Date(conflictReservation.checkOut), 'yyyy-MM-dd HH:mm')
              : '정보 없음';
            return res.status(409).send({
              message: `객실 ${updateData.roomNumber}은 이미 예약이 존재합니다.\n충돌 예약자: ${
                conflictReservation.customerName || '정보 없음'
              }\n예약 기간: ${conflictCheckIn} ~ ${conflictCheckOut}`,
              conflictingReservation: conflictReservation,
            });
          }

          const newReservation = new Reservation({
            _id: reservationId,
            ...updateData,
          });
          await newReservation.save();
          logger.info(`Created new reservation: ${reservationId}`);
          createdReservationIds.push(reservationId);

          if (req.app.get('io')) {
            req.app.get('io').to(finalHotelId).emit('reservationCreated', {
              reservation: newReservation.toObject(),
            });
          }

          // 숙박 예약 생성 시 알림톡 전송
          if (siteName === '현장예약' && updateData.type === 'stay') {
            try {
              const shortReservationNumber = getShortReservationNumber(newReservation._id);
              await sendReservationNotification(
                newReservation.toObject(),
                finalHotelId,
                'create',
                getShortReservationNumber
              );
              logger.info(`알림톡 전송 성공 (생성): ${shortReservationNumber}`);
            } catch (err) {
              logger.error(`알림톡 전송 실패 (생성, ID: ${getShortReservationNumber(newReservation._id)}):`, err);
            }
          }
        }
      }
    }

    logger.info(
      `Reservations processed successfully for ${finalHotelId}, ${siteName}, count: ${createdReservationIds.length}`,
      { createdReservationIds }
    );
    res.status(201).json({
      message: 'Reservations processed successfully',
      createdReservationIds,
    });
  } catch (error) {
    logger.error('Error processing reservations:', error);
    res.status(500).send({ message: '서버 오류가 발생했습니다.' });
  }
};

export const deleteReservation = async (req, res) => {
  const { reservationId } = req.params;
  const { hotelId, siteName } = req.query;

  if (!reservationId || !hotelId || !siteName) {
    return res
      .status(400)
      .send({ message: 'reservationId, hotelId, siteName는 필수입니다.' });
  }

  try {
    const Reservation = getReservationModel(hotelId);
    const reservation = await Reservation.findOne({
      _id: reservationId,
      hotelId,
      siteName,
    });

    if (!reservation)
      return res.status(404).send({ message: '해당 예약을 찾을 수 없습니다.' });

    if (req.app.get('io')) {
      req.app
        .get('io')
        .to(hotelId)
        .emit('reservationDeleted', { reservationId });
    }

    // 숙박 예약 삭제 시 알림톡 전송
    if (siteName === '현장예약' && reservation.type === 'stay') {
      try {
        const shortReservationNumber = getShortReservationNumber(reservation._id);
        await sendReservationNotification(
          reservation.toObject(),
          hotelId,
          'cancel',
          getShortReservationNumber
        );
        logger.info(`알림톡 전송 성공 (취소): ${shortReservationNumber}`);
      } catch (err) {
        logger.error(
          `알림톡 전송 실패 (취소, ID: ${getShortReservationNumber(reservation._id)}):`,
          err
        );
      }
    }

    await Reservation.deleteOne({ _id: reservationId });
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting reservation:', error);
    res.status(500).send({ message: '서버 오류가 발생했습니다.' });
  }
};

export const confirmReservation = async (req, res) => {
  const { reservationId } = req.params;
  const { hotelId } = req.body;

  if (!reservationId || !hotelId) {
    return res
      .status(400)
      .send({ message: 'reservationId와 hotelId는 필수입니다.' });
  }

  try {
    const Reservation = getReservationModel(hotelId);
    const reservation = await Reservation.findOne({
      _id: reservationId,
      hotelId,
    });

    if (!reservation)
      return res.status(404).send({ message: '예약을 찾을 수 없습니다.' });
    if (reservation.reservationStatus === 'confirmed') {
      return res.status(400).send({ message: '이미 확정된 예약입니다.' });
    }

    reservation.reservationStatus = 'confirmed';
    const savedReservation = await reservation.save();

    if (req.app.get('io')) {
      req.app.get('io').to(hotelId).emit('reservationUpdated', {
        reservation: savedReservation.toObject(),
      });
    }

    res.status(200).send({
      message: '예약이 성공적으로 확정되었습니다.',
      reservation: savedReservation.toObject(),
    });
  } catch (error) {
    logger.error('Error confirming reservation:', error);
    res.status(500).send({ message: '서버 오류가 발생했습니다.' });
  }
};

export const updateReservation = async (req, res) => {
  const { reservationId } = req.params;
  const { hotelId, roomNumber, ...updateData } = req.body;

  if (!hotelId)
    return res.status(400).send({ message: 'hotelId는 필수입니다.' });
  if (!reservationId)
    return res.status(400).send({ message: 'reservationId는 필수입니다.' });

  try {
    const Reservation = getReservationModel(hotelId);
    const reservation = await Reservation.findOne({
      _id: reservationId,
      hotelId,
    });

    if (!reservation)
      return res.status(404).send({ message: '예약을 찾을 수 없습니다.' });

    const originalRoomNumber = reservation.roomNumber;
    const newRoomNumber = roomNumber || updateData.roomNumber;

    if (newRoomNumber && !newRoomNumber.trim()) {
      return res
        .status(400)
        .send({ message: '유효한 객실 번호를 입력하세요.' });
    }

    // 퇴실 처리 체크
    if (updateData.manuallyCheckedOut === true) {
      reservation.manuallyCheckedOut = true;
      // 퇴실 후 방 비우기 (필요 시 roomNumber 초기화)
      reservation.roomNumber = '';
      logger.info(`Reservation ${reservationId} marked as manually checked out`);
    } else if (newRoomNumber && newRoomNumber !== reservation.roomNumber) {
      const allReservations = await Reservation.find({
        hotelId,
        isCancelled: false,
        manuallyCheckedOut: false, // 퇴실된 예약 제외
      });
      const reservationDataForConflict = {
        ...reservation.toObject(),
        ...updateData,
        roomNumber: newRoomNumber,
        _id: reservationId,
      };
      const { isConflict, conflictReservation = {} } = checkConflict(
        reservationDataForConflict,
        newRoomNumber,
        allReservations,
        reservationId
      );

      if (isConflict) {
        const conflictCheckIn = conflictReservation.checkIn
          ? format(new Date(conflictReservation.checkIn), 'yyyy-MM-dd HH:mm')
          : '정보 없음';
        const conflictCheckOut = conflictReservation.checkOut
          ? format(new Date(conflictReservation.checkOut), 'yyyy-MM-dd HH:mm')
          : '정보 없음';
        return res.status(409).send({
          message: `해당 객실(${newRoomNumber})은 이미 예약이 존재합니다.\n충돌 예약자: ${
            conflictReservation.customerName || '정보 없음'
          }\n예약 기간: ${conflictCheckIn} ~ ${conflictCheckOut}`,
          conflictingReservation: conflictReservation,
        });
      }
    }

    Object.keys(updateData).forEach((key) => {
      reservation[key] = updateData[key];
    });
    if (newRoomNumber) reservation.roomNumber = newRoomNumber;

    const savedReservation = await reservation.save();

    if (
      originalRoomNumber !== savedReservation.roomNumber &&
      savedReservation.roomNumber
    ) {
      logger.info(`[updateReservation] ${reservationId} updated:`, {
        roomChange: {
          before: originalRoomNumber || 'Unassigned',
          after: savedReservation.roomNumber,
        },
        reservation: savedReservation.toObject(),
      });
    }

    if (req.app.get('io')) {
      req.app.get('io').to(hotelId).emit('reservationUpdated', {
        reservation: savedReservation.toObject(),
      });
    }

    res.status(200).send({
      message: '예약이 성공적으로 업데이트되었습니다.',
      reservation: savedReservation.toObject(),
    });
  } catch (error) {
    logger.error('예약 수정 중 오류 발생:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).send({
        message: '유효성 검사 오류가 발생했습니다.',
        details: error.errors,
      });
    }
    res.status(500).send({ message: '서버 오류가 발생했습니다.' });
  }
};

export const getCanceledReservations = async (req, res) => {
  const { hotelId } = req.query;

  if (!hotelId)
    return res.status(400).send({ message: 'hotelId는 필수입니다.' });

  const CanceledReservation = getCanceledReservationModel(hotelId);

  try {
    const canceledReservations = await CanceledReservation.find();
    const plain = canceledReservations.map((doc) => doc.toObject());
    res.status(200).send(plain);
  } catch (error) {
    logger.error('취소된 예약 가져오는 중 오류 발생:', error);
    res.status(500).send({ message: '서버 오류가 발생했습니다.' });
  }
};