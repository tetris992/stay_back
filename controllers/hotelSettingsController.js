// backend/controllers/hotelSettingsController.js

import HotelSettingsModel from '../models/HotelSettings.js';
import logger from '../utils/logger.js';
import { defaultRoomTypes } from '../config/defaultRoomTypes.js';
import initializeHotelCollection from '../utils/initializeHotelCollection.js';
import availableOTAs from '../config/otas.js';

// 호텔 설정 가져오기
export const getHotelSettings = async (req, res) => {
  const hotelId = req.query.hotelId || req.user.hotelId; // 인증된 사용자 정보에서 hotelId 추출
  console.log('GET /hotel-settings called. hotelId:', hotelId); // 디버깅 로그

  if (!hotelId) {
    return res.status(400).send({ message: '호텔 ID는 필수입니다.' });
  }

  try {
    // 호텔 설정 검색
    let hotelSettings = await HotelSettingsModel.findOne({ hotelId }).select(
      '-__v'
    );

    if (hotelSettings) {
      res.status(200).json({
        message: '호텔 설정이 성공적으로 검색되었습니다.',
        data: hotelSettings,
      });
    } else {
      // 설정이 없을 경우, 기본 설정 생성
      const defaultSettings = {
        user: req.user._id, // 사용자 ID 포함
        hotelId,
        totalRooms: 50, // 기본값
        roomTypes: defaultRoomTypes, // 기본 룸 타입 로드
        otas: availableOTAs.map((ota) => ({ name: ota, isActive: false })),
        email: req.user.email || '', // 사용자 이메일 기본
        address: req.user.address || '', // 사용자 주소 기본
        phoneNumber: req.user.phoneNumber || '', // 사용자 전화번호 기본
        otaCredentials: {}, // 초기 OTA 자격 증명
      };

      hotelSettings = new HotelSettingsModel(defaultSettings);
      await hotelSettings.save();
      logger.info(`Created default HotelSettings for hotelId: ${hotelId}`);

      res.status(201).json({
        message: '호텔 설정이 생성되었습니다.',
        data: hotelSettings,
      });
    }
  } catch (error) {
    logger.error('호텔 설정 검색 중 오류 발생:', error);
    res
      .status(500)
      .send({ message: '서버 오류가 발생했습니다.', error: error.message });
  }
};

// 호텔 등록

export const registerHotel = async (req, res) => {
  const { hotelId, totalRooms, roomTypes, email, address, phoneNumber, otas } =
    req.body;

  // 필수 입력값 검증
  if (!hotelId || !totalRooms || !email || !address || !phoneNumber) {
    return res.status(400).send({
      message: '호텔 ID, 총 객실 수, 이메일, 주소, 전화번호는 필수입니다.',
    });
  }

  try {
    // 이미 등록된 호텔인지 확인
    const existingHotel = await HotelSettingsModel.findOne({ hotelId });
    if (existingHotel) {
      return res.status(409).send({ message: '이미 등록된 호텔 ID입니다.' });
    }

    // 룸 타입이 제공되지 않으면 기본 룸 타입 사용
    const finalRoomTypes =
      Array.isArray(roomTypes) && roomTypes.length > 0
        ? roomTypes
        : defaultRoomTypes;

    // OTA 설정이 제공되지 않으면 기본값 사용
    const finalOTAs =
      Array.isArray(otas) && otas.length > 0
        ? otas
        : availableOTAs.map((ota) => ({ name: ota, isActive: false }));

    // 새로운 호텔 등록
    const newHotel = new HotelSettingsModel({
      hotelId,
      totalRooms,
      roomTypes: finalRoomTypes,
      otas: finalOTAs,
      email,
      address,
      phoneNumber,
    });
    await newHotel.save();
    await initializeHotelCollection(hotelId);
    logger.info('New hotel registered:', hotelId);

    res
      .status(201)
      .send({ message: '호텔이 성공적으로 등록되었습니다.', data: newHotel });
  } catch (error) {
    logger.error('호텔 등록 중 오류 발생:', error);
    // Mongoose 유효성 검사 에러 처리
    if (error.name === 'ValidationError') {
      return res.status(400).send({ message: error.message });
    }
    res
      .status(500)
      .send({ message: '서버 오류가 발생했습니다.', error: error.message });
  }
};

export const updateHotelSettings = async (req, res) => {
  const { hotelId } = req.params;
  const {
    totalRooms,
    roomTypes,
    address,
    phoneNumber,
    email,
    otas,
    otaCredentials,
  } = req.body;

  console.log(`Received update request for hotelId: ${hotelId}`);
  console.log('Request Body:', req.body);

  if (!hotelId) {
    return res.status(400).send({ message: '호텔 ID는 필수입니다.' });
  }

  if (roomTypes && !Array.isArray(roomTypes)) {
    return res.status(400).send({ message: 'roomTypes는 배열이어야 합니다.' });
  }

  if (roomTypes) {
    for (const roomType of roomTypes) {
      if (!roomType.nameKor || !roomType.nameEng) {
        return res.status(400).send({
          message: '각 roomType은 nameKor와 nameEng를 포함해야 합니다.',
        });
      }
      if (
        typeof roomType.price !== 'number' ||
        typeof roomType.stock !== 'number'
      ) {
        return res.status(400).send({
          message:
            '각 roomType은 price와 stock을 포함한 유효한 숫자이어야 합니다.',
        });
      }
    }
  }

  if (otas && !Array.isArray(otas)) {
    return res.status(400).send({ message: 'otas는 배열이어야 합니다.' });
  }

  if (otas) {
    for (const ota of otas) {
      if (!ota.name || typeof ota.isActive !== 'boolean') {
        return res.status(400).send({
          message: '각 OTA는 name과 isActive를 포함해야 합니다.',
        });
      }
      if (!availableOTAs.includes(ota.name)) {
        return res.status(400).send({
          message: `유효하지 않은 OTA 이름: ${ota.name}.`,
        });
      }
    }
  }

  try {
    const updateData = {};
    if (totalRooms !== undefined) updateData.totalRooms = totalRooms;
    if (roomTypes !== undefined) updateData.roomTypes = roomTypes;
    if (address !== undefined) updateData.address = address;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
    if (email !== undefined) updateData.email = email;
    if (otas !== undefined) updateData.otas = otas;

    // ==== (추가) otaCredentials.yanolja가 있다면 업데이트 ====
    // "야놀자"를 사용하는 호텔만 이 값을 전송할 것
    if (otaCredentials?.yanolja) {
      updateData['otaCredentials.yanolja'] = otaCredentials.yanolja;
    }

    const updatedHotelSettings = await HotelSettingsModel.findOneAndUpdate(
      { hotelId },
      updateData,
      { new: true, runValidators: true }
    );

    if (updatedHotelSettings) {
      res.status(200).json({
        message: '호텔 설정이 성공적으로 업데이트되었습니다.',
        data: updatedHotelSettings,
      });
    } else {
      res.status(404).send({ message: '해당 호텔 설정을 찾을 수 없습니다.' });
    }
  } catch (error) {
    logger.error('호텔 설정 업데이트 중 오류 발생:', error);
    // Mongoose 유효성 검사 에러 처리
    if (error.name === 'ValidationError') {
      return res.status(400).send({ message: error.message });
    }
    res
      .status(500)
      .send({ message: '서버 오류가 발생했습니다.', error: error.message });
  }
};
