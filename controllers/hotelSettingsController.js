// backend/controllers/hotelSettingsController.js
import HotelSettingsModel from '../models/HotelSettings.js';
import logger from '../utils/logger.js';
import { defaultRoomTypes } from '../config/defaultRoomTypes.js';
import availableOTAs from '../config/otas.js';
import DEFAULT_AMENITIES from '../config/defaultAmenities.js';
import initializeHotelCollection from '../utils/initializeHotelCollection.js';
import { uploadToS3, s3Client } from '../utils/s3.js';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import mongoose from 'mongoose';

// FACILITY_SUB_CATEGORIES 정의
const FACILITY_SUB_CATEGORIES = [
  'lobby',
  'restaurant',
  'pool',
  'gym',
  'parkingLot',
  'laundryRoom',
  'loungeArea',
  'terrace',
  'rooftop',
  'spaSauna',
  'businessCenter',
  'meetingRoom',
  'banquetHall',
  'kidsClub',
  'barLounge',
  'cafe',
  'convenienceStore',
  'garden',
  'others',
];

/**
 * GET /hotel-settings
 * 호텔 설정 조회
 */
export const getHotelSettings = async (req, res) => {
  const { hotelId } = req.query;

  if (!hotelId) {
    return res
      .status(400)
      .json({ success: false, message: 'hotelId는 필수입니다.' });
  }

  try {
    // MongoDB 연결 상태 확인
    if (mongoose.connection.readyState !== 1) {
      logger.error('MongoDB is not connected');
      return res.status(503).json({
        success: false,
        message:
          '데이터베이스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.',
      });
    }

    let existing = await HotelSettingsModel.findOne({ hotelId }).select('-__v');
    if (existing) {
      // 기존 데이터에 photos 필드가 없거나 빈 배열이면 빈 배열로 설정
      if (!existing.photos || existing.photos.length === 0) {
        existing.photos = [];
      }

      // amenities 동기화 (on-site만)
      if (!existing.amenities || existing.amenities.length === 0) {
        existing.amenities = DEFAULT_AMENITIES.filter(
          (amenity) => amenity.type === 'on-site'
        ).map((amenity) => ({
          nameKor: amenity.nameKor,
          nameEng: amenity.nameEng,
          icon: amenity.icon,
          type: amenity.type,
          isActive: amenity.isActive || false,
        }));
      } else {
        const existingAmenityNames = existing.amenities.map((a) => a.nameKor);
        const missingAmenities = DEFAULT_AMENITIES.filter(
          (amenity) =>
            amenity.type === 'on-site' &&
            !existingAmenityNames.includes(amenity.nameKor)
        );
        existing.amenities = [
          ...existing.amenities,
          ...missingAmenities.map((amenity) => ({
            nameKor: amenity.nameKor,
            nameEng: amenity.nameEng,
            icon: amenity.icon,
            type: amenity.type,
            isActive: amenity.isActive || false,
          })),
        ];
      }

      // roomTypes의 roomAmenities 동기화 (in-room만)
      existing.roomTypes = existing.roomTypes.map((rt) => {
        if (!rt.roomAmenities || rt.roomAmenities.length === 0) {
          rt.roomAmenities = DEFAULT_AMENITIES.filter(
            (amenity) => amenity.type === 'in-room'
          ).map((amenity) => ({
            nameKor: amenity.nameKor,
            nameEng: amenity.nameEng,
            icon: amenity.icon,
            type: amenity.type,
            isActive: amenity.isActive || false,
          }));
        } else {
          const existingRoomAmenityNames = rt.roomAmenities.map(
            (a) => a.nameKor
          );
          const missingRoomAmenities = DEFAULT_AMENITIES.filter(
            (amenity) =>
              amenity.type === 'in-room' &&
              !existingRoomAmenityNames.includes(amenity.nameKor)
          );
          rt.roomAmenities = [
            ...rt.roomAmenities,
            ...missingRoomAmenities.map((amenity) => ({
              nameKor: amenity.nameKor,
              nameEng: amenity.nameEng,
              icon: amenity.icon,
              type: amenity.type,
              isActive: amenity.isActive || false,
            })),
          ];
        }
        return rt;
      });

      await existing.save();

      return res.status(200).json({
        success: true,
        message: '호텔 설정 조회 성공',
        data: existing,
      });
    }

    // 새로운 설정 생성
    const newSettings = new HotelSettingsModel({
      hotelId,
      totalRooms: defaultRoomTypes.reduce((sum, rt) => sum + rt.stock, 0),
      roomTypes: defaultRoomTypes.map((rt) => ({
        ...rt,
        roomAmenities: DEFAULT_AMENITIES.filter(
          (amenity) => amenity.type === 'in-room'
        ).map((amenity) => ({
          nameKor: amenity.nameKor,
          nameEng: amenity.nameEng,
          icon: amenity.icon,
          type: amenity.type,
          isActive: amenity.isActive || false,
        })),
        photos: [],
      })),
      otas: availableOTAs.map((ota) => ({ name: ota, isActive: false })),
      gridSettings: { floors: [] },
      amenities: DEFAULT_AMENITIES.filter(
        (amenity) => amenity.type === 'on-site'
      ).map((amenity) => ({
        nameKor: amenity.nameKor,
        nameEng: amenity.nameEng,
        icon: amenity.icon,
        type: amenity.type,
        isActive: amenity.isActive || false,
      })),
      photos: [],
    });
    await newSettings.save();
    await initializeHotelCollection(hotelId);

    logger.info(`HotelSettings created for hotelId: ${hotelId}`);
    return res.status(201).json({
      success: true,
      message: '기본 설정으로 호텔 설정이 생성되었습니다.',
      data: newSettings,
    });
  } catch (error) {
    logger.error('getHotelSettings error:', {
      message: error.message,
      stack: error.stack,
      hotelId,
    });
    return res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.',
      error: error.message,
    });
  }
};

/**
 * POST /hotel-settings
 * 호텔 설정 등록
 */
export const registerHotel = async (req, res) => {
  const {
    hotelId,
    totalRooms,
    roomTypes,
    otas,
    gridSettings,
    checkInTime,
    checkOutTime,
    amenities,
    photos,
    address,
    latitude, // 추가
    longitude, // 추가
    email,
    phoneNumber,
    hotelName,
  } = req.body;

  if (!hotelId) {
    return res
      .status(400)
      .json({ success: false, message: 'hotelId는 필수입니다.' });
  }

  try {
    const existing = await HotelSettingsModel.findOne({ hotelId });
    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: '이미 등록된 hotelId입니다.' });
    }

    const finalRoomTypes =
      Array.isArray(roomTypes) && roomTypes.length > 0
        ? roomTypes.map((rt) => ({
            ...rt,
            roomAmenities: rt.roomAmenities
              ? rt.roomAmenities.map((amenity) => ({
                  nameKor: amenity.nameKor,
                  nameEng: amenity.nameEng,
                  icon: amenity.icon,
                  type: amenity.type,
                  isActive: amenity.isActive || false,
                }))
              : DEFAULT_AMENITIES.filter(
                  (amenity) => amenity.type === 'in-room'
                ).map((amenity) => ({
                  nameKor: amenity.nameKor,
                  nameEng: amenity.nameEng,
                  icon: amenity.icon,
                  type: amenity.type,
                  isActive: amenity.isActive || false,
                })),
            photos: rt.photos || [],
          }))
        : defaultRoomTypes.map((rt) => ({
            ...rt,
            roomAmenities: DEFAULT_AMENITIES.filter(
              (amenity) => amenity.type === 'in-room'
            ).map((amenity) => ({
              nameKor: amenity.nameKor,
              nameEng: amenity.nameEng,
              icon: amenity.icon,
              type: amenity.type,
              isActive: amenity.isActive || false,
            })),
            photos: [],
          }));
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
    const finalAmenities =
      Array.isArray(amenities) && amenities.length > 0
        ? amenities.map((amenity) => ({
            nameKor: amenity.nameKor,
            nameEng: amenity.nameEng,
            icon: amenity.icon,
            type: amenity.type,
            isActive: amenity.isActive || false,
          }))
        : DEFAULT_AMENITIES.filter((amenity) => amenity.type === 'on-site').map(
            (amenity) => ({
              nameKor: amenity.nameKor,
              nameEng: amenity.nameEng,
              icon: amenity.icon,
              type: amenity.type,
              isActive: amenity.isActive || false,
            })
          );
    const finalPhotos = Array.isArray(photos) ? photos : [];

    const newSettings = new HotelSettingsModel({
      hotelId,
      totalRooms: totalRooms || 50,
      roomTypes: finalRoomTypes,
      otas: finalOTAs,
      gridSettings: finalGridSettings,
      amenities: finalAmenities,
      photos: finalPhotos,
      checkInTime,
      checkOutTime,
      address,
      latitude, // 추가
      longitude, // 추가
      email,
      phoneNumber,
      hotelName,
    });

    await newSettings.save();
    await initializeHotelCollection(hotelId);

    return res.status(201).json({
      success: true,
      message: '호텔 설정이 성공적으로 등록되었습니다.',
      data: newSettings,
    });
  } catch (error) {
    logger.error('registerHotel error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: error.message });
    }
    return res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.',
      error: error.message,
    });
  }
};

/**
 * PATCH /hotel-settings/:hotelId
 * 호텔 설정 업데이트
 */
export const updateHotelSettings = async (req, res) => {
  const { hotelId } = req.params;
  const {
    totalRooms,
    roomTypes,
    otas,
    gridSettings,
    otaCredentials,
    checkInTime,
    checkOutTime,
    amenities,
    photos,
    address,
    latitude, // 추가
    longitude, // 추가
    email,
    phoneNumber,
    hotelName,
  } = req.body;

  if (!hotelId) {
    return res
      .status(400)
      .json({ success: false, message: 'hotelId는 필수입니다.' });
  }

  try {
    const updateData = {};

    if (typeof totalRooms === 'number') updateData.totalRooms = totalRooms;

    if (roomTypes !== undefined) {
      updateData.roomTypes = roomTypes.map((rt) => ({
        ...rt,
        isBaseRoom: rt.isBaseRoom,
        roomAmenities: rt.roomAmenities
          ? rt.roomAmenities.map((amenity) => ({
              nameKor: amenity.nameKor,
              nameEng: amenity.nameEng,
              icon: amenity.icon,
              type: amenity.type,
              isActive: amenity.isActive ?? false,
            }))
          : DEFAULT_AMENITIES.filter(
              (amenity) => amenity.type === 'in-room'
            ).map((amenity) => ({
              nameKor: amenity.nameKor,
              nameEng: amenity.nameEng,
              icon: amenity.icon,
              type: amenity.type,
              isActive: amenity.isActive ?? false,
            })),
        photos: rt.photos || [],
      }));
      logger.info(
        `[updateHotelSettings] roomTypes with roomAmenities: ${JSON.stringify(
          updateData.roomTypes
        )}`
      );
    }

    if (otas !== undefined) updateData.otas = otas;

    if (gridSettings !== undefined && typeof gridSettings === 'object') {
      updateData.gridSettings = {
        floors: Array.isArray(gridSettings.floors) ? gridSettings.floors : [],
      };
    }

    if (otaCredentials !== undefined)
      updateData.otaCredentials = otaCredentials;
    if (checkInTime !== undefined) updateData.checkInTime = checkInTime;
    if (checkOutTime !== undefined) updateData.checkOutTime = checkOutTime;

    if (amenities !== undefined) {
      updateData.amenities = amenities.length
        ? amenities.map((amenity) => ({
            nameKor: amenity.nameKor,
            nameEng: amenity.nameEng,
            icon: amenity.icon,
            type: amenity.type,
            isActive: amenity.isActive ?? false,
          }))
        : DEFAULT_AMENITIES.filter((amenity) => amenity.type === 'on-site').map(
            (amenity) => ({
              nameKor: amenity.nameKor,
              nameEng: amenity.nameEng,
              icon: amenity.icon,
              type: amenity.type,
              isActive: amenity.isActive ?? false,
            })
          );
    }

    if (photos !== undefined) updateData.photos = photos;
    if (address !== undefined) updateData.address = address;
    if (latitude !== undefined) updateData.latitude = latitude; // 추가
    if (longitude !== undefined) updateData.longitude = longitude; // 추가
    if (email !== undefined) updateData.email = email;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
    if (hotelName !== undefined) updateData.hotelName = hotelName;

    logger.info(
      `[updateHotelSettings] updateData: ${JSON.stringify(updateData)}`
    );

    const updated = await HotelSettingsModel.findOneAndUpdate(
      { hotelId },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res
        .status(404)
        .json({ success: false, message: '해당 호텔 설정이 없습니다.' });
    }

    logger.info(
      `[updateHotelSettings] Updated document: ${JSON.stringify(updated)}`
    );

    return res.status(200).json({
      success: true,
      message: '호텔 설정이 성공적으로 업데이트되었습니다.',
      data: updated,
    });
  } catch (error) {
    logger.error('updateHotelSettings error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: error.message });
    }
    return res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.',
      error: error.message,
    });
  }
};

/**
 * POST /hotel-settings/photos
 * 사진 업로드
 */
export const uploadHotelPhoto = async (req, res) => {
  const { hotelId, category, subCategory } = req.body;
  const files = req.files; // 다중 파일 처리
  const orders = req.body.order || []; // order 배열 받기

  if (!hotelId || !category || !subCategory || !files || files.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'hotelId, category, subCategory, photo는 필수입니다.',
    });
  }

  const validCategories = ['room', 'exterior', 'facility'];
  if (!validCategories.includes(category)) {
    return res.status(400).json({
      success: false,
      message: `category는 ${validCategories.join(', ')} 중 하나여야 합니다.`,
    });
  }

  if (
    category === 'facility' &&
    !FACILITY_SUB_CATEGORIES.includes(subCategory)
  ) {
    return res.status(400).json({
      success: false,
      message: `facility subCategory는 ${FACILITY_SUB_CATEGORIES.join(
        ', '
      )} 중 하나여야 합니다.`,
    });
  }

  // order 값 검증
  const parsedOrders = Array.isArray(orders)
    ? orders.map((ord) => parseInt(ord, 10))
    : files.map(() => 1); // order가 없으면 기본값 1
  if (parsedOrders.some((ord) => isNaN(ord) || ord < 1 || ord > 100)) {
    return res.status(400).json({
      success: false,
      message: 'order는 1에서 100 사이의 숫자여야 합니다.',
    });
  }

  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();

    const hotelSettings = await HotelSettingsModel.findOne({ hotelId }).session(
      session
    );
    if (!hotelSettings) {
      throw new Error('호텔 설정을 찾을 수 없습니다.');
    }

    const newPhotos = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const parsedOrder = parsedOrders[i] || 1; // 개별 order 값 사용
      const photoUrl = await uploadToS3(file, hotelId, category, subCategory);
      const newPhoto = {
        category,
        subCategory,
        photoUrl,
        order: parsedOrder,
        isActive: true,
      };
      if (category === 'room') {
        const roomType = hotelSettings.roomTypes.find(
          (rt) => rt.roomInfo === subCategory
        );
        if (!roomType) {
          throw new Error(`유효하지 않은 객실 타입: ${subCategory}`);
        }
        roomType.photos.push(newPhoto);
      } else {
        hotelSettings.photos.push(newPhoto);
      }
      newPhotos.push(newPhoto);
    }

    await hotelSettings.save({ session });
    await session.commitTransaction();

    newPhotos.forEach((photo) => {
      logger.info(`Photo uploaded: ${photo.photoUrl}, hotelId: ${hotelId}`);
      if (req.app.get('io')) {
        req.app.get('io').to(hotelId).emit('photoUploaded', { hotelId, photo });
      }
    });

    res.status(201).json({
      success: true,
      message: '사진 업로드 성공',
      photos: newPhotos,
    });
  } catch (error) {
    if (session) {
      await session.abortTransaction();
    }
    logger.error(`Photo upload error: ${error.message}`, {
      hotelId,
      category,
      subCategory,
      stack: error.stack,
    });
    res.status(error.message.includes('유효하지 않은') ? 400 : 500).json({
      success: false,
      message: `사진 업로드 실패: ${error.message}`,
    });
  } finally {
    if (session) {
      session.endSession();
    }
  }
};

/**
 * GET /hotel-settings/photos
 * 사진 목록 조회 – roomPhotos와 commonPhotos로 분리하여 반환
 */
export const getHotelPhotos = async (req, res) => {
  try {
    const { hotelId, category, subCategory } = req.query;

    if (!hotelId) {
      return res.status(400).json({ message: 'hotelId is required' });
    }

    // req.user (HMS 프론트엔드) 또는 req.customer (단잠앱) 확인
    const user = req.user || req.customer;
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized, user not found' });
    }

    logger.info(`Fetching photos for hotelId: ${hotelId}, category: ${category}, subCategory: ${subCategory}, user: ${user._id}`);

    const hotelSettings = await HotelSettingsModel.findOne({ hotelId }).lean();
    if (!hotelSettings) {
      return res.status(404).json({ message: 'Hotel settings not found' });
    }

    // 공통 사진 (exterior, facility)
    const commonPhotos = hotelSettings.photos || [];

    // 객실별 사진 (roomTypes.photos)
    const roomPhotos = hotelSettings.roomTypes
      .flatMap((rt) =>
        (rt.photos || []).map((photo) => ({
          ...photo,
          subCategory: rt.roomInfo, // 객실 타입을 subCategory로 설정
        }))
      )
      .filter((photo) => photo.isActive);

    const filteredCommonPhotos = commonPhotos.filter(
      (photo) =>
        (!category || photo.category === category) &&
        (!subCategory || photo.subCategory === subCategory) &&
        photo.isActive
    );

    const filteredRoomPhotos = roomPhotos.filter(
      (photo) =>
        (!category || photo.category === category) &&
        (!subCategory || photo.subCategory === subCategory) &&
        photo.isActive
    );

    res.status(200).json({
      success: true,
      hotelId,
      commonPhotos: filteredCommonPhotos,
      roomPhotos: filteredRoomPhotos,
    });
  } catch (error) {
    logger.error(`Error fetching hotel photos: ${error.message}`, error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
/**
 * DELETE /hotel-settings/photos
 * 사진 삭제
 */
export const deleteHotelPhoto = async (req, res) => {
  const { hotelId, category, subCategory, photoUrl } = req.body;

  if (!hotelId || !category || !subCategory || !photoUrl) {
    return res.status(400).json({
      success: false,
      message: 'hotelId, category, subCategory, photoUrl은 필수입니다.',
    });
  }

  try {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const hotelSettings = await HotelSettingsModel.findOne({
        hotelId,
      }).session(session);
      if (!hotelSettings) {
        throw new Error('호텔 설정을 찾을 수 없습니다.');
      }

      // 카테고리에 따라 사진 삭제 위치 결정
      if (category === 'room') {
        const roomType = hotelSettings.roomTypes.find(
          (rt) => rt.roomInfo === subCategory
        );
        if (!roomType) {
          throw new Error(`유효하지 않은 객실 타입: ${subCategory}`);
        }
        roomType.photos = roomType.photos.filter(
          (photo) =>
            !(
              photo.category === category &&
              photo.subCategory === subCategory &&
              photo.photoUrl === photoUrl
            )
        );
      } else {
        hotelSettings.photos = hotelSettings.photos.filter(
          (photo) =>
            !(
              photo.category === category &&
              photo.subCategory === subCategory &&
              photo.photoUrl === photoUrl
            )
        );
      }

      // S3에서 사진 삭제
      const key = photoUrl.split(
        `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/`
      )[1];
      const params = {
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: key,
      };

      await s3Client.send(new DeleteObjectCommand(params));
      logger.info(`Photo deleted from S3: ${photoUrl}`);

      await hotelSettings.save({ session });
      await session.commitTransaction();

      logger.info(
        `Photo deleted from MongoDB for hotelId: ${hotelId}, url: ${photoUrl}`
      );

      if (req.app.get('io')) {
        req.app.get('io').to(hotelId).emit('photoDeleted', {
          hotelId,
          category,
          subCategory,
          photoUrl,
        });
      }

      res
        .status(200)
        .json({ success: true, message: '사진이 삭제되었습니다.' });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    logger.error(`Delete hotel photo error: ${error.message}`, { hotelId });
    res
      .status(500)
      .json({ success: false, message: `서버 오류: ${error.message}` });
  }
};
