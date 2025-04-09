// backend/models/HotelSettings.js
import mongoose from 'mongoose';
import { defaultRoomTypes } from '../config/defaultRoomTypes.js';
import availableOTAs from '../config/otas.js';
import DEFAULT_AMENITIES from '../config/defaultAmenities.js';

// 유효한 시설 이름 목록 (한글 기준)
const VALID_AMENITY_NAMES = DEFAULT_AMENITIES.map((amenity) => amenity.nameKor);

// 시설 스키마 정의
const AmenitySchema = new mongoose.Schema(
  {
    nameKor: {
      type: String,
      required: true,
      enum: {
        values: VALID_AMENITY_NAMES, // DEFAULT_AMENITIES의 nameKor 값 목록
        message: '유효하지 않은 시설 이름입니다: {VALUE}',
      },
    },
    nameEng: { type: String, required: true },
    icon: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: ['on-site', 'in-room'],
      default: 'on-site',
    },
    isActive: { type: Boolean, default: false },
  },
  { _id: false }
);

// 사진 스키마 정의
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
      match: [
        /^https:\/\/.*\.s3\..*\.amazonaws\.com\/.+$/,
        '유효한 S3 URL이어야 합니다.',
      ],
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

// 객실 타입 스키마
const RoomTypeSchema = new mongoose.Schema(
  {
    roomInfo: { type: String, required: true },
    nameKor: { type: String, required: true },
    nameEng: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0 },
    aliases: [{ type: String, lowercase: true }],
    floorSettings: { type: Map, of: Number, default: {} },
    startRoomNumbers: { type: Map, of: String, default: {} },
    isBaseRoom: { type: Boolean, default: false },
    roomAmenities: {
      type: [AmenitySchema],
      default: () =>
        DEFAULT_AMENITIES.filter((amenity) => amenity.type === 'in-room').map(
          (amenity) => ({
            ...amenity,
          })
        ),
    },
    photos: {
      type: [PhotoSchema],
      validate: {
        validator: (v) => v.length <= 100,
        message: '사진은 최대 100개까지 저장 가능합니다.',
      },
      default: [],
    },
  },
  { _id: false }
);

// 객실 컨테이너 스키마
const ContainerSchema = new mongoose.Schema(
  {
    containerId: { type: String, required: true },
    roomInfo: { type: String, default: '' },
    roomNumber: { type: String, default: '' },
    price: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

// 층 스키마
const FloorSchema = new mongoose.Schema(
  {
    floorNum: { type: Number, required: true },
    containers: { type: [ContainerSchema], default: [] },
  },
  { _id: false }
);

// OTA 스키마
const OtaSchema = new mongoose.Schema(
  {
    name: { type: String, enum: availableOTAs, required: true },
    isActive: { type: Boolean, default: false },
  },
  { _id: false }
);

// 호텔 설정 스키마
const HotelSettingsSchema = new mongoose.Schema(
  {
    hotelId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    totalRooms: {
      type: Number,
      required: true,
      default: () => defaultRoomTypes.reduce((sum, rt) => sum + rt.stock, 0),
    },
    roomTypes: {
      type: [RoomTypeSchema],
      default: () => [
        {
          roomInfo: 'none',
          nameKor: '객실없음/사용불가',
          nameEng: 'None',
          price: 0,
          stock: 0,
          aliases: [],
          floorSettings: {},
          startRoomNumbers: {},
          roomAmenities: DEFAULT_AMENITIES.filter(
            (amenity) => amenity.type === 'in-room'
          ).map((amenity) => ({ ...amenity })),
          photos: [],
        },
        ...defaultRoomTypes.map((rt) => ({
          ...rt,
          roomAmenities: DEFAULT_AMENITIES.filter(
            (amenity) => amenity.type === 'in-room'
          ).map((amenity) => ({ ...amenity })),
          photos: [],
        })),
      ],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: '적어도 하나의 객실 타입이 필요합니다.',
      },
    },
    otas: {
      type: [OtaSchema],
      default: availableOTAs.map((ota) => ({ name: ota, isActive: false })),
    },
    otaCredentials: { type: Object, default: {} },
    gridSettings: {
      type: { floors: { type: [FloorSchema], default: [] } },
      default: () => ({ floors: [] }),
    },
    amenities: {
      type: [AmenitySchema],
      default: () =>
        DEFAULT_AMENITIES.filter((amenity) => amenity.type === 'on-site').map(
          (amenity) => ({
            ...amenity,
          })
        ),
    },
    photos: {
      type: [PhotoSchema],
      validate: {
        validator: (v) => v.length <= 100,
        message: '사진은 최대 100개까지 저장 가능합니다.',
      },
      default: [],
    },
    checkInTime: {
      type: String,
      default: '16:00',
    },
    checkOutTime: {
      type: String,
      default: '11:00',
    },
    address: { type: String, default: '' },
    latitude: { type: Number, default: null }, // 좌표 필드 추가
    longitude: { type: Number, default: null }, // 좌표 필드 추가
    email: { type: String, default: '' },
    phoneNumber: { type: String, default: '' },
    hotelName: { type: String, default: '' },
  },
  { timestamps: true }
);

// 인덱스 추가로 조회 성능 최적화
HotelSettingsSchema.index({
  'roomTypes.photos.category': 1,
  'roomTypes.photos.subCategory': 1,
});
HotelSettingsSchema.index({ 'photos.category': 1, 'photos.subCategory': 1 });

export default mongoose.model('HotelSettings', HotelSettingsSchema);
