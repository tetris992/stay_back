// backend/models/HotelPhotos.js
import mongoose from 'mongoose';

const PhotoSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: true,
      enum: ['room', 'exterior', 'facility'],
    },
    subCategory: {
      type: String,
      required: true,
    },
    photoUrl: {
      type: String,
      required: true,
      match: [/^https:\/\/.*\.s3\..*\.amazonaws\.com\/.+$/, '유효한 S3 URL이어야 합니다.'],
    },
    order: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const HotelPhotosSchema = new mongoose.Schema(
  {
    photos: {
      type: [PhotoSchema],
      validate: {
        validator: (v) => v.length <= 100,
        message: '사진은 최대 100개까지 저장 가능합니다.',
      },
    },
  },
  { timestamps: true }
);

// 인덱스 추가로 조회 성능 개선
HotelPhotosSchema.index({ 'photos.category': 1, 'photos.subCategory': 1 });

const getHotelPhotosModel = (hotelId) => {
  const collectionName = `hotelphotos_${hotelId}`;
  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName];
  }
  return mongoose.model(collectionName, HotelPhotosSchema, collectionName);
};

export default getHotelPhotosModel;