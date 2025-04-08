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
import { assignRoomNumber } from '../utils/roomGridUtils.js';

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

const processPayment = async (reservation, payments, hotelId, req) => {
  const totalAmount = payments.reduce(
    (sum, payment) => sum + payment.amount,
    0
  );

  if (totalAmount <= 0) {
    logger.warn(`[processPayment] Invalid total amount: ${totalAmount}`);
    throw new Error('결제 금액은 0보다 커야 합니다.');
  }

  const newRemainingBalance =
    (reservation.remainingBalance || reservation.price || 0) - totalAmount;

  if (newRemainingBalance < 0) {
    logger.warn(
      `[processPayment] Negative remaining balance: ${newRemainingBalance}`
    );
    throw new Error('잔액이 음수가 될 수 없습니다.');
  }

  const now = new Date();
  const paymentDate = format(now, 'yyyy-MM-dd');
  const paymentTimestamp = format(now, "yyyy-MM-dd'T'HH:mm:ss+09:00");

  const newPayments = payments.map((payment) => ({
    date: paymentDate,
    amount: Number(payment.amount),
    timestamp: paymentTimestamp,
    method: payment.method || 'Cash',
  }));

  const updatedPaymentHistory = [
    ...(reservation.paymentHistory || []),
    ...newPayments,
  ];
  reservation.paymentHistory = updatedPaymentHistory;
  reservation.remainingBalance = newRemainingBalance;

  // paymentMethod 업데이트 (마지막 결제 방법으로 설정)
  reservation.paymentMethod =
    newPayments[newPayments.length - 1].method ||
    reservation.paymentMethod ||
    'Pending';

  const savedReservation = await reservation.save();

  if (req.app.get('io')) {
    req.app.get('io').to(hotelId).emit('reservationUpdated', {
      reservation: savedReservation.toObject(),
    });
  }

  return savedReservation;
};

export const getReservations = async (req, res) => {
  const { name, hotelId } = req.query;

  const user = req.user || req.customer;
  if (!user) {
    return res.status(401).json({ message: 'Unauthorized, user not found' });
  }

  const finalHotelId = req.user ? req.user.hotelId : hotelId;
  if (!finalHotelId) {
    return res.status(400).send({ message: 'hotelId is required' });
  }

  const Reservation = getReservationModel(finalHotelId);
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
  const { siteName, reservations, hotelId, selectedDate } = req.body;
  const user = req.user || req.customer;
  if (!user) {
    return res.status(401).json({ message: 'Unauthorized, user not found' });
  }

  const finalHotelId = req.user ? req.user.hotelId : hotelId;
  if (!siteName || !reservations || !finalHotelId) {
    return res
      .status(400)
      .send({ message: 'siteName, reservations, hotelId 필드는 필수입니다.' });
  }
  if (!selectedDate) {
    return res.status(400).send({ message: 'selectedDate는 필수입니다.' });
  }

  try {
    await initializeHotelCollection(finalHotelId);
    const Reservation = getReservationModel(finalHotelId);
    const CanceledReservation = getCanceledReservationModel(finalHotelId);
    const createdReservationIds = [];

    const hotelSettings = await HotelSettingsModel.findOne({
      hotelId: finalHotelId,
    });

    for (const reservation of reservations) {
      if (!reservation.reservationNo || reservation.reservationNo === 'N/A') {
        logger.warn(
          'Skipping reservation with invalid reservation number',
          reservation
        );
        continue;
      }

      const reservationId = `${siteName}-${reservation.reservationNo}`;
      let checkIn, checkOut, reservationDate;

      // "판매보류", "판매중지", "판매중단", "판매금지" 여부 확인
      const isSoldOut = [
        '판매보류',
        '판매중지',
        '판매중단',
        '판매금지',
      ].includes(reservation.customerName?.trim());

      if (siteName === '현장예약') {
        const checkInTime = hotelSettings?.checkInTime || '15:00';
        const checkOutTime = hotelSettings?.checkOutTime || '11:00';
        const now = new Date();

        if (reservation.type === 'dayUse') {
          checkIn = reservation.checkIn;
          checkOut = reservation.checkOut;

          const checkInDate = new Date(checkIn);
          const checkOutDate = new Date(checkOut);
          if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
            logger.warn(
              'Invalid checkIn or checkOut date for dayUse reservation',
              reservation
            );
            return res
              .status(400)
              .send({ message: '유효하지 않은 체크인/체크아웃 날짜입니다.' });
          }

          const nowStartOfDay = startOfDay(now);
          if (checkInDate < nowStartOfDay) {
            logger.warn(
              'checkIn date is in the past for dayUse reservation',
              reservation
            );
            return res
              .status(400)
              .send({ message: '체크인 날짜는 과거일 수 없습니다.' });
          }

          if (checkOutDate <= checkInDate) {
            logger.warn(
              'checkOut date is before checkIn for dayUse reservation',
              reservation
            );
            return res.status(400).send({
              message: '체크아웃 날짜는 체크인 날짜보다 이후여야 합니다.',
            });
          }
        } else {
          const finalCheckInTime = isSoldOut
            ? checkInTime
            : reservation.checkInTime || checkInTime;
          const finalCheckOutTime = isSoldOut
            ? checkOutTime
            : reservation.checkOutTime || checkOutTime;
          checkIn = `${reservation.checkInDate}T${finalCheckInTime}:00+09:00`;
          checkOut = `${reservation.checkOutDate}T${finalCheckOutTime}:00+09:00`;
        }
        reservationDate = format(now, "yyyy-MM-dd'T'HH:mm:ss+09:00");
      } else {
        checkIn = reservation.checkIn;
        checkOut =
          reservation.checkOut ||
          `${reservation.checkIn.split(' ')[0]}T11:00:00+09:00`;
        reservationDate =
          reservation.reservationDate ||
          format(new Date(), "yyyy-MM-dd'T'HH:mm:ss+09:00");
      }

      if (!checkIn || !checkOut || checkIn >= checkOut) {
        logger.warn('Skipping reservation with invalid dates', reservation);
        continue;
      }

      logger.debug('Data before save:', { reservationId, checkIn, checkOut });

      let paymentMethod;
      if (availableOTAs.includes(siteName)) {
        paymentMethod = reservation.paymentMethod?.trim() || 'OTA';
      } else if (siteName === '현장예약' || siteName === '단잠') {
        paymentMethod = reservation.paymentMethod || '현장결제';
      } else {
        paymentMethod = reservation.paymentMethod || 'OTA';
      }

      const paymentHistory = reservation.paymentHistory || [];
      const price = isSoldOut ? 0 : parsePrice(reservation.price);
      const remainingBalance = isSoldOut
        ? 0
        : reservation.remainingBalance !== undefined
        ? reservation.remainingBalance
        : price;

      const updateData = {
        siteName,
        customerName: reservation.customerName,
        phoneNumber: isSoldOut
          ? ''
          : sanitizePhoneNumber(reservation.phoneNumber),
        roomInfo: reservation.roomInfo,
        checkIn,
        checkOut,
        reservationDate,
        reservationStatus: reservation.reservationStatus || 'Pending',
        price,
        specialRequests: reservation.specialRequests || null,
        additionalFees: reservation.additionalFees || 0,
        couponInfo: reservation.couponInfo || null,
        paymentStatus: reservation.paymentStatus || '확인 필요',
        paymentMethod,
        hotelId: finalHotelId,
        type: reservation.type || 'stay',
        duration:
          reservation.type === 'dayUse' ? reservation.duration || 3 : null,
        notificationHistory: [],
        sentCreate: false,
        sentCancel: false,
        paymentHistory,
        remainingBalance,
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

          if (req.app.get('io')) {
            req.app.get('io').to(finalHotelId).emit('reservationCreated', {
              reservation: newReservation.toObject(),
            });
          }

          if (
            siteName === '현장예약' &&
            updateData.type === 'stay' &&
            !isSoldOut
          ) {
            try {
              const shortReservationNumber = getShortReservationNumber(
                newReservation._id
              );
              await sendReservationNotification(
                newReservation.toObject(),
                finalHotelId,
                'create',
                getShortReservationNumber
              );
              logger.info(`알림톡 전송 성공 (생성): ${shortReservationNumber}`);
            } catch (err) {
              logger.error(
                `알림톡 전송 실패 (생성, ID: ${getShortReservationNumber(
                  newReservation._id
                )}):`,
                err
              );
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
            req.app
              .get('io')
              .to(finalHotelId)
              .emit('reservationDeleted', { reservationId });
          }

          if (
            siteName === '현장예약' &&
            existingReservation.type === 'stay' &&
            !isSoldOut
          ) {
            try {
              const shortReservationNumber = getShortReservationNumber(
                existingReservation._id
              );
              await sendReservationNotification(
                existingReservation.toObject(),
                finalHotelId,
                'cancel',
                getShortReservationNumber
              );
              logger.info(`알림톡 전송 성공 (취소): ${shortReservationNumber}`);
            } catch (err) {
              logger.error(
                `알림톡 전송 실패 (취소, ID: ${getShortReservationNumber(
                  existingReservation._id
                )}):`,
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
            hotelId: finalHotelId,
            isCancelled: false,
          });
          const { isConflict, conflictReservation = {} } = checkConflict(
            { ...updateData, _id: reservationId },
            updateData.roomNumber || existingReservation.roomNumber,
            allReservations,
            new Date(selectedDate)
          );
          if (isConflict) {
            const conflictCheckIn = conflictReservation.checkIn
              ? format(
                  new Date(conflictReservation.checkIn),
                  'yyyy-MM-dd HH:mm'
                )
              : '정보 없음';
            const conflictCheckOut = conflictReservation.checkOut
              ? format(
                  new Date(conflictReservation.checkOut),
                  'yyyy-MM-dd HH:mm'
                )
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

          await Reservation.updateOne({ _id: reservationId }, updateData, {
            runValidators: true,
            strict: true,
            overwrite: true,
          });
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
            updateData.roomNumber = await assignRoomNumber(
              updateData,
              finalHotelId,
              Reservation
            );
          } else {
            updateData.roomNumber = reservation.roomNumber;
          }
          const allReservations = await Reservation.find({
            hotelId: finalHotelId,
            isCancelled: false,
          });
          const { isConflict, conflictReservation = {} } = checkConflict(
            { ...updateData, _id: reservationId },
            updateData.roomNumber,
            allReservations,
            new Date(selectedDate)
          );
          if (isConflict) {
            const conflictCheckIn = conflictReservation.checkIn
              ? format(
                  new Date(conflictReservation.checkIn),
                  'yyyy-MM-dd HH:mm'
                )
              : '정보 없음';
            const conflictCheckOut = conflictReservation.checkOut
              ? format(
                  new Date(conflictReservation.checkOut),
                  'yyyy-MM-dd HH:mm'
                )
              : '정보 없음';
            return res.status(409).send({
              message: `객실 ${
                updateData.roomNumber
              }은 이미 예약이 존재합니다.\n충돌 예약자: ${
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

          if (
            siteName === '현장예약' &&
            updateData.type === 'stay' &&
            !isSoldOut
          ) {
            try {
              const shortReservationNumber = getShortReservationNumber(
                newReservation._id
              );
              await sendReservationNotification(
                newReservation.toObject(),
                finalHotelId,
                'create',
                getShortReservationNumber
              );
              logger.info(`알림톡 전송 성공 (생성): ${shortReservationNumber}`);
            } catch (err) {
              logger.error(
                `알림톡 전송 실패 (생성, ID: ${getShortReservationNumber(
                  newReservation._id
                )}):`,
                err
              );
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

  const user = req.user || req.customer;
  if (!user) {
    return res.status(401).json({ message: 'Unauthorized, user not found' });
  }

  const finalHotelId = req.user ? req.user.hotelId : hotelId;
  if (!reservationId || !finalHotelId || !siteName) {
    return res
      .status(400)
      .send({ message: 'reservationId, hotelId, siteName는 필수입니다.' });
  }

  try {
    const Reservation = getReservationModel(finalHotelId);
    const reservation = await Reservation.findOne({
      _id: reservationId,
      hotelId: finalHotelId,
      siteName,
    });

    if (!reservation) {
      logger.warn(`[deleteReservation] Reservation not found: ${reservationId}`);
      return res.status(404).send({ message: '해당 예약을 찾을 수 없습니다.' });
    }

    // 삭제된 예약의 세부 정보 로깅
    const { customerName, phoneNumber, checkIn, checkOut } = reservation;
    logger.info(`[deleteReservation] Reservation deleted: ${reservationId}`, {
      siteName,
      customerName: customerName || '정보 없음',
      phoneNumber: phoneNumber || '정보 없음',
      checkIn: checkIn || '정보 없음',
      checkOut: checkOut || '정보 없음',
    });

    // WebSocket 이벤트에 삭제된 예약의 세부 정보 포함
    if (req.app.get('io')) {
      req.app.get('io').to(finalHotelId).emit('reservationDeleted', {
        reservationId,
        reservation: {
          customerName: customerName || '정보 없음',
          phoneNumber: phoneNumber || '정보 없음',
          checkIn: checkIn || '정보 없음',
          checkOut: checkOut || '정보 없음',
          siteName: siteName || '알 수 없음',
        },
      });
    }

    // 알림톡 전송 (현장예약인 경우)
    if (siteName === '현장예약' && reservation.type === 'stay') {
      try {
        const shortReservationNumber = getShortReservationNumber(
          reservation._id
        );
        await sendReservationNotification(
          reservation.toObject(),
          finalHotelId,
          'cancel',
          getShortReservationNumber
        );
        logger.info(`알림톡 전송 성공 (취소): ${shortReservationNumber}`);
      } catch (err) {
        logger.error(
          `알림톡 전송 실패 (취소, ID: ${getShortReservationNumber(
            reservation._id
          )}):`,
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

  const user = req.user || req.customer;
  if (!user) {
    return res.status(401).json({ message: 'Unauthorized, user not found' });
  }

  const finalHotelId = req.user ? req.user.hotelId : hotelId;
  if (!reservationId || !finalHotelId) {
    return res
      .status(400)
      .send({ message: 'reservationId와 hotelId는 필수입니다.' });
  }

  try {
    const Reservation = getReservationModel(finalHotelId);
    const reservation = await Reservation.findOne({
      _id: reservationId,
      hotelId: finalHotelId,
    });

    if (!reservation)
      return res.status(404).send({ message: '예약을 찾을 수 없습니다.' });
    if (reservation.reservationStatus === '예약완료') {
      return res.status(400).send({ message: '이미 확정된 예약입니다.' });
    }

    reservation.reservationStatus = '예약완료';
    const savedReservation = await reservation.save();

    if (req.app.get('io')) {
      req.app.get('io').to(finalHotelId).emit('reservationUpdated', {
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
  // 클라이언트에서 보내는 데이터에서 selectedDate 제외
  const { hotelId, roomNumber, ...updateData } = req.body;

  const user = req.user || req.customer;
  if (!user) {
    return res.status(401).json({ message: 'Unauthorized, user not found' });
  }

  const finalHotelId = req.user ? req.user.hotelId : hotelId;
  if (!finalHotelId) {
    return res.status(400).send({ message: 'hotelId는 필수입니다.' });
  }
  if (!reservationId) {
    return res.status(400).send({ message: 'reservationId는 필수입니다.' });
  }

  try {
    const Reservation = getReservationModel(finalHotelId);
    const reservation = await Reservation.findOne({
      _id: reservationId,
      hotelId: finalHotelId,
    });

    if (!reservation) {
      return res.status(404).send({ message: '예약을 찾을 수 없습니다.' });
    }

    const originalRoomNumber = reservation.roomNumber;
    const newRoomNumber = roomNumber || updateData.roomNumber;

    if (newRoomNumber && !newRoomNumber.trim()) {
      return res.status(400).send({ message: '유효한 객실 번호를 입력하세요.' });
    }

    // 객실 번호 변경 시 충돌 검사
    if (updateData.manuallyCheckedOut === true) {
      reservation.manuallyCheckedOut = true;
      reservation.roomNumber = '';
      logger.info(
        `Reservation ${reservationId} marked as manually checked out`
      );
    } else if (newRoomNumber && newRoomNumber !== reservation.roomNumber) {
      const allReservations = await Reservation.find({
        hotelId: finalHotelId,
        isCancelled: false,
        manuallyCheckedOut: false,
      });
      const reservationDataForConflict = {
        ...reservation.toObject(),
        ...updateData,
        roomNumber: newRoomNumber,
        _id: reservationId,
      };
      // 충돌 검사는 현재 날짜를 기준으로 진행
      const conflictCheckDate = new Date();
      const { isConflict, conflictReservation = {} } = checkConflict(
        reservationDataForConflict,
        newRoomNumber,
        allReservations,
        conflictCheckDate
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

    // 업데이트 데이터 적용
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
      req.app.get('io').to(finalHotelId).emit('reservationUpdated', {
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

  const user = req.user || req.customer;
  if (!user) {
    return res.status(401).json({ message: 'Unauthorized, user not found' });
  }

  const finalHotelId = req.user ? req.user.hotelId : hotelId;
  if (!finalHotelId) {
    return res.status(400).send({ message: 'hotelId는 필수입니다.' });
  }

  const CanceledReservation = getCanceledReservationModel(finalHotelId);

  try {
    const canceledReservations = await CanceledReservation.find();
    const plain = canceledReservations.map((doc) => doc.toObject());
    res.status(200).send(plain);
  } catch (error) {
    logger.error('취소된 예약 가져오는 중 오류 발생:', error);
    res.status(500).send({ message: '서버 오류가 발생했습니다.' });
  }
};

// 1박씩 결제 처리
export const payPerNight = async (req, res) => {
  const { reservationId } = req.params;
  const { hotelId, amount, method } = req.body;

  const user = req.user || req.customer;
  if (!user) {
    return res.status(401).json({ message: 'Unauthorized, user not found' });
  }

  const finalHotelId = req.user ? req.user.hotelId : hotelId;
  if (!finalHotelId || !reservationId || !amount) {
    logger.warn('[payPerNight] Missing required fields:', {
      hotelId: finalHotelId,
      reservationId,
      amount,
      method,
    });
    return res
      .status(400)
      .send({ message: 'hotelId, reservationId, amount는 필수입니다.' });
  }

  try {
    const Reservation = getReservationModel(finalHotelId);
    const reservation = await Reservation.findOne({
      _id: reservationId,
      hotelId: finalHotelId,
    });

    if (!reservation) {
      logger.warn(`[payPerNight] Reservation not found: ${reservationId}`);
      return res.status(404).send({ message: '예약을 찾을 수 없습니다.' });
    }

    if (reservation.type !== 'stay') {
      logger.warn(
        `[payPerNight] Invalid reservation type: ${reservation.type}`
      );
      return res
        .status(400)
        .send({ message: '연박 예약만 1박씩 결제 가능합니다.' });
    }

    const checkInDate = new Date(reservation.checkIn);
    const checkOutDate = new Date(reservation.checkOut);
    const diffDays = Math.floor(
      (checkOutDate - checkInDate) / (1000 * 60 * 60 * 24)
    );
    if (diffDays <= 1) {
      logger.warn(`[payPerNight] Invalid duration: ${diffDays} days`);
      return res
        .status(400)
        .send({ message: '연박 예약만 1박씩 결제 가능합니다.' });
    }

    const perNightPrice = Math.round(reservation.price / diffDays);
    const tolerance = 1;
    if (Math.abs(amount - perNightPrice) > tolerance) {
      logger.warn(
        `[payPerNight] Mismatched amount: ${amount} vs ${perNightPrice}`
      );
      return res.status(400).send({
        message: `결제 금액(${amount})이 1박당 금액(${perNightPrice})과 일치하지 않습니다. (오차 허용 범위: ${tolerance}원)`,
      });
    }

    const payments = [{ amount: Number(amount), method: method || 'Cash' }];
    const savedReservation = await processPayment(
      reservation,
      payments,
      finalHotelId,
      req
    );

    logger.info(
      `[payPerNight] Payment processed for reservation ${reservationId}, remainingBalance: ${savedReservation.remainingBalance}`
    );
    res.status(200).send({
      message: '1박 결제가 성공적으로 처리되었습니다.',
      reservation: savedReservation.toObject(),
    });
  } catch (error) {
    logger.error('[payPerNight] Error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).send({
        message: '유효성 검사 오류가 발생했습니다.',
        details: error.errors,
      });
    }
    res.status(error.message ? 400 : 500).send({
      message: error.message || '서버 오류가 발생했습니다.',
    });
  }
};

// 부분 결제 처리
export const payPartial = async (req, res) => {
  const { reservationId } = req.params;
  const { hotelId, payments } = req.body;

  const user = req.user || req.customer;
  if (!user) {
    return res.status(401).json({ message: 'Unauthorized, user not found' });
  }

  const finalHotelId = req.user ? req.user.hotelId : hotelId;
  if (!finalHotelId || !reservationId || !payments) {
    logger.warn('[payPartial] Missing required fields:', {
      hotelId: finalHotelId,
      reservationId,
      payments,
    });
    return res
      .status(400)
      .send({ message: 'hotelId, reservationId, payments는 필수입니다.' });
  }

  if (!Array.isArray(payments) || payments.length === 0) {
    logger.warn('[payPartial] Invalid payments array:', payments);
    return res
      .status(400)
      .send({ message: '결제 항목이 비어있거나 유효하지 않습니다.' });
  }

  try {
    const Reservation = getReservationModel(finalHotelId);
    const reservation = await Reservation.findOne({
      _id: reservationId,
      hotelId: finalHotelId,
    });

    if (!reservation) {
      logger.warn(`[payPartial] Reservation not found: ${reservationId}`);
      return res.status(404).send({ message: '예약을 찾을 수 없습니다.' });
    }

    const savedReservation = await processPayment(
      reservation,
      payments,
      finalHotelId,
      req
    );

    logger.info(
      `[payPartial] Payment processed for reservation ${reservationId}, remainingBalance: ${savedReservation.remainingBalance}`
    );
    res.status(200).send({
      message: '부분 결제가 성공적으로 처리되었습니다.',
      reservation: savedReservation.toObject(),
    });
  } catch (error) {
    logger.error('[payPartial] Error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).send({
        message: '유효성 검사 오류가 발생했습니다.',
        details: error.errors,
      });
    }
    res.status(error.message ? 400 : 500).send({
      message: error.message || '서버 오류가 발생했습니다.',
    });
  }
};
