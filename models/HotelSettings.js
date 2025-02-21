import mongoose from 'mongoose';
import { defaultRoomTypes } from '../config/defaultRoomTypes.js';
import availableOTAs from '../config/otas.js';

/**
 * OTA 설정 스키마
 */
const otaSchema = new mongoose.Schema(
  {
    name: { type: String, enum: availableOTAs, required: true },
    isActive: { type: Boolean, default: false },
  },
  { _id: false }
);

/**
 * 객실 타입 스키마
 */
const RoomTypeSchema = new mongoose.Schema(
  {
    roomInfo: { type: String, required: true },
    nameKor: { type: String, required: true },
    nameEng: { type: String, required: true },
    price: { type: Number, required: true },
    stock: { type: Number, required: true },
    aliases: [{ type: String, lowercase: true }],
  },
  { _id: false }
);

/**
 * 컨테이너(그리드 셀) 스키마
 */
const ContainerSchema = new mongoose.Schema(
  {
    containerId: { type: String, required: true },
    floor: { type: Number, required: true },
    row: { type: Number, required: true },
    col: { type: Number, required: true },
    roomInfo: { type: String, default: '' },
    roomNumber: { type: String, default: '' }, // 문자열로 변경, 기본값 빈 문자열
    price: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

/**
 * 층별 그리드 스키마
 */
const FloorSchema = new mongoose.Schema(
  {
    floorNum: { type: Number, required: true },
    rows: { type: Number, default: 1 },
    cols: { type: Number, default: 7 },
    containers: { type: [ContainerSchema], default: [] },
  },
  { _id: false }
);

/**
 * HotelSettings 스키마
 */
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
      default: 0,
      min: [0, '총 객실 수는 0 이상이어야 합니다.'],
    },
    roomTypes: {
      type: [RoomTypeSchema],
      default: defaultRoomTypes,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: '적어도 하나의 객실 타입이 필요합니다.',
      },
    },
    otas: {
      type: [otaSchema],
      default: availableOTAs.map((ota) => ({ name: ota, isActive: false })),
    },
    otaCredentials: {
      type: Object,
      default: {},
    },
    gridSettings: {
      type: {
        floors: { type: [FloorSchema], default: [] },
      },
      default: { floors: [] },
    },
  },
  { timestamps: true }
);

const HotelSettings = mongoose.model('HotelSettings', HotelSettingsSchema);

export default HotelSettings;