// backend/controllers/hotelSettings.controller.js
import HotelSettingsModel from '../models/HotelSettings.js';
import logger from '../utils/logger.js';
import { defaultRoomTypes } from '../config/defaultRoomTypes.js';
import availableOTAs from '../config/otas.js';
import initializeHotelCollection from '../utils/initializeHotelCollection.js';

/**
 * GET /hotel-settings
 *  - Query parameter: hotelId (예: ?hotelId=xxxx)
 *  - 해당 호텔의 설정이 존재하면 반환하고, 없으면 기본값(객실 타입, gridSettings 등)으로 새 문서를 생성 후 반환합니다.
 */
export const getHotelSettings = async (req, res) => {
  const hotelId = req.query.hotelId;

  if (!hotelId) {
    return res.status(400).json({ message: 'hotelId는 필수입니다.' });
  }

  try {
    const existing = await HotelSettingsModel.findOne({ hotelId }).select('-__v');
    if (existing) {
      // 이미 존재하면 그대로 반환
      return res.status(200).json({
        message: '호텔 설정 조회 성공',
        data: existing,
      });
    } else {
      // 새 호텔 설정 생성 시
      const newSettings = new HotelSettingsModel({
        hotelId,
        totalRooms: 50, // 초기값
        roomTypes: defaultRoomTypes,
        otas: availableOTAs.map((ota) => ({ name: ota, isActive: false })),
        // 그리드: 초기에는 빈 상태로 생성
        gridSettings: { rows: 0, cols: 0, containers: [] },
      });
      await newSettings.save();

      // 필요한 경우, 호텔 전용 컬렉션 초기화
      await initializeHotelCollection(hotelId);

      logger.info(`HotelSettings created with defaultRoomTypes for hotelId: ${hotelId}`);
      return res.status(201).json({
        message: '기본 룸타입으로 호텔 설정이 생성되었습니다.',
        data: newSettings,
      });
    }
  } catch (error) {
    logger.error('getHotelSettings error:', error);
    return res.status(500).json({
      message: '서버 오류가 발생했습니다.',
      error: error.message,
    });
  }
};

/**
 * POST /hotel-settings/register
 *  - 새로운 호텔 설정을 등록합니다.
 *  - 요청 본문에는 hotelId, totalRooms, roomTypes, otas, gridSettings 등이 포함됩니다.
 *  - gridSettings는 { rows, cols, containers } 형식이며,
 *    containers 배열의 각 객체는 아래 필드를 사용할 수 있습니다:
 *    {
 *      containerId: string,
 *      row: number,
 *      col: number,
 *      roomInfo: string,       // 여기서 '룸타입' 역할
 *      roomNumber: string,
 *      price: number
 *    }
 */
export const registerHotel = async (req, res) => {
  const { hotelId, totalRooms, roomTypes, otas, gridSettings } = req.body;

  if (!hotelId) {
    return res.status(400).json({ message: 'hotelId는 필수입니다.' });
  }

  try {
    const existing = await HotelSettingsModel.findOne({ hotelId });
    if (existing) {
      return res.status(409).json({ message: '이미 등록된 hotelId입니다.' });
    }

    // roomTypes와 otas는 값이 없으면 기본값 사용
    const finalRoomTypes = Array.isArray(roomTypes) && roomTypes.length > 0
      ? roomTypes
      : defaultRoomTypes;
    const finalOTAs = Array.isArray(otas) && otas.length > 0
      ? otas
      : availableOTAs.map((ota) => ({ name: ota, isActive: false }));

    // gridSettings가 제공되었을 경우, rows/cols/containers 필드 유효성 체크
    const finalGridSettings = gridSettings && typeof gridSettings === 'object'
      ? {
          rows: gridSettings.rows || 0,
          cols: gridSettings.cols || 0,
          containers: Array.isArray(gridSettings.containers)
            ? gridSettings.containers
            : [],
        }
      : { rows: 0, cols: 0, containers: [] };

    const newSettings = new HotelSettingsModel({
      hotelId,
      totalRooms: totalRooms || 50,
      roomTypes: finalRoomTypes,
      otas: finalOTAs,
      gridSettings: finalGridSettings,
    });

    await newSettings.save();
    await initializeHotelCollection(hotelId);

    return res.status(201).json({
      message: '호텔 설정이 성공적으로 등록되었습니다.',
      data: newSettings,
    });
  } catch (error) {
    logger.error('registerHotel error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({
      message: '서버 오류가 발생했습니다.',
      error: error.message,
    });
  }
};

/**
 * PATCH /hotel-settings/:hotelId
 *  - 호텔 설정의 부분 업데이트를 수행합니다.
 *  - 업데이트 가능한 필드: totalRooms, roomTypes, otas, gridSettings, otaCredentials 등
 *  - gridSettings 업데이트 시, { rows, cols, containers } 형태여야 하며,
 *    containers 각 객체는 { containerId, row, col, roomInfo, roomNumber, price } 필드를 포함할 수 있습니다.
 */
export const updateHotelSettings = async (req, res) => {
  const { hotelId } = req.params;
  const { totalRooms, roomTypes, otas, gridSettings, otaCredentials } = req.body;

  if (!hotelId) {
    return res.status(400).json({ message: 'hotelId는 필수입니다.' });
  }

  // 배열형 필드 검증
  if (roomTypes && !Array.isArray(roomTypes)) {
    return res.status(400).json({ message: 'roomTypes는 배열이어야 합니다.' });
  }
  if (otas && !Array.isArray(otas)) {
    return res.status(400).json({ message: 'otas는 배열이어야 합니다.' });
  }

  try {
    const updateData = {};

    // 필요한 필드만 updateData에 세팅
    if (typeof totalRooms === 'number') {
      updateData.totalRooms = totalRooms;
    }
    if (roomTypes !== undefined) {
      updateData.roomTypes = roomTypes;
    }
    if (otas !== undefined) {
      updateData.otas = otas;
    }
    if (gridSettings !== undefined && typeof gridSettings === 'object') {
      updateData.gridSettings = {
        rows: gridSettings.rows || 0,
        cols: gridSettings.cols || 0,
        containers: Array.isArray(gridSettings.containers)
          ? gridSettings.containers
          : [],
      };
    }
    if (otaCredentials !== undefined) {
      updateData.otaCredentials = otaCredentials;
    }

    const updated = await HotelSettingsModel.findOneAndUpdate(
      { hotelId },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: '해당 호텔 설정이 없습니다.' });
    }

    return res.status(200).json({
      message: '호텔 설정이 성공적으로 업데이트되었습니다.',
      data: updated,
    });
  } catch (error) {
    logger.error('updateHotelSettings error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({
      message: '서버 오류가 발생했습니다.',
      error: error.message,
    });
  }
};
