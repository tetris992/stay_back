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

import axios from 'axios';

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

const generateCustomerToken = (customer) => {
  return jwt.sign({ id: customer._id }, process.env.JWT_SECRET, {
    expiresIn: '1d',
  });
};

const generateRefreshToken = (customer) => {
  return jwt.sign({ id: customer._id }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: '7d',
  });
};

export const loginCustomerSocial = async (req, res) => {
  const { provider } = req.params;
  const { code } = req.body;

  if (provider !== 'kakao') {
    logger.warn(`Invalid social login provider: ${provider}`);
    return res
      .status(400)
      .json({ message: '현재는 카카오 로그인만 지원됩니다.' });
  }

  if (!code) {
    logger.warn(`Missing code for Kakao login`);
    return res.status(400).json({ message: 'code는 필수입니다.' });
  }

  try {
    const KAKAO_REST_API_KEY = process.env.REACT_APP_KAKAO_REST_API_KEY;
    const redirectUri =
      process.env.NODE_ENV === 'production'
        ? 'https://danjam.in/auth/kakao/callback'
        : 'http://localhost:3000/auth/kakao/callback';
    const tokenResponse = await axios.post(
      'https://kauth.kakao.com/oauth/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: KAKAO_REST_API_KEY,
        redirect_uri: redirectUri,
        code,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const accessToken = tokenResponse.data.access_token;
    logger.info(`Kakao access token obtained: ${accessToken}`);

    const userResponse = await axios.get('https://kapi.kakao.com/v2/user/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
    });

    const userInfo = userResponse.data;
    logger.info(`Kakao user info: ${JSON.stringify(userInfo)}`); // 디버깅 로그 추가

    const providerId = userInfo.id.toString();
    const name = userInfo.properties?.nickname || '알 수 없음';
    const email = userInfo.kakao_account?.email || null;

    if (!email) {
      logger.warn('Kakao user email not provided. User may not have agreed to share email.');
    }

    let customer = await Customer.findOne({
      'socialLogin.provider': provider,
      'socialLogin.providerId': providerId,
    });

    if (!customer) {
      customer = new Customer({
        name,
        email,
        socialLogin: { provider, providerId },
        isActive: true,
      });
      await customer.save();
      logger.info(
        `New customer created via social login: ${customer.email || 'no email'}, provider: ${provider}`
      );
    } else {
      if (email && !customer.email?.includes('@example.com')) {
        customer.email = email;
      }
      customer.name = name;
      await customer.save();
      logger.info(
        `Customer updated via social login: ${customer.email || 'no email'}, provider: ${provider}`
      );
    }

    const token = generateCustomerToken(customer);
    const refreshToken = generateRefreshToken(customer);
    customer.refreshToken = refreshToken;
    await customer.save();
    logger.info(
      `Customer logged in via social: ${customer.email || 'no email'}, provider: ${provider}, refreshToken: ${refreshToken}`
    );

    const redirectUrl = `${
      process.env.NODE_ENV === 'production'
        ? 'https://danjam.in'
        : 'http://localhost:3000'
    }/auth/${provider}/callback?token=${token}&refreshToken=${refreshToken}&customer=${encodeURIComponent(
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

const getShortReservationNumber = (reservationId) => {
  return `WEB-${reservationId.slice(-8)}`;
};

export const loginCustomer = async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ message: '전화번호는 필수입니다.' });
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

    if (!customer.isActive) {
      logger.warn(`Customer not activated: ${customer.phoneNumber}`);
      return res.status(403).json({
        message: '계정이 활성화되지 않았습니다. 약관 동의를 완료해주세요.',
        redirectUrl: '/privacy-consent',
        customerId: customer._id,
      });
    }

    const token = generateCustomerToken(customer);
    const refreshToken = generateRefreshToken(customer);
    customer.refreshToken = refreshToken;
    await customer.save();
    logger.info(
      `Customer logged in: ${customer.phoneNumber}, refreshToken: ${refreshToken}`
    );
    res.status(200).json({
      token,
      refreshToken,
      customer: { nickname: customer.nickname, phoneNumber, email: customer.email },
    });
  } catch (error) {
    logger.error(`Customer login error: ${error.message}`, error);
    res
      .status(500)
      .json({ message: '서버 오류가 발생했습니다.', error: error.message });
  }
};

export const connectSocialAccount = async (req, res) => {
  const { provider } = req.params;
  const { providerId, email, idToken } = req.body;
  const customer = req.customer;

  if (!['kakao', 'naver', 'google'].includes(provider)) {
    logger.warn(`Invalid social provider for connection: ${provider}`);
    return res
      .status(400)
      .json({ message: '지원하지 않는 소셜 로그인 제공자입니다.' });
  }

  if (provider === 'kakao') {
    const hotelSettings = await HotelSettingsModel.findOne(
      {},
      'socialLoginSettings'
    ).lean();
    if (!hotelSettings || !hotelSettings.socialLoginSettings?.kakao?.enabled) {
      logger.warn(`Kakao login is disabled`);
      return res
        .status(403)
        .json({ message: 'Kakao 로그인은 현재 비활성화되어 있습니다.' });
    }
  }

  if (provider === 'naver' || provider === 'google') {
    logger.info(
      `Social account connection for ${provider} is not implemented yet`
    );
    return res
      .status(400)
      .json({ message: `현재 ${provider} 계정 연결은 지원되지 않습니다.` });
  }

  if (!providerId) {
    logger.warn(`Missing providerId for social connection`);
    return res.status(400).json({ message: 'providerId는 필수입니다.' });
  }

  const trimmedProviderId =
    typeof providerId === 'string' ? providerId.trim() : '';
  const trimmedEmail = typeof email === 'string' ? email.trim() : '';

  if (!trimmedProviderId || trimmedProviderId.length < 5) {
    logger.warn(
      `Invalid providerId for social connection: ${trimmedProviderId}`
    );
    return res.status(400).json({ message: '유효한 providerId가 필요합니다.' });
  }

  if (trimmedEmail && !/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
    logger.warn(`Invalid email format for social connection: ${trimmedEmail}`);
    return res.status(400).json({ message: '유효한 이메일 형식이 아닙니다.' });
  }

  try {
    const existingCustomer = await Customer.findOne({
      'socialLogin.provider': provider,
      'socialLogin.providerId': trimmedProviderId,
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

    customer.socialLogin = { provider, providerId: trimmedProviderId };
    if (trimmedEmail && !customer.email.includes('@example.com')) {
      customer.email = trimmedEmail;
    }

    if (provider === 'kakao' && idToken) {
      const hotelSettings = await HotelSettingsModel.findOne(
        {},
        'socialLoginSettings'
      ).lean();
      if (hotelSettings?.socialLoginSettings?.kakao?.openIdConnectEnabled) {
        logger.info(`Kakao ID Token received for connection: ${idToken}`);
        customer.openIdData = { idToken };
      }
    }

    const token = generateCustomerToken(customer);
    const refreshToken = generateRefreshToken(customer);
    customer.refreshToken = refreshToken;
    await customer.save();

    logger.info(
      `Social account connected: ${customer.email}, provider: ${provider}`
    );

    const redirectUrl = `/auth/${provider}/callback?token=${token}&refreshToken=${refreshToken}&customer=${encodeURIComponent(
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
  const { nickname, phoneNumber, email, ageRange, name } = req.body;

  if (!phoneNumber) {
    logger.warn(`Missing required field for registration: phoneNumber=${phoneNumber}`);
    return res.status(400).json({ message: '전화번호는 필수입니다.' });
  }

  try {
    const existingCustomer = await Customer.findOne({
      $or: [{ phoneNumber }, { email }, { nickname }],
    });
    if (existingCustomer) {
      logger.warn(
        `Duplicate nickname, phoneNumber, or email: nickname=${nickname}, phoneNumber=${phoneNumber}, email=${email}`
      );
      return res.status(409).json({
        message: '이미 가입된 닉네임, 전화번호 또는 이메일입니다.',
        details: {
          nickname: existingCustomer.nickname === nickname ? '이미 사용 중인 닉네임입니다.' : null,
          phoneNumber: existingCustomer.phoneNumber === phoneNumber ? '이미 사용 중인 전화번호입니다.' : null,
          email: existingCustomer.email === email ? '이미 사용 중인 이메일입니다.' : null,
        },
      });
    }

    const customer = new Customer({
      nickname: nickname || null,
      phoneNumber,
      email: email || null,
      ageRange: ageRange || null,
      name: name || null,
      isActive: false,
    });

    await customer.save();
    logger.info(`New customer registered: ${customer.phoneNumber}`);

    res.status(201).json({
      message: '회원가입이 완료되었습니다. 약관 동의를 완료해주세요.',
      customerId: customer._id,
      redirectUrl: '/privacy-consent',
    });
  } catch (error) {
    logger.error(`Customer registration error: ${error.message}`, error);
    res.status(500).json({
      message: '서버 오류가 발생했습니다.',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
};

export const updateCustomer = async (req, res) => {
  try {
    const customerId = req.customer._id; // 인증된 사용자 ID
    const { agreements } = req.body;

    // 필수 동의 항목 검증
    if (agreements && (!agreements.terms || !agreements.privacy)) {
      return res.status(400).json({ message: '필수 약관에 동의해야 합니다.' });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ message: '고객을 찾을 수 없습니다.' });
    }

    // 동의 항목 업데이트
    if (agreements) {
      customer.agreements = {
        terms: agreements.terms,
        privacy: agreements.privacy,
        marketing: agreements.marketing || false,
        agreedAt: new Date(),
        termsVersion: '2025.04.08',
      };
    }

    await customer.save();
    logger.info(`Customer agreements updated: ${customer.email}`);
    res.status(200).json({ message: '동의 항목이 업데이트되었습니다.', customer });
  } catch (error) {
    logger.error('Customer update failed:', error);
    res.status(500).json({ message: error.message || '업데이트에 실패했습니다.' });
  }
};

export const getAgreements = async (req, res) => {
  try {
    const customerId = req.customer._id; // 인증된 사용자 ID
    const customer = await Customer.findById(customerId).select('agreements');
    if (!customer) {
      return res.status(404).json({ message: '고객을 찾을 수 없습니다.' });
    }
    res.status(200).json(customer.agreements);
  } catch (error) {
    logger.error('Fetch agreements failed:', error);
    res.status(500).json({ message: error.message || '동의 내역 조회에 실패했습니다.' });
  }
};

export const getHotelList = async (req, res) => {
  try {
    const validIcons = [
      'FaWifi',
      'FaBath',
      'FaTv',
      'FaUmbrellaBeach',
      'FaTshirt',
      'FaFilm',
      'FaChair',
      'FaSmoking',
      'FaStore',
      'FaCoffee',
      'FaSnowflake',
      'FaFire',
      'FaGlassMartini',
      'FaWind',
      'FaLock',
      'FaCouch',
      'FaUtensils',
      'FaConciergeBell',
      'FaPaw',
      'FaWheelchair',
      'FaBan',
      'FaVolumeMute',
      'FaToilet',
      'FaShower',
      'FaHotTub',
      'FaSpa',
      'FaDumbbell',
      'FaSwimmingPool',
      'FaParking',
      'FaChargingStation',
      'FaBriefcase',
      'FaUsers',
      'FaGlassCheers',
      'FaChild',
      'FaCocktail',
      'FaTree',
      'FaBuilding',
      'FaMicrophone',
      'FaClock',
      'FaSuitcase',
      'FaBus',
      'FaCar',
      'FaMap',
      'FaMoneyBillWave',
      'FaSoap',
      'FaDesktop',
      'FaMoneyCheck',
      'FaGolfBall',
      'FaGamepad',
      'FaBicycle',
      'FaDoorOpen',
    ];

    const hotelSettings = await HotelSettingsModel.find(
      {},
      'hotelId checkInTime checkOutTime amenities latitude longitude' // latitude와 longitude 추가
    ).lean();
    if (!hotelSettings || hotelSettings.length === 0) {
      return res.status(404).json({ message: '등록된 호텔이 없습니다.' });
    }

    const hotelIds = hotelSettings.map((h) => h.hotelId);
    const hotels = await User.find(
      { hotelId: { $in: hotelIds } },
      'hotelId hotelName address phoneNumber email'
    ).lean();

    const settingsMap = hotelSettings.reduce((acc, curr) => {
      acc[curr.hotelId] = curr;
      return acc;
    }, {});

    const hotelList = hotels.map((hotel) => {
      const amenities =
        settingsMap[hotel.hotelId]?.amenities?.filter(
          (a) =>
            a.type === 'on-site' && a.isActive && validIcons.includes(a.icon)
        ) || [];
      return {
        hotelId: hotel.hotelId,
        hotelName: hotel.hotelName || 'Unknown Hotel',
        address: hotel.address || 'Unknown Address',
        phoneNumber: hotel.phoneNumber || 'Unknown Phone Number',
        email: hotel.email || 'Unknown Email',
        checkInTime: settingsMap[hotel.hotelId]?.checkInTime || 'N/A',
        checkOutTime: settingsMap[hotel.hotelId]?.checkOutTime || 'N/A',
        amenities,
        latitude: settingsMap[hotel.hotelId]?.latitude || null, // 좌표 추가
        longitude: settingsMap[hotel.hotelId]?.longitude || null, // 좌표 추가
      };
    });

    console.log('[getHotelList] Returning hotel list:', hotelList);
    res.status(200).json(hotelList);
  } catch (error) {
    logger.error(`Error fetching hotel list: ${error.message}`, error);
    res
      .status(500)
      .json({ message: '서버 오류가 발생했습니다.', error: error.message });
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
    const gridSettings = hotelSettings.gridSettings || {};

    if (!Array.isArray(roomTypes) || roomTypes.length === 0) {
      logger.warn(`Invalid roomTypes for hotelId: ${hotelId}`, roomTypes);
      return res
        .status(400)
        .json({ message: 'roomTypes 데이터가 유효하지 않습니다.' });
    }
    if (!gridSettings || !Array.isArray(gridSettings.floors)) {
      logger.warn(`Invalid gridSettings for hotelId: ${hotelId}`, gridSettings);
      return res
        .status(400)
        .json({ message: 'gridSettings 데이터가 유효하지 않습니다.' });
    }

    const invalidContainers = gridSettings.floors.some((floor) => {
      if (!floor || !Array.isArray(floor.containers)) {
        return true;
      }
      return floor.containers.some((cell) => {
        if (!cell || typeof cell !== 'object') {
          return true;
        }
        return !cell.roomNumber || typeof cell.roomNumber !== 'string';
      });
    });
    if (invalidContainers) {
      logger.warn(
        `Invalid containers in gridSettings for hotelId: ${hotelId}`,
        gridSettings
      );
      return res.status(400).json({
        message: 'gridSettings의 containers 데이터가 유효하지 않습니다.',
      });
    }

    console.log('[getHotelAvailability] roomTypes:', roomTypes);
    console.log('[getHotelAvailability] gridSettings:', gridSettings);

    const availabilityByDate = calculateRoomAvailability(
      reservations,
      roomTypes,
      checkIn,
      checkOut,
      gridSettings
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

  const validIcons = [
    'FaWifi',
    'FaBath',
    'FaTv',
    'FaUmbrellaBeach',
    'FaTshirt',
    'FaFilm',
    'FaChair',
    'FaSmoking',
    'FaStore',
    'FaCoffee',
    'FaSnowflake',
    'FaFire',
    'FaGlassMartini',
    'FaWind',
    'FaLock',
    'FaCouch',
    'FaUtensils',
    'FaConciergeBell',
    'FaPaw',
    'FaWheelchair',
    'FaBan',
    'FaVolumeMute',
    'FaToilet',
    'FaShower',
    'FaHotTub',
    'FaSpa',
    'FaDumbbell',
    'FaSwimmingPool',
    'FaParking',
    'FaChargingStation',
    'FaBriefcase',
    'FaUsers',
    'FaGlassCheers',
    'FaChild',
    'FaCocktail',
    'FaTree',
    'FaBuilding',
    'FaMicrophone',
    'FaClock',
    'FaSuitcase',
    'FaBus',
    'FaCar',
    'FaMap',
    'FaMoneyBillWave',
    'FaSoap',
    'FaDesktop',
    'FaMoneyCheck',
    'FaGolfBall',
    'FaGamepad',
    'FaBicycle',
    'FaDoorOpen',
  ];

  try {
    const hotelSettings = await HotelSettingsModel.findOne({ hotelId })
      .select(
        'roomTypes photos basicInfo checkInTime checkOutTime gridSettings latitude longitude' // latitude와 longitude 추가
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

    const filteredRoomTypes = hotelSettings.roomTypes.map((roomType) => ({
      ...roomType,
      roomAmenities:
        roomType.roomAmenities?.filter((amenity) =>
          validIcons.includes(amenity.icon)
        ) || [],
    }));

    const response = {
      hotelId,
      hotelName: hotel?.hotelName || 'Unknown Hotel',
      address: hotel?.address || 'Unknown Address',
      checkInTime: hotelSettings.checkInTime,
      checkOutTime: hotelSettings.checkOutTime,
      roomTypes: filteredRoomTypes,
      photos: hotelSettings.photos,
      basicInfo: hotelSettings.basicInfo,
      gridSettings: hotelSettings.gridSettings,
      latitude: hotelSettings.latitude || null, // 좌표 추가
      longitude: hotelSettings.longitude || null, // 좌표 추가
    };

    console.log('[getCustomerHotelSettings] Returning data for hotelId:', hotelId, response);
    return res.status(200).json(response);
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
    const { hotelId, roomInfo, checkIn, checkOut, price, specialRequests } =
      req.body;

    if (!hotelId || !roomInfo || !checkIn || !checkOut || !price) {
      logger.warn(
        `[createReservation] Missing fields: hotelId=${hotelId}, roomInfo=${roomInfo}, checkIn=${checkIn}, checkOut=${checkOut}, price=${price}`
      );
      return res.status(400).json({ message: '모든 필드는 필수입니다.' });
    }

    const hotelSettings = await HotelSettingsModel.findOne({ hotelId });
    if (!hotelSettings) {
      logger.warn(
        `[createReservation] Hotel settings not found for hotelId=${hotelId}`
      );
      return res
        .status(404)
        .json({ message: '호텔 설정 정보를 찾을 수 없습니다.' });
    }
    const requestedRoomType = hotelSettings.roomTypes.find(
      (rt) => rt.roomInfo === roomInfo
    );
    if (!requestedRoomType) {
      logger.warn(`[createReservation] Invalid room type: ${roomInfo}`);
      return res
        .status(400)
        .json({ message: '유효하지 않은 객실 타입입니다.' });
    }

    const checkInDate = startOfDay(new Date(checkIn));
    const checkOutDate = startOfDay(new Date(checkOut));
    const numDays = differenceInCalendarDays(checkOutDate, checkInDate);
    if (numDays <= 0) {
      logger.warn(
        `[createReservation] Invalid date range: checkIn=${checkIn}, checkOut=${checkOut}`
      );
      return res
        .status(400)
        .json({ message: '체크아웃 날짜는 체크인 날짜 이후여야 합니다.' });
    }

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

    const Reservation = getReservationModel(hotelId);
    const existingReservations = await Reservation.find({
      hotelId,
      isCancelled: false,
    });
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
      return res
        .status(409)
        .json({ message: '해당 기간에 이용 가능한 객실이 없습니다.' });
    }

    const defaultCheckInTime = hotelSettings?.checkInTime || '15:00';
    const defaultCheckOutTime = hotelSettings?.checkOutTime || '11:00';
    const formattedCheckIn = checkIn.includes('T')
      ? checkIn
      : `${checkIn}T${defaultCheckInTime}:00+09:00`;
    const formattedCheckOut = checkOut.includes('T')
      ? checkOut
      : `${checkOut}T${defaultCheckOutTime}:00+09:00`;

    const reservationId = `WEB-${uuidv4()}`;
    const newData = {
      _id: reservationId,
      hotelId,
      siteName: '단잠',
      customerName: customer.name,
      phoneNumber: customer.phoneNumber,
      customerId: customer._id,
      roomInfo,
      checkIn: formattedCheckIn,
      checkOut: formattedCheckOut,
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

    await Customer.findByIdAndUpdate(
      customer._id,
      {
        $push: { reservations: { hotelId, reservationId, visitCount: 1 } },
        $inc: { totalVisits: 1 },
      },
      { new: true }
    );

    if (req.app.get('io')) {
      req.app.get('io').to(hotelId).emit('reservationCreated', {
        reservation: newReservation.toObject(),
      });
      req.app
        .get('io')
        .to(`customer_${customer._id}`)
        .emit('reservationUpdated', {
          reservation: newReservation.toObject(),
        });
    }

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

    logger.info(
      `[createReservation] Created reservation: ${reservationId}, customer: ${customer.email}`
    );
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
    logger.error(
      `[createReservation] Error: ${error.message}, customer: ${
        req.customer?.email || 'unknown'
      }`,
      error
    );
    return res
      .status(500)
      .json({ message: '서버 오류가 발생했습니다.', error: error.message });
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
          latitude: hotelSettings ? hotelSettings.latitude : null, // 좌표 추가
          longitude: hotelSettings ? hotelSettings.longitude : null, // 좌표 추가
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
    const customer = req.customer;
    if (customer) {
      customer.refreshToken = null;
      await customer.save();
    }
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

export const getSocialLoginSettings = async (req, res) => {
  try {
    let hotelSettings = await HotelSettingsModel.findOne(
      {},
      'socialLoginSettings'
    ).lean();
    if (!hotelSettings) {
      hotelSettings = new HotelSettingsModel({
        hotelId: 'default',
        socialLoginSettings: {
          kakao: {
            enabled: true, // 기본값을 true로 변경
            openIdConnectEnabled: false,
          },
        },
      });
      await hotelSettings.save();
      logger.info('Created default HotelSettings for social login settings');
    }
    res.status(200).json(hotelSettings.socialLoginSettings);
  } catch (error) {
    logger.error(
      `Error fetching social login settings: ${error.message}`,
      error
    );
    res
      .status(500)
      .json({ message: '서버 오류가 발생했습니다.', error: error.message });
  }
};

export const refreshCustomerToken = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    logger.warn('No refresh token provided');
    return res.status(401).json({ message: 'Refresh token is required' });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const customer = await Customer.findById(decoded.id).select('-password');
    if (!customer) {
      logger.warn(`Customer not found for id: ${decoded.id}`);
      return res
        .status(401)
        .json({ message: 'Unauthorized, customer not found' });
    }

    logger.info(
      `Stored refreshToken: ${customer.refreshToken}, Provided refreshToken: ${refreshToken}`
    );
    if (customer.refreshToken !== refreshToken) {
      logger.warn(`Invalid refresh token for customer: ${customer.email}`);
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const newToken = generateCustomerToken(customer);
    logger.info(`Customer token refreshed: ${customer.email}`);
    res.status(200).json({ token: newToken });
  } catch (error) {
    logger.error(`Customer token refresh error: ${error.message}`, error);
    res.status(401).json({ message: 'Unauthorized, refresh token failed' });
  }
};

// 중복 체크 엔드포인트 추가
export const checkDuplicate = async (req, res) => {
  logger.info(`checkDuplicate request body: ${JSON.stringify(req.body)}`); // 요청 본문 로그 추가
  const { phoneNumber, email, nickname } = req.body;

  if (!phoneNumber && !email && !nickname) {
    logger.warn('No phoneNumber, email, or nickname provided for duplicate check');
    return res.status(400).json({ message: '전화번호, 이메일, 또는 닉네임이 필요합니다.' });
  }

  try {
    const existingCustomer = await Customer.findOne({
      $or: [
        { phoneNumber: phoneNumber || { $exists: false } },
        { email: email || { $exists: false } },
        { nickname: nickname || { $exists: false } },
      ],
    });

    if (existingCustomer) {
      logger.warn(
        `Duplicate check found: phoneNumber=${phoneNumber}, email=${email}, nickname=${nickname}`
      );
      const response = {
        isDuplicate: true,
        details: {
          phoneNumber: existingCustomer.phoneNumber === phoneNumber ? '이미 사용 중인 전화번호입니다.' : null,
          email: existingCustomer.email === email ? '이미 사용 중인 이메일입니다.' : null,
          nickname: existingCustomer.nickname === nickname ? '이미 사용 중인 닉네임입니다.' : null,
        },
      };
      logger.info(`Duplicate check response: ${JSON.stringify(response)}`);
      return res.status(200).json(response);
    }

    const response = { isDuplicate: false };
    logger.info(`Duplicate check response: ${JSON.stringify(response)}`);
    return res.status(200).json(response);
  } catch (error) {
    logger.error(`Duplicate check error: ${error.message}`, error);
    return res.status(500).json({
      message: '서버 오류가 발생했습니다.',
      error: error.message,
    });
  }
};

export const activateAccount = async (req, res) => {
  logger.info(`activateAccount request received: ${JSON.stringify(req.body)}`);
  const { customerId, agreements } = req.body;

  if (!customerId || !agreements || !agreements.terms || !agreements.privacy) {
    logger.warn(
      `Missing required fields for account activation: customerId=${customerId}, agreements=${JSON.stringify(agreements)}`
    );
    return res.status(400).json({ message: '고객 ID와 필수 약관 동의는 필수입니다.' });
  }

  try {
    const customer = await Customer.findById(customerId);
    if (!customer) {
      logger.warn(`Customer not found for activation: ${customerId}`);
      return res.status(404).json({ message: '고객을 찾을 수 없습니다.' });
    }

    if (customer.isActive) {
      logger.warn(`Customer already activated: ${customerId}`);
      return res.status(400).json({ message: '이미 활성화된 계정입니다.' });
    }

    customer.agreements = {
      terms: agreements.terms,
      privacy: agreements.privacy,
      marketing: agreements.marketing || false,
      agreedAt: new Date(),
      termsVersion: '2025.04.08',
    };
    customer.isActive = true;
    await customer.save();

    logger.info(`Customer account activated: ${customer.nickname}`);
    res.status(200).json({
      message: '계정이 활성화되었습니다. 로그인 페이지로 이동합니다.',
      redirectUrl: '/login',
    });
  } catch (error) {
    logger.error(`Account activation error: ${error.message}`, error);
    console.error('Account activation error:', error); // 임시 콘솔 출력 추가
    res.status(500).json({
      message: '서버 오류가 발생했습니다.',
      error: error.message,
    });
  }
};