// backend/models/HotelSettings.js

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
 * - 각 객실 타입은 내부 키(roomInfo), 한글/영문 이름, 가격, 재고, 별칭(alias) 등을 가집니다.
 */
const RoomTypeSchema = new mongoose.Schema(
  {
    // 내부적으로 "roomInfo"를 고유 식별 키로 사용 (ex: 'standard', 'premium' 등)
    roomInfo: { type: String, required: true },
    nameKor: { type: String, required: true },
    nameEng: { type: String, required: true },
    price: { type: Number, required: true },
    stock: { type: Number, required: true }, // gridSettings.containers 개수를 기반으로 업데이트 가능
    aliases: [{ type: String, lowercase: true }],
  },
  { _id: false }
);

/**
 * 컨테이너(그리드 셀) 스키마
 * - 각 셀(객실)의 containerId, 위치(row, col), roomInfo(객실 이름/타입), 객실번호, 가격 등의 정보를 저장
 */
const ContainerSchema = new mongoose.Schema(
  {
    containerId: { type: String, required: true },
    row: { type: Number, required: true },
    col: { type: Number, required: true },
    roomInfo: { type: String, required: true },   // 과거 roomType → roomInfo로 변경
    roomNumber: { type: String, required: true },
    price: { type: Number, required: true },
  },
  { _id: false }
);

/**
 * 레이아웃/그리드 스키마
 */
const GridSettingsSchema = new mongoose.Schema(
  {
    rows: { type: Number, default: 0 },
    cols: { type: Number, default: 0 },
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
      default: 50,
      min: [1, '총 객실 수는 최소 1개 이상이어야 합니다.'],
    },
    // roomTypes 배열: 기본값은 defaultRoomTypes (이미 roomInfo로 구성됨)
    roomTypes: {
      type: [RoomTypeSchema],
      default: defaultRoomTypes,
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length > 0;
        },
        message: '적어도 하나의 객실 타입이 필요합니다.',
      },
    },
    // OTA 설정들
    otas: {
      type: [otaSchema],
      default: availableOTAs.map((ota) => ({ name: ota, isActive: false })),
    },
    otaCredentials: {
      type: Object,
      default: {},
    },
    // 그리드 설정
    gridSettings: {
      type: GridSettingsSchema,
      default: { rows: 0, cols: 0, containers: [] },
    },
  },
  { timestamps: true }
);

const HotelSettings = mongoose.model('HotelSettings', HotelSettingsSchema);

export default HotelSettings;
