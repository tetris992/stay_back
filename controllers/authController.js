// backend/controllers/authController.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import HotelSettings from '../models/HotelSettings.js';
import RefreshToken from '../models/RefreshToken.js';
import PasswordResetToken from '../models/PasswordResetToken.js';
import Reservation from '../models/Reservation.js'; // Reservation 모델 추가
import logger from '../utils/logger.js';
// import scraperManager from '../scrapers/scraperManager.js';
import crypto from 'crypto';
import sendEmail from '../utils/sendEmail.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Access Token 생성 함수
const generateAccessToken = (user) => {
  return jwt.sign({ hotelId: user.hotelId }, process.env.JWT_SECRET, {
    expiresIn: '55m',
  });
};

// Refresh Token 생성 함수
const generateRefreshToken = (user) => {
  return jwt.sign({ hotelId: user.hotelId }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: '365d',
  });
};

// 로그인 함수
export const loginUser = async (req, res) => {
  const { hotelId, password } = req.body;

  try {
    const user = await User.findOne({ hotelId });
    if (!user) {
      // 존재하지 않는 사용자면 바로 에러 응답 (새 사용자 생성하지 않음)
      return res.status(401).json({
        message: 'Invalid hotel ID or password.',
        userNotFound: true,
      });
    }

    // 사용자 존재 시, 비밀번호 비교
    if (await user.comparePassword(password)) {
      // 로그인 성공: 로그인 실패 횟수 초기화
      user.loginAttempts = 0;
      user.lastAttemptAt = null;
      await user.save();

      // 호텔 설정 존재 여부 확인
      const hotelSettings = await HotelSettings.findOne({
        hotelId: user.hotelId,
      });
      const isRegistered = !!hotelSettings;

      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      // Refresh Token 저장 (업데이트 또는 삽입)
      const refreshTokenDoc = await RefreshToken.findOneAndUpdate(
        { hotelId: user.hotelId },
        {
          token: refreshToken,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // Refresh Token을 HTTP-only 쿠키로 설정
      res.cookie('refreshToken', refreshTokenDoc.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 365 * 24 * 60 * 60 * 1000,
      });

      // 필요한 정보만 응답
      return res.status(200).json({ accessToken, isRegistered });
    } else {
      // 비밀번호가 틀린 경우, 로그인 실패 횟수 업데이트
      user.loginAttempts = (user.loginAttempts || 0) + 1;
      user.lastAttemptAt = new Date();
      await user.save();

      const remainingAttempts = Math.max(0, 5 - user.loginAttempts);
      if (remainingAttempts > 0) {
        return res.status(401).json({
          message: `Invalid hotel ID or password. Remaining attempts: ${remainingAttempts}`,
          remainingAttempts,
        });
      } else {
        return res.status(401).json({
          message:
            'Maximum login attempts exceeded. Please reset your password.',
          remainingAttempts: 0,
          resetRequired: true,
        });
      }
    }
  } catch (error) {
    logger.error(`Login error: ${error.message}`, error);
    return res.status(500).json({ message: '서버 오류' });
  }
};

// Refresh Access Token 함수 추가
export const refreshAccessToken = async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({ message: 'Refresh Token이 필요합니다.' });
  }

  try {
    // Refresh Token 검증
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const hotelId = decoded.hotelId;

    // Refresh Token이 DB에 존재하는지 확인
    const savedRefreshToken = await RefreshToken.findOne({
      token: refreshToken,
    });

    if (!savedRefreshToken) {
      return res
        .status(403)
        .json({ message: 'Refresh Token이 유효하지 않습니다.' });
    }

    // 새로운 Access Token 생성
    const newAccessToken = jwt.sign({ hotelId }, process.env.JWT_SECRET, {
      expiresIn: '55m',
    });

    res.status(200).json({ accessToken: newAccessToken });
  } catch (error) {
    logger.error('Refresh Token Error:', error);
    return res
      .status(403)
      .json({ message: 'Refresh Token이 유효하지 않습니다.' });
  }
};

// 로그아웃 함수
export const logout = async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  const hotelId = req.user ? req.user.hotelId : req.body.hotelId;

  if (!refreshToken || !hotelId) {
    logger.warn('Missing refreshToken or hotelId', { refreshToken, hotelId });
    return res.status(400).json({
      message: '리프레시 토큰 또는 호텔 ID가 필요합니다.',
      redirect: '/login',
    });
  }

  try {
    // Refresh Token 삭제
    await RefreshToken.findOneAndDelete({ token: refreshToken });

    // OTA 상태 비활성화
    await HotelSettings.findOneAndUpdate(
      { hotelId },
      { $set: { 'otas.$[].isActive': false } },
      { runValidators: true }
    );

    // 쿠키 삭제
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
    });

    logger.info(`Logout successful for hotelId: ${hotelId}`);
    return res
      .status(200)
      .json({ message: '로그아웃 되었습니다.', redirect: '/login' });
  } catch (error) {
    logger.error('Logout Error:', {
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      message: '서버 오류로 로그아웃 실패',
      error: error.message,
      redirect: '/login',
    });
  }
};
export const registerUser = async (req, res) => {
  const {
    hotelId,
    hotelName,
    password,
    email,
    address,
    phoneNumber,
    consentChecked,
  } = req.body;

  if (
    !hotelId ||
    !hotelName ||
    !password ||
    !email ||
    !address ||
    !phoneNumber
  ) {
    return res.status(400).json({
      message:
        '모든 필수 입력값(호텔 ID, 호텔 이름, 비밀번호, 이메일, 주소, 전화번호)을 입력해주세요.',
    });
  }

  try {
    const existingUser = await User.findOne({
      $or: [{ hotelId }, { email }, { phoneNumber }],
    });
    if (existingUser) {
      let message = '이미 존재하는 사용자입니다.';
      if (existingUser.hotelId === hotelId) message += ' 호텔 ID';
      else if (existingUser.email === email) message += ' 이메일';
      else if (existingUser.phoneNumber === phoneNumber) message += ' 전화번호';
      message += '입니다.';
      return res.status(409).json({ message });
    }

    const newUser = new User({
      hotelId,
      hotelName,
      password,
      email,
      address,
      phoneNumber,
      consentChecked: Boolean(consentChecked),
      consentAt: consentChecked ? new Date() : null,
    });
    await newUser.save();
    logger.info('New user account created:', hotelId);

    res.status(201).json({
      message: 'User account registered successfully',
      data: {
        hotelId: newUser.hotelId,
        hotelName: newUser.hotelName,
        email: newUser.email,
        address: newUser.address,
        phoneNumber: newUser.phoneNumber,
        consentChecked: newUser.consentChecked,
        consentAt: newUser.consentAt,
        createdAt: newUser.createdAt,
        updatedAt: newUser.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Error registering user:', {
      message: error.message,
      stack: error.stack,
    });
    res
      .status(500)
      .json({ message: '서버 오류가 발생했습니다.', error: error.message });
  }
};

// 사용자 정보 가져오기 함수 추가
export const getUserInfo = async (req, res) => {
  const { hotelId } = req.params;
  try {
    if (req.user.hotelId !== hotelId) {
      return res.status(403).json({ message: '권한이 없습니다.' });
    }

    const user = await User.findOne({ hotelId }).select('-password');
    if (!user) {
      return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    }

    res.status(200).json({
      message: '사용자 정보가 성공적으로 조회되었습니다.',
      data: {
        _id: user._id,
        hotelId: user.hotelId,
        hotelName: user.hotelName,
        email: user.email,
        address: user.address,
        phoneNumber: user.phoneNumber,
        consentChecked: user.consentChecked,
        consentAt: user.consentAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Error getting user info:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
};

// 사용자 정보 업데이트 함수 추가
export const updateUser = async (req, res) => {
  const { hotelId } = req.params;
  const { email, address, phoneNumber, password, hotelName } = req.body;

  try {
    if (req.user.hotelId !== hotelId) {
      return res.status(403).json({ message: '권한이 없습니다.' });
    }

    const user = await User.findOne({ hotelId });
    if (!user) {
      return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    }

    if (email) user.email = email;
    if (address) user.address = address;
    if (phoneNumber) user.phoneNumber = phoneNumber;
    if (password) user.password = password;
    if (hotelName) user.hotelName = hotelName;

    await user.save();
    logger.info(`User ${hotelId} updated successfully.`);

    res.status(200).json({
      message: '사용자 정보가 성공적으로 업데이트되었습니다.',
      data: {
        hotelId: user.hotelId,
        hotelName: user.hotelName,
        email: user.email,
        address: user.address,
        phoneNumber: user.phoneNumber,
        consentChecked: user.consentChecked,
        consentAt: user.consentAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Error updating user:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
};

// POST /auth/consent
/**
 * 사용자가 개인정보에 동의하면 해당 정보를 저장
 */
export const postConsent = async (req, res) => {
  const userId = req.user.id; // protect 미들웨어를 통해 설정
  const hotelId = req.user.hotelId; // protect 미들웨어를 통해 설정

  logger.info(`postConsent called for hotelId: ${hotelId}, userId: ${userId}`);

  try {
    // 사용자 찾기
    const user = await User.findOne({ _id: userId, hotelId });

    if (!user) {
      logger.warn(`User not found with userId: ${userId}, hotelId: ${hotelId}`);
      return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    }

    // 개인정보 동의 상태 업데이트
    user.consentChecked = true;
    user.consentAt = new Date();
    await user.save();

    // 추가: 텍스트 파일로 기록
    const consentLog = `User ID: ${userId}, Hotel ID: ${hotelId}, Consent At: ${user.consentAt.toISOString()}\n`;
    const logPath = path.join(__dirname, '../logs/consentLogs.txt');

    // logs 폴더가 없으면 생성
    const logsDir = path.dirname(logPath);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
      logger.info('Logs directory created.');
    }

    fs.appendFileSync(logPath, consentLog, 'utf8');
    logger.info(`Consent recorded for userId: ${userId}, hotelId: ${hotelId}`);

    res.status(200).json({ message: '개인정보 동의가 완료되었습니다.' });
  } catch (error) {
    logger.error('개인정보 동의 저장 중 오류 발생:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
};

// GET /auth/consent
/**
 * 사용자의 개인정보 동의 상태를 조회
 */
export const getConsentStatus = async (req, res) => {
  const { hotelId } = req.query;
  const userId = req.user.id;

  if (!hotelId) {
    return res.status(400).json({ message: 'hotelId가 필요합니다.' });
  }

  try {
    const user = await User.findOne({ _id: userId, hotelId });

    if (!user) {
      return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    }

    res.status(200).json({
      consentChecked: user.consentChecked,
      consentAt: user.consentAt,
    });
  } catch (error) {
    logger.error('개인정보 동의 상태 조회 중 오류 발생:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
};

// 비밀번호 재설정 요청 처리
export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    // 이메일을 통해 사용자 찾기
    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ message: '해당 이메일의 유저를 찾을 수 없습니다.' });
    }

    // 기존 토큰 삭제
    await PasswordResetToken.deleteMany({ hotelId: user.hotelId });

    // 토큰 생성 (32바이트의 랜덤 문자열)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1시간 후 만료

    await PasswordResetToken.create({
      hotelId: user.hotelId,
      token,
      expiresAt,
    });

    // FRONTEND_URL 기본값 지정
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetLink = `${frontendUrl}/reset-password/${token}`;

    // 이메일 전송 (text와 html 모두 포함)
    await sendEmail({
      to: email,
      subject: '비밀번호 재설정 안내',
      text: `아래 링크를 클릭하여 비밀번호를 재설정하세요: ${resetLink}`,
      html: `<p>아래 링크를 클릭하여 비밀번호를 재설정하세요:</p>
             <p><a href="${resetLink}">${resetLink}</a></p>`,
    });

    return res.json({ message: '비밀번호 재설정 이메일을 전송했습니다.' });
  } catch (error) {
    logger.error('비밀번호 재설정 요청 에러:', error);
    return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
};

// 실제 비밀번호 재설정 처리
export const resetPasswordController = async (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;

  const resetTokenDoc = await PasswordResetToken.findOne({ token });
  if (!resetTokenDoc) {
    return res.status(400).json({ message: '유효하지 않은 토큰입니다.' });
  }

  // 토큰 만료 시간 체크
  if (resetTokenDoc.expiresAt < new Date()) {
    return res.status(400).json({ message: '토큰이 만료되었습니다.' });
  }

  // 해당 유저 가져오기
  const user = await User.findOne({ hotelId: resetTokenDoc.hotelId });
  if (!user) {
    return res.status(404).json({ message: '유저를 찾을 수 없습니다.' });
  }

  // 비밀번호 업데이트
  user.password = newPassword;
  await user.save();

  // 토큰 사용 후 삭제
  await resetTokenDoc.deleteOne();

  return res.json({ message: '비밀번호가 성공적으로 재설정되었습니다.' });
};

// GET /auth/status
export const getAuthStatus = async (req, res) => {
  // protect 미들웨어가 통과되었으면 req.user가 존재
  if (req.user) {
    return res.status(200).json({
      authenticated: true,
      hotelId: req.user.hotelId,
      message: '로그인 상태입니다.',
    });
  } else {
    return res.status(401).json({
      authenticated: false,
      message: '로그인되어 있지 않습니다.',
    });
  }
};

// 예약 업데이트 컨트롤러 추가
export const updateReservation = async (req, res) => {
  const { reservationId } = req.params;
  const {
    customerName,
    phoneNumber,
    checkIn,
    checkOut,
    reservationDate,
    roomInfo,
    price,
    paymentMethod,
    specialRequests,
    roomNumber,
    siteName,
  } = req.body;
  const hotelId = req.user.hotelId;

  try {
    const reservation = await Reservation.findOneAndUpdate(
      { _id: reservationId, hotelId }, // hotelId로 권한 확인
      {
        customerName, // 수정 가능
        phoneNumber, // 수정 가능
        checkIn: new Date(checkIn),
        checkOut: new Date(checkOut),
        reservationDate: new Date(reservationDate),
        roomInfo,
        price: parseFloat(price),
        paymentMethod,
        specialRequests,
        roomNumber,
        siteName,
        updatedAt: new Date(),
      },
      { new: true, runValidators: true }
    );

    if (!reservation) {
      return res.status(404).json({ message: '예약을 찾을 수 없습니다.' });
    }

    logger.info(
      `Reservation ${reservationId} updated successfully for hotelId: ${hotelId}`
    );
    res
      .status(200)
      .json({ message: '예약이 업데이트되었습니다.', data: reservation });
  } catch (error) {
    logger.error('예약 업데이트 실패:', error);
    res
      .status(500)
      .json({ message: '서버 오류가 발생했습니다.', error: error.message });
  }
};

// 현장 예약 저장 컨트롤러 추가
export const saveOnSiteReservation = async (req, res) => {
  const {
    customerName,
    phoneNumber,
    checkIn,
    checkOut,
    reservationDate,
    roomInfo,
    price,
    paymentMethod,
    specialRequests,
    roomNumber,
    siteName,
  } = req.body;
  const hotelId = req.user.hotelId;

  try {
    const reservation = new Reservation({
      reservationNo: `${Date.now()}`,
      customerName, // 수정 가능
      phoneNumber, // 수정 가능
      checkIn: new Date(checkIn),
      checkOut: new Date(checkOut),
      reservationDate: new Date(reservationDate),
      roomInfo,
      price: parseFloat(price),
      paymentMethod,
      specialRequests,
      roomNumber,
      siteName,
      hotelId,
    });

    await reservation.save();
    logger.info(
      `On-site reservation saved successfully for hotelId: ${hotelId}`
    );
    res
      .status(201)
      .json({ message: '현장 예약이 저장되었습니다.', data: reservation });
  } catch (error) {
    logger.error('현장 예약 저장 실패:', error);
    res
      .status(500)
      .json({ message: '서버 오류가 발생했습니다.', error: error.message });
  }
};
