// backend/controllers/authController.js

import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import HotelSettings from '../models/HotelSettings.js';
import RefreshToken from '../models/RefreshToken.js';
import PasswordResetToken from '../models/PasswordResetToken.js';
import logger from '../utils/logger.js';
import scraperManager from '../scrapers/scraperManager.js';
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
    if (user && (await user.comparePassword(password))) {
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

      // 리프레시 토큰을 HTTP-only 쿠키로 설정 (보안 강화)
      res.cookie('refreshToken', refreshTokenDoc.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict', //
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1년
      });

      // 응답 시 필요한 정보만 반환하여 보안 강화
      res.status(200).json({ accessToken, isRegistered });
    } else {
      res.status(401).json({ message: 'Invalid hotel ID or password' });
    }
  } catch (error) {
    logger.error(`Login error: ${error.message}`, error);
    res.status(500).json({ message: '서버 오류' });
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
  const hotelId = req.user ? req.user.hotelId : req.body.hotelId; // 인증된 사용자에서 hotelId 추출

  if (refreshToken && hotelId) {
    try {
      // RefreshToken에서 사용자 제거
      await RefreshToken.findOneAndDelete({ token: refreshToken });

      // OTA 상태 비활성화
      await HotelSettings.findOneAndUpdate(
        { hotelId },
        { $set: { 'otas.$[].isActive': false } } // 모든 OTA의 isActive 필드를 false로 설정
      );

      // 세션이나 인증 정보를 클리어 (Express Session을 사용하는 경우)
      if (req.session) {
        req.session.destroy(async (err) => {
          if (err) {
            logger.error('Error destroying session:', err);
            return res.status(500).json({ message: 'Internal Server Error' });
          }

          // 스크래핑 작업 중지
          try {
            await scraperManager.stopScraping(hotelId);
            logger.info(
              `Scraping stopped for hotelId: ${hotelId} upon logout.`
            );
          } catch (scraperError) {
            logger.error(
              `Error stopping scraper during logout for hotelId: ${hotelId}`,
              scraperError
            );
            // 사용자에게 알림 (선택 사항)
          }

          // 큐 초기화
          scraperManager.clearHotelScheduling(hotelId);

          // 쿠키 삭제
          res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
          });

          res.status(200).json({ message: '로그아웃 되었습니다.' });
        });
      } else {
        // 세션을 사용하지 않는 경우
        // 스크래핑 작업 중지
        await scraperManager.stopScraping(hotelId).catch((err) => {
          logger.error(
            `Failed to stop scraping during logout for hotelId: ${hotelId}`,
            err
          );
        });

        // 쿠키 삭제
        res.clearCookie('refreshToken', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
        });

        res.status(200).json({ message: '로그아웃 되었습니다.' });
      }
    } catch (error) {
      logger.error('Logout Error:', error);
      res.status(500).json({ message: '서버 오류로 로그아웃 실패' });
    }
  } else {
    res.status(400).json({ message: '리프레시 토큰이 존재하지 않습니다.' });
  }
};

// 사용자 등록 함수 수정
export const registerUser = async (req, res) => {
  const { hotelId, password, email, address, phoneNumber } = req.body;

  // 필수 입력값 검증
  if (!hotelId || !password || !email || !address || !phoneNumber) {
    return res
      .status(400)
      .send({ message: '모든 필수 입력값을 입력해주세요.' });
  }

  try {
    // 중복된 hotelId, email, phoneNumber 체크
    const existingUser = await User.findOne({
      $or: [{ hotelId }, { email }, { phoneNumber }],
    });

    if (existingUser) {
      let message = '이미 존재하는 사용자입니다.';
      if (existingUser.hotelId === hotelId) message += '호텔 ID';
      else if (existingUser.email === email) message += '이메일';
      else if (existingUser.phoneNumber === phoneNumber) message += '전화번호';
      message += '입니다.';
      return res.status(409).send({ message });
    }

    // 사용자 계정 생성
    const newUser = new User({
      hotelId,
      password,
      email,
      address,
      phoneNumber,
    });
    await newUser.save();
    logger.info('New user account created:', hotelId);

    // ScraperManager를 사용하여 스크래핑 시작
    await scraperManager.startScraping(newUser.hotelId);
    logger.info(
      `Scraping started for hotelId: ${newUser.hotelId} upon registration.`
    );

    res.status(201).send({
      message: 'User account registered successfully',
      data: {
        hotelId: newUser.hotelId,
        email: newUser.email,
        address: newUser.address,
        phoneNumber: newUser.phoneNumber,
        createdAt: newUser.createdAt,
        updatedAt: newUser.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Error registering user:', error);
    res.status(500).send({ message: '서버 오류가 발생했습니다.' });
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
        _id: user._id, // _id 필드 추가
        hotelId: user.hotelId,
        email: user.email,
        address: user.address,
        phoneNumber: user.phoneNumber,
        consentChecked: user.consentChecked, // 동의 상태 추가
        consentAt: user.consentAt, // 동의 시각 추가
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
  const { email, address, phoneNumber, password } = req.body;

  try {
    if (req.user.hotelId !== hotelId) {
      return res.status(403).json({ message: '권한이 없습니다.' });
    }

    const user = await User.findOne({ hotelId });

    if (!user) {
      return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    }

    // 사용자 정보 업데이트
    if (email) user.email = email;
    if (address) user.address = address;
    if (phoneNumber) user.phoneNumber = phoneNumber;
    if (password) user.password = password;

    await user.save();
    logger.info(`User ${hotelId} updated successfully.`);

    res.status(200).json({
      message: '사용자 정보가 성공적으로 업데이트되었습니다.',
      data: {
        hotelId: user.hotelId,
        email: user.email,
        address: user.address,
        phoneNumber: user.phoneNumber,
        consentChecked: user.consentChecked, // 동의 상태 추가
        consentAt: user.consentAt, // 동의 시각 추가
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
      fs.mkdirSync(logsDir, { recursive: true }); // 수정된 부분: logPath -> logsDir
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
  const { email } = req.body;

  // 이메일을 통해 사용자 찾기
  const user = await User.findOne({ email });
  if (!user) {
    return res
      .status(404)
      .json({ message: '해당 이메일의 유저를 찾을 수 없습니다.' });
  }

  // 기존 토큰이 있으면 삭제
  await PasswordResetToken.deleteMany({ hotelId: user.hotelId });

  // 토큰 생성
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1시간 후 만료

  await PasswordResetToken.create({
    hotelId: user.hotelId,
    token,
    expiresAt,
  });

  const resetLink = `${process.env.FRONTEND_URL}/reset-password/${token}`;
  // FRONTEND_URL은 .env 등에 설정해둔 프론트엔드 주소
  // 해당 링크를 이메일로 전송

  await sendEmail({
    to: email,
    subject: '비밀번호 재설정 안내',
    text: `아래 링크를 클릭하여 비밀번호를 재설정하세요: ${resetLink}`,
  });

  return res.json({ message: '비밀번호 재설정 이메일을 전송했습니다.' });
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
