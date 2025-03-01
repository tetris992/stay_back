import HotelSettingsModel from '../models/HotelSettings.js';
import logger from '../utils/logger.js';
import { defaultRoomTypes } from '../config/defaultRoomTypes.js';
import availableOTAs from '../config/otas.js';
import initializeHotelCollection from '../utils/initializeHotelCollection.js';

/**
 * GET /hotel-settings
 */

export const getHotelSettings = async (req, res) => {
  const hotelId = req.query.hotelId;

  if (!hotelId) {
    return res.status(400).json({ message: 'hotelId는 필수입니다.' });
  }

  try {
    const existing = await HotelSettingsModel.findOne({ hotelId }).select('-__v');
    if (existing) {
      return res.status(200).json({
        message: '호텔 설정 조회 성공',
        data: existing,
      });
    } else {
      const newSettings = new HotelSettingsModel({
        hotelId,
        totalRooms: defaultRoomTypes.reduce((sum, rt) => sum + rt.stock, 0),
        roomTypes: defaultRoomTypes, // 디폴트 값 적용
        otas: availableOTAs.map((ota) => ({ name: ota, isActive: false })),
        gridSettings: { floors: [] },
      });
      await newSettings.save();
      await initializeHotelCollection(hotelId);

      logger.info(`HotelSettings created for hotelId: ${hotelId}`);
      return res.status(201).json({
        message: '기본 설정으로 호텔 설정이 생성되었습니다.',
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
 * POST /hotel-settings
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

    const finalRoomTypes =
      Array.isArray(roomTypes) && roomTypes.length > 0
        ? roomTypes
        : defaultRoomTypes;
    const finalOTAs =
      Array.isArray(otas) && otas.length > 0
        ? otas
        : availableOTAs.map((ota) => ({ name: ota, isActive: false }));

    const finalGridSettings =
      gridSettings &&
      typeof gridSettings === 'object' &&
      Array.isArray(gridSettings.floors)
        ? { floors: gridSettings.floors }
        : { floors: [] };

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
 */
export const updateHotelSettings = async (req, res) => {
  const { hotelId } = req.params;
  const { totalRooms, roomTypes, otas, gridSettings, otaCredentials } =
    req.body;

  if (!hotelId) {
    return res.status(400).json({ message: 'hotelId는 필수입니다.' });
  }

  if (roomTypes && !Array.isArray(roomTypes)) {
    return res.status(400).json({ message: 'roomTypes는 배열이어야 합니다.' });
  }
  if (otas && !Array.isArray(otas)) {
    return res.status(400).json({ message: 'otas는 배열이어야 합니다.' });
  }

  try {
    const updateData = {};

    if (typeof totalRooms === 'number') updateData.totalRooms = totalRooms;
    if (roomTypes !== undefined) updateData.roomTypes = roomTypes;
    if (otas !== undefined) updateData.otas = otas;
    if (gridSettings !== undefined && typeof gridSettings === 'object') {
      updateData.gridSettings = {
        floors: Array.isArray(gridSettings.floors) ? gridSettings.floors : [],
      };
    }
    if (otaCredentials !== undefined)
      updateData.otaCredentials = otaCredentials;

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
