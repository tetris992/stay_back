import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import Customer from '../models/Customer.js';
import getReservationModel from '../models/Reservation.js';
import HotelSettingsModel from '../models/HotelSettings.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import { calculateRoomAvailability } from '../utils/availability.js';
import crypto from 'crypto';
import sendEmail from '../utils/sendEmail.js';
import PasswordResetToken from '../models/PasswordResetToken.js';
import { sendReservationNotification } from '../utils/sendAlimtalk.js';
import {
  format,
  startOfDay,
  addDays,
  differenceInCalendarDays,
} from 'date-fns';

const generateCustomerToken = (customer) => {
  return jwt.sign({ id: customer._id }, process.env.JWT_SECRET, {
    expiresIn: '1d',
  });
};

const getShortReservationNumber = (reservationId) => {
  return `WEB-${reservationId.slice(-8)}`;
};

const sanitizePhoneNumber = (phoneNumber) =>
  phoneNumber ? phoneNumber.replace(/\D/g, '') : '';

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
  reservation.paymentMethod =
    newPayments[newPayments.length - 1].method ||
    reservation.paymentMethod ||
    'Pending';

  const savedReservation = await reservation.save();

  if (req.app.get('io')) {
    req.app.get('io').to(hotelId).emit('reservationUpdated', {
      reservation: savedReservation.toObject(),
    });
    req.app
      .get('io')
      .to(`customer_${reservation.customerId}`)
      .emit('reservationUpdated', {
        reservation: savedReservation.toObject(),
      });
  }

  return savedReservation;
};

export const loginCustomer = async (req, res) => {
  const { phoneNumber, password, name, email } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ message: '전화번호는 필수입니다.' });
  }

  const trimmedPassword = typeof password === 'string' ? password.trim() : '';
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const trimmedEmail = typeof email === 'string' ? email.trim() : '';

  if (!trimmedPassword && (trimmedName || trimmedEmail)) {
    return res.status(400).json({
      message:
        '소셜 로그인은 아직 구현되지 않았습니다. 일반 로그인 시 비밀번호를 반드시 포함해주세요.',
    });
  }

  try {
    const customer = await Customer.findOne({ phoneNumber });
    if (!customer) {
      return res.status(404).json({ message: '고객을 찾을 수 없습니다.' });
    }

    if (customer.socialLogin && customer.socialLogin.provider) {
      return res.status(400).json({
        message: '소셜 로그인 계정입니다. 소셜 로그인을 이용해주세요.',
      });
    }

    if (
      !trimmedPassword ||
      !(await customer.comparePassword(trimmedPassword))
    ) {
      return res.status(401).json({ message: '비밀번호가 올바르지 않습니다.' });
    }

    const token = generateCustomerToken(customer);
    logger.info(`Customer logged in: ${customer.phoneNumber}`);
    res.status(200).json({
      token,
      customer: { name: customer.name, phoneNumber, email: customer.email },
    });
  } catch (error) {
    logger.error(`Customer login error: ${error.message}`, error);
    res
      .status(500)
      .json({ message: '서버 오류가 발생했습니다.', error: error.message });
  }
};

export const loginCustomerSocial = async (req, res) => {
  const { provider } = req.params;
  const { providerId, name, email, phoneNumber } = req.body;

  if (!['kakao', 'naver', 'google'].includes(provider)) {
    logger.warn(`Invalid social login provider: ${provider}`);
    return res
      .status(400)
      .json({ message: '지원하지 않는 소셜 로그인 제공자입니다.' });
  }

  const trimmedProviderId =
    typeof providerId === 'string' ? providerId.trim() : '';
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const trimmedEmail = typeof email === 'string' ? email.trim() : '';
  if (!trimmedProviderId || !trimmedName || !trimmedEmail) {
    logger.warn(
      `Missing required fields for social login: providerId=${providerId}, name=${name}, email=${email}`
    );
    return res
      .status(400)
      .json({ message: 'providerId, name, email은 필수입니다.' });
  }

  try {
    let customer = await Customer.findOne({
      'socialLogin.provider': provider,
      'socialLogin.providerId': trimmedProviderId,
    });

    if (!customer) {
      customer = new Customer({
        name: trimmedName,
        email: trimmedEmail,
        phoneNumber: phoneNumber || `social-${provider}-${trimmedProviderId}`,
        socialLogin: { provider, providerId: trimmedProviderId },
      });
      await customer.save();
      logger.info(
        `New customer created via social login: ${customer.email}, provider: ${provider}`
      );
    }

    const token = generateCustomerToken(customer);
    logger.info(
      `Customer logged in via social: ${customer.email}, provider: ${provider}`
    );

    const redirectUrl = `/auth/${provider}/callback?token=${token}&customer=${encodeURIComponent(
      JSON.stringify({
        name: customer.name,
        phoneNumber: customer.phoneNumber,
        email: customer.email,
      })
    )}`;
    res.status(200).json({ redirectUrl });
  } catch (error) {
    logger.error(`Customer social login error: ${error.message}`, error);
    res.status(500).json({
      message: '소셜 로그인 중 오류가 발생했습니다.',
      error: error.message,
    });
  }
};

export const connectSocialAccount = async (req, res) => {
  const { provider } = req.params;
  const { providerId, email } = req.body;
  const customer = req.customer;

  if (!['kakao', 'naver', 'google'].includes(provider)) {
    logger.warn(`Invalid social provider for connection: ${provider}`);
    return res
      .status(400)
      .json({ message: '지원하지 않는 소셜 로그인 제공자입니다.' });
  }
  if (!providerId) {
    logger.warn(`Missing providerId for social connection`);
    return res.status(400).json({ message: 'providerId는 필수입니다.' });
  }

  try {
    const existingCustomer = await Customer.findOne({
      'socialLogin.provider': provider,
      'socialLogin.providerId': providerId,
    });
    if (
      existingCustomer &&
      existingCustomer._id.toString() !== customer._id.toString()
    ) {
      logger.warn(
        `Social account already connected to another customer: provider=${provider}, providerId=${providerId}`
      );
      return res
        .status(400)
        .json({ message: '이미 다른 계정에 연결된 소셜 계정입니다.' });
    }

    customer.socialLogin = { provider, providerId };
    if (email && !customer.email.includes('@example.com')) {
      customer.email = email;
    }
    await customer.save();

    logger.info(
      `Social account connected: ${customer.email}, provider: ${provider}`
    );

    const token = generateCustomerToken(customer);
    const redirectUrl = `/auth/${provider}/callback?token=${token}&customer=${encodeURIComponent(
      JSON.stringify({
        name: customer.name,
        phoneNumber: customer.phoneNumber,
        email: customer.email,
      })
    )}`;
    res.status(200).json({ redirectUrl });
  } catch (error) {
    logger.error(`Social account connection error: ${error.message}`, error);
    res.status(500).json({
      message: '소셜 계정 연결 중 오류가 발생했습니다.',
      error: error.message,
    });
  }
};

export const registerCustomer = async (req, res) => {
  const { name, phoneNumber, email, password, consentChecked } = req.body;

  if (!name || !password) {
    logger.warn(
      `Missing required fields for registration: name=${name}, password=${password}`
    );
    return res.status(400).json({ message: '이름과 비밀번호는 필수입니다.' });
  }

  try {
    const existingCustomer = await Customer.findOne({
      $or: [{ phoneNumber }, { email }],
    });
    if (existingCustomer) {
      logger.warn(
        `Duplicate phoneNumber or email: phoneNumber=${phoneNumber}, email=${email}`
      );
      return res
        .status(409)
        .json({ message: '이미 가입된 전화번호 또는 이메일입니다.' });
    }

    let finalPhoneNumber = '01000000000';
    if (phoneNumber) {
      finalPhoneNumber = sanitizePhoneNumber(phoneNumber);
    }

    const customer = new Customer({
      name,
      phoneNumber,
      email,
      password,
      consentChecked: !!consentChecked,
    });
    await customer.save();
    const token = generateCustomerToken(customer);
    logger.info(`New customer registered: ${customer.email}`);
    res.status(201).json({ token, customer });
  } catch (error) {
    logger.error(`Customer registration error: ${error.message}`, error);
    res
      .status(500)
      .json({ message: '서버 오류가 발생했습니다.', error: error.message });
  }
};

export const getHotelList = async (req, res) => {
  try {
    // HotelSettings에서 호텔 ID, 체크인/체크아웃 시간, 공통 시설(온사이트 amenities) 조회
    const hotelSettings = await HotelSettingsModel.find(
      {},
      'hotelId checkInTime checkOutTime amenities'
    ).lean();
    if (!hotelSettings || hotelSettings.length === 0) {
      return res.status(404).json({ message: '등록된 호텔이 없습니다.' });
    }

    // User에서 호텔 기본정보 조회 (이메일, 전화번호, 주소 등)
    const hotelIds = hotelSettings.map((h) => h.hotelId);
    const hotels = await User.find(
      { hotelId: { $in: hotelIds } },
      'hotelId hotelName address phoneNumber email'
    ).lean();

    // HotelSettings를 호텔 ID별로 매핑
    const settingsMap = hotelSettings.reduce((acc, curr) => {
      acc[curr.hotelId] = curr;
      return acc;
    }, {});

    // 각 호텔 정보를 병합하여 반환
    const hotelList = hotels.map((hotel) => ({
      hotelId: hotel.hotelId,
      hotelName: hotel.hotelName || 'Unknown Hotel',
      address: hotel.address || 'Unknown Address',
      phoneNumber: hotel.phoneNumber || 'Unknown Phone Number',
      email: hotel.email || 'Unknown Email',
      checkInTime: settingsMap[hotel.hotelId]?.checkInTime || 'N/A',
      checkOutTime: settingsMap[hotel.hotelId]?.checkOutTime || 'N/A',
      // 공통 시설은 온사이트 amenities만 필터 (isActive:true 인 경우)
      amenities:
        settingsMap[hotel.hotelId]?.amenities?.filter(
          (a) => a.type === 'on-site' && a.isActive
        ) || [],
    }));

    res.status(200).json(hotelList);
  } catch (error) {
    logger.error(`Error fetching hotel list: ${error.message}`, error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.', error: error.message });
  }
};


export const getHotelAvailability = async (req, res) => {
  const { hotelId, checkIn, checkOut } = req.query;

  if (!hotelId || !checkIn || !checkOut) {
    logger.warn(
      `Missing required fields for availability: hotelId=${hotelId}, checkIn=${checkIn}, checkOut=${checkOut}`
    );
    return res
      .status(400)
      .json({ message: 'hotelId, checkIn, checkOut은 필수입니다.' });
  }

  try {
    const hotelSettings = await HotelSettingsModel.findOne({ hotelId });
    if (!hotelSettings) {
      logger.warn(`Hotel settings not found for hotelId: ${hotelId}`);
      return res
        .status(404)
        .json({ message: '호텔 설정 정보를 찾을 수 없습니다.' });
    }

    const hotel = await User.findOne({ hotelId });
    if (!hotel) {
      logger.warn(`Hotel not found for hotelId: ${hotelId}`);
      return res.status(404).json({ message: '호텔 정보를 찾을 수 없습니다.' });
    }

    const Reservation = getReservationModel(hotelId);
    const reservations = await Reservation.find({
      hotelId,
      isCancelled: false,
    });
    const roomTypes = hotelSettings.roomTypes || [];

    const availabilityByDate = calculateRoomAvailability(
      reservations,
      roomTypes,
      checkIn,
      checkOut,
      hotelSettings.gridSettings
    );

    const availability = roomTypes.map((roomType) => {
      const typeKey = roomType.roomInfo.toLowerCase();
      let totalAvailableRooms = roomType.stock || 0;

      const checkInDate = startOfDay(new Date(checkIn));
      const checkOutDate = startOfDay(new Date(checkOut));
      const numDays = differenceInCalendarDays(checkOutDate, checkInDate);
      const dateList = [];
      for (let i = 0; i < numDays; i++) {
        dateList.push(format(addDays(checkInDate, i), 'yyyy-MM-dd'));
      }

      let minAvailableRooms = totalAvailableRooms;
      dateList.forEach((ds) => {
        const dailyData = availabilityByDate[ds]?.[typeKey] || {
          remain: totalAvailableRooms,
        };
        minAvailableRooms = Math.min(minAvailableRooms, dailyData.remain);
      });

      return {
        roomInfo: roomType.roomInfo,
        nameKor: roomType.nameKor,
        nameEng: roomType.nameEng,
        price: roomType.price,
        availableRooms: minAvailableRooms,
      };
    });

    res.status(200).json({
      hotelId,
      hotelName: hotel.hotelName,
      address: hotel.address,
      checkInTime: hotelSettings.checkInTime,
      checkOutTime: hotelSettings.checkOutTime,
      availability,
      availabilityByDate,
    });
  } catch (error) {
    logger.error(`Error fetching hotel availability: ${error.message}`, error);
    res
      .status(500)
      .json({ message: '서버 오류가 발생했습니다.', error: error.message });
  }
};

export const getCustomerHotelSettings = async (req, res) => {
  const { hotelId } = req.query;

  if (!hotelId) {
    return res.status(400).json({ message: 'hotelId가 필요합니다.' });
  }

  try {
    const hotelSettings = await HotelSettingsModel.findOne({ hotelId })
      .select(
        'roomTypes photos basicInfo checkInTime checkOutTime gridSettings'
      )
      .lean();

    if (!hotelSettings) {
      return res
        .status(404)
        .json({ message: '해당 호텔의 설정 정보를 찾을 수 없습니다.' });
    }

    const hotel = await User.findOne({ hotelId })
      .select('hotelName address')
      .lean();

    return res.status(200).json({
      hotelId,
      hotelName: hotel?.hotelName || 'Unknown Hotel',
      address: hotel?.address || 'Unknown Address',
      checkInTime: hotelSettings.checkInTime,
      checkOutTime: hotelSettings.checkOutTime,
      roomTypes: hotelSettings.roomTypes,
      photos: hotelSettings.photos,
      basicInfo: hotelSettings.basicInfo,
      gridSettings: hotelSettings.gridSettings,
    });
  } catch (error) {
    logger.error(
      `Error fetching customer hotel settings: ${error.message}`,
      error
    );
    res
      .status(500)
      .json({ message: '서버 오류가 발생했습니다.', error: error.message });
  }
};

export const createReservation = async (req, res) => {
  try {
    const customer = req.customer;
    const { hotelId, roomInfo, checkIn, checkOut, price, specialRequests } = req.body;

    // 필수 필드 검증
    if (!hotelId || !roomInfo || !checkIn || !checkOut || !price) {
      logger.warn(
        `[createReservation] Missing fields: hotelId=${hotelId}, roomInfo=${roomInfo}, checkIn=${checkIn}, checkOut=${checkOut}, price=${price}`
      );
      return res.status(400).json({ message: '모든 필드는 필수입니다.' });
    }

    // 호텔 설정 및 객실 타입 확인
    const hotelSettings = await HotelSettingsModel.findOne({ hotelId });
    if (!hotelSettings) {
      logger.warn(`[createReservation] Hotel settings not found for hotelId=${hotelId}`);
      return res.status(404).json({ message: '호텔 설정 정보를 찾을 수 없습니다.' });
    }
    const requestedRoomType = hotelSettings.roomTypes.find(
      (rt) => rt.roomInfo === roomInfo
    );
    if (!requestedRoomType) {
      logger.warn(`[createReservation] Invalid room type: ${roomInfo}`);
      return res.status(400).json({ message: '유효하지 않은 객실 타입입니다.' });
    }

    // 숙박일수 계산
    const checkInDate = startOfDay(new Date(checkIn));
    const checkOutDate = startOfDay(new Date(checkOut));
    const numDays = differenceInCalendarDays(checkOutDate, checkInDate);
    if (numDays <= 0) {
      logger.warn(`[createReservation] Invalid date range: checkIn=${checkIn}, checkOut=${checkOut}`);
      return res.status(400).json({ message: '체크아웃 날짜는 체크인 날짜 이후여야 합니다.' });
    }

    // 가격 검증
    const expectedTotalPrice = requestedRoomType.price * numDays;
    const tolerance = 1;
    if (Math.abs(parseFloat(price) - expectedTotalPrice) > tolerance) {
      logger.warn(
        `[createReservation] Price mismatch: requested=${price}, expected=${expectedTotalPrice}, roomPrice=${requestedRoomType.price}, numDays=${numDays}`
      );
      return res.status(400).json({
        message: `요청된 총 가격(${price}원)이 예상 총 가격(${expectedTotalPrice}원)과 일치하지 않습니다. (1박당 ${requestedRoomType.price}원 x ${numDays}박)`,
      });
    }

    // 예약 가능 여부 확인
    const Reservation = getReservationModel(hotelId);
    const existingReservations = await Reservation.find({ hotelId, isCancelled: false });
    const availabilityByDate = calculateRoomAvailability(
      existingReservations,
      hotelSettings.roomTypes,
      checkIn,
      checkOut,
      hotelSettings.gridSettings
    );
    const typeKey = roomInfo.toLowerCase();
    let minAvailableRooms = requestedRoomType.stock || 0;
    for (let i = 0; i < numDays; i++) {
      const ds = format(addDays(checkInDate, i), 'yyyy-MM-dd');
      const dailyData = availabilityByDate[ds]?.[typeKey] || {
        remain: requestedRoomType.stock || 0,
      };
      minAvailableRooms = Math.min(minAvailableRooms, dailyData.remain);
    }
    if (minAvailableRooms <= 0) {
      logger.warn(
        `[createReservation] No available rooms: hotelId=${hotelId}, roomInfo=${roomInfo}, minAvailableRooms=${minAvailableRooms}`
      );
      return res.status(409).json({ message: '해당 기간에 이용 가능한 객실이 없습니다.' });
    }

    // 시간 형식 보정
    const defaultCheckInTime = hotelSettings?.checkInTime || '15:00';
    const defaultCheckOutTime = hotelSettings?.checkOutTime || '11:00';
    const formattedCheckIn = checkIn.includes('T') 
      ? checkIn 
      : `${checkIn}T${defaultCheckInTime}:00+09:00`;
    const formattedCheckOut = checkOut.includes('T') 
      ? checkOut 
      : `${checkOut}T${defaultCheckOutTime}:00+09:00`;

    // 예약 생성
    const reservationId = `WEB-${uuidv4()}`;
    const newData = {
      _id: reservationId,
      hotelId,
      siteName: '단잠',
      customerName: customer.name,
      phoneNumber: customer.phoneNumber,
      customerId: customer._id,
      roomInfo,
      checkIn: formattedCheckIn, // 수정된 부분
      checkOut: formattedCheckOut, // 수정된 부분
      reservationDate: new Date().toISOString().replace('Z', '+09:00'),
      reservationStatus: req.body.reservationStatus || '예약완료',
      price: parseFloat(price),
      numDays,
      specialRequests: specialRequests || '',
      paymentMethod: '현장결제',
      isCancelled: false,
      type: 'stay',
      paymentHistory: [],
      remainingBalance: parseFloat(price),
      roomNumber: '',
      isCancellable: true,
    };

    const newReservation = new Reservation(newData);
    await newReservation.save();

    // 고객 예약 정보 업데이트
    await Customer.findByIdAndUpdate(
      customer._id,
      {
        $push: { reservations: { hotelId, reservationId, visitCount: 1 } },
        $inc: { totalVisits: 1 },
      },
      { new: true }
    );

    // 웹소켓 업데이트
    if (req.app.get('io')) {
      req.app.get('io').to(hotelId).emit('reservationCreated', {
        reservation: newReservation.toObject(),
      });
      req.app.get('io').to(`customer_${customer._id}`).emit('reservationUpdated', {
        reservation: newReservation.toObject(),
      });
    }

    // 알림톡 전송
    try {
      const shortReservationNumber = `WEB-${reservationId.slice(-8)}`;
      await sendReservationNotification(
        newReservation.toObject(),
        hotelId,
        'create',
        () => shortReservationNumber
      );
      logger.info(`알림톡 전송 성공 (생성): ${shortReservationNumber}`);
    } catch (err) {
      logger.error(`알림톡 전송 실패 (생성, ID: ${reservationId}):`, err);
    }

    logger.info(`[createReservation] Created reservation: ${reservationId}, customer: ${customer.email}`);
    return res.status(201).json({
      reservationId,
      hotelId,
      roomInfo,
      checkIn,
      checkOut,
      price: parseFloat(price),
      numDays,
    });
  } catch (error) {
    logger.error(`[createReservation] Error: ${error.message}, customer: ${req.customer?.email || 'unknown'}`, error);
    return res.status(500).json({ message: '서버 오류가 발생했습니다.', error: error.message });
  }
};

export const getReservationHistory = async (req, res) => {
  const customer = req.customer;

  try {
    const history = [];
    for (const {
      hotelId,
      reservationId,
      visitCount,
    } of customer.reservations) {
      const Reservation = getReservationModel(hotelId);
      const reservation = await Reservation.findById(reservationId);
      if (reservation) {
        const hotelSettings = await HotelSettingsModel.findOne({ hotelId });
        const hotel = await User.findOne({ hotelId });
        const enrichedReservation = {
          ...reservation.toObject(),
          hotelName: hotel ? hotel.hotelName : 'Unknown Hotel',
          address: hotel ? hotel.address : 'Unknown Address',
          checkInTime: hotelSettings ? hotelSettings.checkInTime : 'Unknown',
          checkOutTime: hotelSettings ? hotelSettings.checkOutTime : 'Unknown',
          visitCount: visitCount || 1,
        };
        history.push(enrichedReservation);
      }
    }

    logger.info(
      `Reservation history retrieved for customer: ${customer.email}, totalVisits: ${customer.totalVisits}`
    );
    res.status(200).json({
      history,
      totalVisits: customer.totalVisits || 0,
    });
  } catch (error) {
    logger.error(
      `Reservation history retrieval error: ${error.message}`,
      error
    );
    res
      .status(500)
      .json({ message: '서버 오류가 발생했습니다.', error: error.message });
  }
};

export const cancelReservation = async (req, res) => {
  const { reservationId } = req.params;
  const customer = req.customer;

  try {
    const customerReservation = customer.reservations.find(
      (r) => r.reservationId === reservationId
    );

    if (!customerReservation) {
      logger.warn(`Reservation not associated with customer: ${reservationId}`);
      return res
        .status(403)
        .json({ message: '본인의 예약만 취소할 수 있습니다.' });
    }

    const hotelId = customerReservation.hotelId;
    const Reservation = getReservationModel(hotelId);

    const reservation = await Reservation.findOne({
      _id: reservationId,
      hotelId,
    });

    if (!reservation) {
      logger.warn(`Reservation not found for cancellation: ${reservationId}`);
      return res.status(404).json({ message: '예약을 찾을 수 없습니다.' });
    }

    if (reservation.isCancelled) {
      logger.warn(`Reservation already cancelled: ${reservationId}`);
      return res.status(400).json({ message: '이미 취소된 예약입니다.' });
    }

    if (!reservation.isCancellable) {
      logger.warn(`Reservation cannot be cancelled: ${reservationId}`);
      return res
        .status(400)
        .json({ message: '입실일에는 예약을 취소할 수 없습니다.' });
    }

    reservation.isCancelled = true;
    await reservation.save();

    await Customer.findByIdAndUpdate(customer._id, {
      $pull: { reservations: { reservationId } },
    });

    if (req.app.get('io')) {
      req.app
        .get('io')
        .to(hotelId)
        .emit('reservationDeleted', { reservationId });
      req.app
        .get('io')
        .to(`customer_${customer._id}`)
        .emit('reservationUpdated', {
          reservation: reservation.toObject(),
        });
    }

    try {
      const shortReservationNumber = getShortReservationNumber(reservationId);
      await sendReservationNotification(
        reservation.toObject(),
        hotelId,
        'cancel',
        getShortReservationNumber
      );
      logger.info(`알림톡 전송 성공 (취소): ${shortReservationNumber}`);
    } catch (err) {
      logger.error(`알림톡 전송 실패 (취소, ID: ${reservationId}):`, err);
    }

    logger.info(
      `Reservation cancelled: ${reservationId} by customer: ${customer.email}`
    );

    res.status(200).json({ message: '예약이 취소되었습니다.' });
  } catch (error) {
    logger.error(`Reservation cancellation error: ${error.message}`, error);
    res
      .status(500)
      .json({ message: '서버 오류가 발생했습니다.', error: error.message });
  }
};

export const payPerNight = async (req, res) => {
  const { reservationId } = req.params;
  const { hotelId, amount, method } = req.body;
  const customer = req.customer;

  if (!hotelId || !reservationId || !amount) {
    logger.warn('[payPerNight] Missing required fields:', {
      hotelId,
      reservationId,
      amount,
      method,
    });
    return res
      .status(400)
      .json({ message: 'hotelId, reservationId, amount는 필수입니다.' });
  }

  try {
    const hotelSettings = await HotelSettingsModel.findOne({ hotelId });
    if (!hotelSettings) {
      logger.warn(`Hotel settings not found for hotelId: ${hotelId}`);
      return res
        .status(404)
        .json({ message: '호텔 설정 정보를 찾을 수 없습니다.' });
    }

    const Reservation = getReservationModel(hotelId);
    const reservation = await Reservation.findById(reservationId);

    if (!reservation) {
      logger.warn(`[payPerNight] Reservation not found: ${reservationId}`);
      return res.status(404).json({ message: '예약을 찾을 수 없습니다.' });
    }

    if (
      reservation.customerName !== customer.name ||
      reservation.phoneNumber !== customer.phoneNumber
    ) {
      logger.warn(
        `[payPerNight] Unauthorized payment attempt by customer: ${customer.email}`
      );
      return res
        .status(403)
        .json({ message: '본인의 예약만 결제할 수 있습니다.' });
    }

    if (reservation.type !== 'stay') {
      logger.warn(
        `[payPerNight] Invalid reservation type: ${reservation.type}`
      );
      return res
        .status(400)
        .json({ message: '연박 예약만 1박씩 결제 가능합니다.' });
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
        .json({ message: '연박 예약만 1박씩 결제 가능합니다.' });
    }

    const roomType = hotelSettings.roomTypes.find(
      (rt) => rt.roomInfo === reservation.roomInfo
    );
    if (!roomType) {
      logger.warn(
        `Room type not found in hotel settings: ${reservation.roomInfo} for hotelId: ${hotelId}`
      );
      return res
        .status(400)
        .json({ message: '호텔 설정에서 객실 정보를 찾을 수 없습니다.' });
    }

    const perNightPrice = Math.round(roomType.price / diffDays);
    const tolerance = 1;
    if (Math.abs(amount - perNightPrice) > tolerance) {
      logger.warn(
        `[payPerNight] Mismatched amount: ${amount} vs ${perNightPrice}`
      );
      return res.status(400).json({
        message: `결제 금액(${amount})이 1박당 금액(${perNightPrice})과 일치하지 않습니다. (오차 허용 범위: ${tolerance}원)`,
      });
    }

    const payments = [{ amount: Number(amount), method: method || 'Cash' }];
    const savedReservation = await processPayment(
      reservation,
      payments,
      hotelId,
      req
    );

    logger.info(
      `[payPerNight] Payment processed for reservation ${reservationId}, remainingBalance: ${savedReservation.remainingBalance}`
    );
    res.status(200).json({
      message: '1박 결제가 성공적으로 처리되었습니다.',
      reservation: savedReservation.toObject(),
    });
  } catch (error) {
    logger.error('[payPerNight] Error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: '유효성 검사 오류가 발생했습니다.',
        details: error.errors,
      });
    }
    res.status(error.message ? 400 : 500).json({
      message: error.message || '서버 오류가 발생했습니다.',
    });
  }
};

export const requestCustomerPasswordReset = async (req, res) => {
  const { email } = req.body;

  try {
    const customer = await Customer.findOne({ email });
    if (!customer) {
      logger.warn(`Customer not found for password reset: ${email}`);
      return res
        .status(404)
        .json({ message: '해당 이메일의 고객을 찾을 수 없습니다.' });
    }

    await PasswordResetToken.deleteMany({ customerId: customer._id });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await PasswordResetToken.create({
      customerId: customer._id,
      token,
      expiresAt,
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetLink = `${frontendUrl}/customer/reset-password/${token}`;

    await sendEmail({
      to: email,
      subject: '비밀번호 재설정 안내',
      text: `아래 링크를 클릭하여 비밀번호를 재설정하세요: ${resetLink}`,
      html: `<p>아래 링크를 클릭하여 비밀번호를 재설정하세요:</p>
             <p><a href="${resetLink}">${resetLink}</a></p>`,
    });

    logger.info(`Password reset email sent to: ${email}`);
    res.json({ message: '비밀번호 재설정 이메일을 전송했습니다.' });
  } catch (error) {
    logger.error(
      `Customer password reset request error: ${error.message}`,
      error
    );
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
};

export const resetCustomerPassword = async (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;

  try {
    const resetTokenDoc = await PasswordResetToken.findOne({ token });
    if (!resetTokenDoc) {
      logger.warn(`Invalid password reset token: ${token}`);
      return res.status(400).json({ message: '유효하지 않은 토큰입니다.' });
    }

    if (resetTokenDoc.expiresAt < new Date()) {
      logger.warn(`Expired password reset token: ${token}`);
      return res.status(400).json({ message: '토큰이 만료되었습니다.' });
    }

    const customer = await Customer.findById(resetTokenDoc.customerId);
    if (!customer) {
      logger.warn(
        `Customer not found for password reset: ${resetTokenDoc.customerId}`
      );
      return res.status(404).json({ message: '고객을 찾을 수 없습니다.' });
    }

    customer.password = newPassword;
    await customer.save();

    await resetTokenDoc.deleteOne();

    logger.info(`Password reset successful for customer: ${customer.email}`);
    res.json({ message: '비밀번호가 성공적으로 재설정되었습니다.' });
  } catch (error) {
    logger.error(`Customer password reset error: ${error.message}`, error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
};

export const logoutCustomer = async (req, res) => {
  try {
    logger.info(`Customer logged out: ${req.customer?.email || 'unknown'}`);
    res.json({ message: '로그아웃 성공' });
  } catch (error) {
    logger.error(
      `Customer logout error: ${error.message}, customer: ${
        req.customer?.email || 'unknown'
      }`,
      error
    );
    res
      .status(500)
      .json({ message: '서버 오류가 발생했습니다.', error: error.message });
  }
};
