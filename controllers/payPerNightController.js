// controllers/payPerNightController.js

import logger from '../utils/logger.js';
import getReservationModel from '../models/Reservation.js'; // getReservationModel 임포트
import { format } from 'date-fns';

export const payPerNightController = async (req, res) => {
  const { reservationId } = req.params;
  const { hotelId, amount, method } = req.body;

  if (!hotelId || !reservationId || !amount) {
    logger.warn('[payPerNightController] Missing required fields:', { hotelId, reservationId, amount, method });
    return res.status(400).send({ message: 'hotelId, reservationId, amount는 필수입니다.' });
  }

  try {
    const Reservation = getReservationModel(hotelId);
    const reservation = await Reservation.findOne({ _id: reservationId, hotelId });

    if (!reservation) {
      logger.warn(`[payPerNightController] Reservation not found: ${reservationId}`);
      return res.status(404).send({ message: '예약을 찾을 수 없습니다.' });
    }

    if (reservation.type !== 'stay') {
      logger.warn(`[payPerNightController] Invalid reservation type: ${reservation.type}`);
      return res.status(400).send({ message: '연박 예약만 1박씩 결제 가능합니다.' });
    }

    const checkInDate = new Date(reservation.checkIn);
    const checkOutDate = new Date(reservation.checkOut);
    const diffDays = Math.floor((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24)); // 정수로 계산
    if (diffDays <= 1) {
      logger.warn(`[payPerNightController] Invalid duration: ${diffDays} days`);
      return res.status(400).send({ message: '연박 예약만 1박씩 결제 가능합니다.' });
    }

    const perNightPrice = Math.round(reservation.price / diffDays); // Math.round 적용
    const tolerance = 1; // 1원 이내 오차 허용
    if (Math.abs(amount - perNightPrice) > tolerance) {
      logger.warn(`[payPerNightController] Mismatched amount: ${amount} vs ${perNightPrice}`);
      return res.status(400).send({
        message: `결제 금액(${amount})이 1박당 금액(${perNightPrice})과 일치하지 않습니다. (오차 허용 범위: ${tolerance}원)`,
      });
    }

    if (amount <= 0) {
      logger.warn(`[payPerNightController] Invalid amount: ${amount}`);
      return res.status(400).send({ message: '결제 금액은 0보다 커야 합니다.' });
    }

    const now = new Date();
    const paymentDate = format(now, 'yyyy-MM-dd');
    const paymentTimestamp = format(now, "yyyy-MM-dd'T'HH:mm:ss+09:00");

    const newPayment = {
      date: paymentDate,
      amount: Number(amount),
      timestamp: paymentTimestamp,
      method: method || 'Cash',
    };

    const updatedPaymentHistory = [...(reservation.paymentHistory || []), newPayment];
    const newRemainingBalance = (reservation.remainingBalance || reservation.price || 0) - amount;

    if (newRemainingBalance < 0) {
      logger.warn(`[payPerNightController] Negative remaining balance: ${newRemainingBalance}`);
      return res.status(400).send({ message: '잔액이 음수가 될 수 없습니다.' });
    }

    reservation.paymentMethod = method || reservation.paymentMethod || 'Pending';
    reservation.paymentHistory = updatedPaymentHistory;
    reservation.remainingBalance = newRemainingBalance;

    const savedReservation = await reservation.save();

    if (req.app.get('io')) {
      req.app.get('io').to(hotelId).emit('reservationUpdated', {
        reservation: savedReservation.toObject(),
      });
    }

    logger.info(`[payPerNightController] Payment processed for reservation ${reservationId}, remainingBalance: ${savedReservation.remainingBalance}`);
    res.status(200).send({
      message: '1박 결제가 성공적으로 처리되었습니다.',
      reservation: savedReservation.toObject(),
    });
  } catch (error) {
    logger.error('[payPerNightController] Error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).send({
        message: '유효성 검사 오류가 발생했습니다.',
        details: error.errors,
      });
    }
    res.status(500).send({ message: '서버 오류가 발생했습니다.' });
  }
};