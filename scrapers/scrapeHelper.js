// backend/scrapers/scrapeHelper.js

import axios from 'axios';
import logger from '../utils/logger.js';
import RefreshToken from '../models/RefreshToken.js'; // RefreshToken 모델 임포트
import dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3003';

/**
 * hotelId를 사용하여 RefreshToken을 조회하고, 이를 통해 새로운 accessToken을 획득합니다.
 * @param {String} hotelId - 호텔 ID
 * @returns {String} accessToken - 새로 획득한 accessToken
 */
const getAccessToken = async (hotelId) => {
  try {
    const refreshTokenEntry = await RefreshToken.findOne({ hotelId });
    if (!refreshTokenEntry) {
      throw new Error(`No refresh token found for hotelId: ${hotelId}`);
    }

    const refreshToken = refreshTokenEntry.token;

    // 리프레시 토큰을 쿠키에 담아 요청
    const response = await axios.post(
      `${API_BASE_URL}/auth/refresh-token`,
      {}, // 요청 본문이 없으므로 빈 객체 전달
      {
        headers: {
          Cookie: `refreshToken=${refreshToken}`, // 쿠키에 리프레시 토큰 설정
        },
        withCredentials: true, // 쿠키 전송을 위해 필요할 수 있음
      }
    );

    const { accessToken } = response.data;

    if (!accessToken) {
      throw new Error('No accessToken returned from refresh-token endpoint');
    }

    return accessToken;
  } catch (error) {
    logger.error(
      `Failed to get accessToken for hotelId: ${hotelId}`,
      error.response?.data || error.message
    );
    throw error;
  }
};

/**
 * 예약 데이터를 서버의 /reservations 엔드포인트로 전송합니다.
 * @param {String} hotelId - 호텔 ID
 * @param {String} siteName - 예약 사이트 이름
 * @param {Array} reservations - 예약 데이터 배열
 */

export const sendReservations = async (hotelId, siteName, reservations) => {
  try {
    const accessToken = await getAccessToken(hotelId);

    await axios.post(
      `${API_BASE_URL}/reservations`,
      { siteName, reservations, hotelId },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    logger.info(
      `${siteName} reservations successfully saved for hotelId ${hotelId}.`
    );
  } catch (error) {
    logger.error(
      `Error saving ${siteName} reservations for hotelId ${hotelId}:`,
      error.response?.data || error.message
    );
    throw error;
  }
};
