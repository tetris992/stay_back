// backend/routes/hotelPhotos.js
import express from 'express';
import { uploadHotelPhoto, getHotelPhotos } from '../controllers/hotelPhotosController.js';
import { protect } from '../middleware/authMiddleware.js';
import asyncHandler from '../utils/asyncHandler.js';
import getHotelPhotosModel from '../models/HotelPhotos.js';

const router = express.Router();

// 사진 업로드 및 조회 (기존)
router.post('/upload', protect, asyncHandler(uploadHotelPhoto));
router.get('/', protect, asyncHandler(getHotelPhotos));

// 사진 삭제
router.delete('/', protect, asyncHandler(async (req, res) => {
  const { hotelId, category, subCategory, photoUrl } = req.body;

  if (!hotelId || !category || !subCategory || !photoUrl) {
    return res.status(400).json({ message: 'hotelId, category, subCategory, photoUrl은 필수입니다.' });
  }

  const HotelPhotos = getHotelPhotosModel(hotelId);
  const hotelPhotosDoc = await HotelPhotos.findOne();

  if (!hotelPhotosDoc) {
    return res.status(404).json({ message: '사진 데이터가 없습니다.' });
  }

  // 해당 사진 삭제
  hotelPhotosDoc.photos = hotelPhotosDoc.photos.filter(
    (photo) =>
      !(photo.category === category && photo.subCategory === subCategory && photo.photoUrl === photoUrl)
  );

  await hotelPhotosDoc.save();
  res.status(200).json({ message: '사진이 삭제되었습니다.' });
}));

export default router;