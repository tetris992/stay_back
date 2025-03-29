// backend/controllers/hotelPhotosController.js
import { uploadToS3 } from '../utils/s3.js';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'; // S3 삭제 명령 추가
import getHotelPhotosModel from '../models/HotelPhotos.js';
import HotelSettingsModel from '../models/HotelSettings.js';
import logger from '../utils/logger.js';
import mongoose from 'mongoose';

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// 사진 업로드 처리
export const uploadHotelPhoto = async (req, res) => {
  const { hotelId, category, subCategory, order } = req.body;
  const file = req.file;

  if (!hotelId || !category || !subCategory || !file) {
    return res.status(400).json({ message: 'hotelId, category, subCategory, photo는 필수입니다.' });
  }

  const parsedOrder = parseInt(order, 10);
  if (isNaN(parsedOrder) || parsedOrder < 1 || parsedOrder > 100) {
    return res.status(400).json({ message: 'order는 1에서 100 사이의 숫자여야 합니다.' });
  }

  try {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const hotelSettings = await HotelSettingsModel.findOne({ hotelId });
      if (!hotelSettings) {
        throw new Error('호텔 설정을 찾을 수 없습니다.');
      }

      if (category === 'room') {
        const roomType = hotelSettings.roomTypes.find(rt => rt.roomInfo === subCategory);
        if (!roomType) {
          throw new Error(`유효하지 않은 객실 타입: ${subCategory}`);
        }
      }

      const photoUrl = await uploadToS3(file, hotelId, category, subCategory);
      const HotelPhotos = getHotelPhotosModel(hotelId);
      let hotelPhotosDoc = await HotelPhotos.findOne();

      if (!hotelPhotosDoc) {
        hotelPhotosDoc = new HotelPhotos({ photos: [] });
      }

      const newPhoto = {
        category,
        subCategory,
        photoUrl,
        order: parsedOrder,
        isActive: true,
      };
      hotelPhotosDoc.photos.push(newPhoto);
      await hotelPhotosDoc.save({ session });

      await session.commitTransaction();

      logger.info(`Photo uploaded and saved for hotelId: ${hotelId}, url: ${photoUrl}`);

      if (req.app.get('io')) {
        req.app.get('io').to(hotelId).emit('photoUploaded', {
          hotelId,
          photo: newPhoto,
        });
      }

      res.status(201).json({ message: '사진 업로드 성공', photo: newPhoto });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    logger.error(`Photo upload error: ${error.message}`, { hotelId, category, subCategory });
    res.status(error.message.includes('유효하지 않은') ? 400 : 500).json({ message: error.message });
  }
};

// 사진 목록 조회
export const getHotelPhotos = async (req, res) => {
  const { hotelId, category, subCategory } = req.query;
  if (!hotelId) {
    return res.status(400).json({ message: 'hotelId는 필수입니다.' });
  }

  try {
    const HotelPhotos = getHotelPhotosModel(hotelId);
    const photosDoc = await HotelPhotos.findOne();
    let photos = photosDoc ? photosDoc.photos : [];

    if (category) {
      photos = photos.filter(p => p.category === category);
      if (subCategory) {
        photos = photos.filter(p => p.subCategory === subCategory);
      }
    }

    res.status(200).json({ hotelId, photos });
  } catch (error) {
    logger.error(`Get hotel photos error: ${error.message}`, { hotelId });
    res.status(500).json({ message: `서버 오류: ${error.message}` });
  }
};

// 사진 삭제
export const deleteHotelPhoto = async (req, res) => {
  const { hotelId, category, subCategory, photoUrl } = req.body;

  if (!hotelId || !category || !subCategory || !photoUrl) {
    return res.status(400).json({ message: 'hotelId, category, subCategory, photoUrl은 필수입니다.' });
  }

  try {
    const HotelPhotos = getHotelPhotosModel(hotelId);
    const hotelPhotosDoc = await HotelPhotos.findOne();

    if (!hotelPhotosDoc) {
      return res.status(404).json({ message: '사진 데이터가 없습니다.' });
    }

    // MongoDB에서 사진 삭제
    hotelPhotosDoc.photos = hotelPhotosDoc.photos.filter(
      (photo) =>
        !(photo.category === category && photo.subCategory === subCategory && photo.photoUrl === photoUrl)
    );

    // S3에서 사진 삭제
    const key = photoUrl.split(`https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/`)[1];
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
    };

    await s3Client.send(new DeleteObjectCommand(params));
    logger.info(`Photo deleted from S3: ${photoUrl}`);

    await hotelPhotosDoc.save();
    logger.info(`Photo deleted from MongoDB for hotelId: ${hotelId}, url: ${photoUrl}`);

    if (req.app.get('io')) {
      req.app.get('io').to(hotelId).emit('photoDeleted', {
        hotelId,
        category,
        subCategory,
        photoUrl,
      });
    }

    res.status(200).json({ message: '사진이 삭제되었습니다.' });
  } catch (error) {
    logger.error(`Delete hotel photo error: ${error.message}`, { hotelId });
    res.status(500).json({ message: `서버 오류: ${error.message}` });
  }
};