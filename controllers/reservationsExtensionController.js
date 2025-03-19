import getReservationModel from '../models/Reservation.js';
import getCanceledReservationModel from '../models/CanceledReservation.js';
import logger from '../utils/logger.js';
import initializeHotelCollection from '../utils/initializeHotelCollection.js';
import availableOTAs from '../config/otas.js';
import { parseDate } from '../utils/dateParser.js';
import { isCancelledStatus } from '../utils/isCancelledStatus.js';
import { format, isSameDay } from 'date-fns';

const emitWebSocketEvent = (io, hotelId, event, data) => {
  if (io) {
    logger.info(`Emitting ${event} for ${hotelId}`);
    io.to(hotelId).emit(event, data);
  }
};

function sanitizePhoneNumber(phoneNumber) {
  if (!phoneNumber) return '';
  return phoneNumber.replace(/\D/g, '');
}

function parsePrice(priceString) {
  if (priceString == null) return 0;
  if (typeof priceString === 'number') return priceString;
  const str = String(priceString);
  const match = str.match(/\d[\d,]*/);
  return match ? parseInt(match[0].replace(/,/g, ''), 10) || 0 : 0;
}

export const createOrUpdateReservationsExtension = async (req, res) => {
  const { siteName, reservations, hotelId } = req.body;
  const finalHotelId = hotelId || req.user?.hotelId;

  if (!siteName || !reservations || !finalHotelId) {
    return res.status(400).send({
      message: 'siteName, reservations, hotelId 필드는 필수입니다.',
    });
  }

  logger.info('Received reservation data:', {
    siteName,
    reservations,
    hotelId,
  });

  try {
    await initializeHotelCollection(finalHotelId);
    const Reservation = getReservationModel(finalHotelId);
    const CanceledReservation = getCanceledReservationModel(finalHotelId);
    const createdReservationIds = [];
    const updatedReservationIds = [];

    for (const reservation of reservations) {
      if (!reservation.reservationNo || reservation.reservationNo === 'N/A') {
        logger.warn(
          'Skipping reservation with invalid reservation number',
          reservation
        );
        continue;
      }

      const reservationId = `${siteName}-${reservation.reservationNo}`;
      logger.debug('Processing reservation:', { reservationId, reservation });

      let checkIn = reservation.checkIn;
      let checkOut =
        reservation.checkOut || `${reservation.checkIn.split(' ')[0]} 11:00`;
      const reservationDate =
        reservation.reservationDate ||
        format(new Date(), "yyyy-MM-dd'T'HH:mm:ss+09:00");

      const parsedCheckIn = await parseDate(checkIn, finalHotelId, true);
      const parsedCheckOut = await parseDate(checkOut, finalHotelId, false);
      if (
        !parsedCheckIn ||
        !parsedCheckOut ||
        new Date(parsedCheckIn) >= new Date(parsedCheckOut)
      ) {
        logger.warn('Skipping reservation with invalid dates', {
          reservationId,
          checkIn,
          checkOut,
          reservationDate,
        });
        continue;
      }

      checkIn = parsedCheckIn;
      checkOut = parsedCheckOut;

      let paymentMethod = '정보 없음';
      if (availableOTAs.includes(siteName)) {
        paymentMethod =
          reservation.paymentMethod && reservation.paymentMethod.trim() !== ''
            ? reservation.paymentMethod.trim()
            : 'OTA';
      } else {
        paymentMethod = reservation.paymentMethod || 'Pending';
      }

      const sanitizedPhoneNumber = sanitizePhoneNumber(
        reservation.phoneNumber || ''
      );

      // roomInfo를 분석하여 type과 duration 설정
      const roomInfo = reservation.roomInfo || '';
      let type = 'stay';
      let duration = null;
      const checkInDate = new Date(parsedCheckIn);
      const checkOutDate = new Date(parsedCheckOut);
      if (
        isSameDay(checkInDate, checkOutDate) ||
        roomInfo.includes('대실') ||
        roomInfo.includes('시간')
      ) {
        type = 'dayUse';
        const durationMatch = roomInfo.match(/(\d+)시간/);
        duration = durationMatch ? parseInt(durationMatch[1], 10) : 3; // 기본값 3시간
      } else if (roomInfo.includes('숙박') || roomInfo.includes('박')) {
        type = 'stay';
      }

      const updateData = {
        siteName,
        customerName: reservation.customerName || 'Unknown',
        phoneNumber: sanitizedPhoneNumber,
        roomInfo: reservation.roomInfo || '',
        originalRoomInfo: reservation.roomInfo || '', // 원본 roomInfo 저장
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
        type,
        duration,
      };

      const cancelled = isCancelledStatus(
        updateData.reservationStatus,
        updateData.customerName,
        updateData.roomInfo,
        reservation.reservationNo
      );
      updateData.isCancelled = cancelled;

      const existingReservation = await Reservation.findById(reservationId);
      const existingCanceled = await CanceledReservation.findById(
        reservationId
      );

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
          logger.info(
            `Moved canceled reservation back to normal: ${reservationId}`
          );
          createdReservationIds.push(reservationId);
          emitWebSocketEvent(
            req.app.get('io'),
            finalHotelId,
            'reservationCreated',
            {
              reservation: newReservation.toObject(),
            }
          );
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
          emitWebSocketEvent(
            req.app.get('io'),
            finalHotelId,
            'reservationDeleted',
            {
              reservationId,
            }
          );
        } else {
          if (availableOTAs.includes(siteName)) {
            updateData.roomNumber = existingReservation.roomNumber;
            updateData.roomInfo = existingReservation.roomInfo;
            updateData.price = existingReservation.price;
          }
          await Reservation.updateOne({ _id: reservationId }, updateData, {
            runValidators: true,
            strict: true,
            overwrite: true,
          });
          logger.info(`Updated reservation: ${reservationId}`);
          updatedReservationIds.push(reservationId);
          const updatedReservation = await Reservation.findById(reservationId);
          if (updatedReservation) {
            emitWebSocketEvent(
              req.app.get('io'),
              finalHotelId,
              'reservationUpdated',
              {
                reservation: updatedReservation.toObject(),
              }
            );
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
          const newReservation = new Reservation({
            _id: reservationId,
            ...updateData,
          });
          await newReservation.save();
          logger.info(`Created new reservation: ${reservationId}`);
          createdReservationIds.push(reservationId);
          emitWebSocketEvent(
            req.app.get('io'),
            finalHotelId,
            'reservationCreated',
            {
              reservation: newReservation.toObject(),
            }
          );
        }
      }
    }

    logger.info(
      `Reservations processed successfully for hotelId: ${finalHotelId}, siteName: ${siteName}, count: ${createdReservationIds.length}, updated: ${updatedReservationIds.length}`,
      { createdReservationIds, updatedReservationIds }
    );

    res.status(201).json({
      message: 'Reservations processed successfully',
      createdReservationIds,
      updatedReservationIds,
    });
  } catch (error) {
    logger.error('Error processing extension reservations:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).send({
        message: '유효성 검사 오류가 발생했습니다.',
        error: error.message,
        details: error.errors,
      });
    }
    res.status(500).send({
      message: '서버 오류가 발생했습니다.',
      error: error.message,
    });
  }
};
