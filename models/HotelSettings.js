// backend/models/HotelSettings.js

import mongoose from 'mongoose';
import { defaultRoomTypes } from '../config/defaultRoomTypes.js';
import availableOTAs from '../config/otas.js'; // OTA 목록

//
// 1. Puppeteer 쿠키 구조를 위한 Schema
//
const cookieSchema = new mongoose.Schema(
  {
    name: { type: String },
    value: { type: String },
    domain: { type: String },
    path: { type: String },
    expires: { type: Number },
    httpOnly: { type: Boolean },
    secure: { type: Boolean },
    // 필요한 필드만 선택해서 정의 가능
  },
  { _id: false }
);

//
// 2. OTA 스키마 (현재 otaSchema는 OTA 이름, 활성화 여부 등)
//
const otaSchema = new mongoose.Schema({
  name: { type: String, enum: availableOTAs, required: true },
  isActive: { type: Boolean, default: false },
});

//
// 3. 각 OTA의 로그인 정보 스키마 (기존)
//   - 여기서 "yanolja" 필드를 새로 정의.
//
const otaCredentialsSchema = new mongoose.Schema(
  {
    expediaCredentials: {
      email: { type: String, required: false },
      password: { type: String, required: false },
    },
    agodaCredentials: {
      email: { type: String, required: false },
      password: { type: String, required: false },
    },

    // === (새로 추가) 야놀자(yanolja) 자격증명 ===
    yanolja: {
      loginId: { type: String },
      loginPw: { type: String },
      cookies: [cookieSchema], // Puppeteer로 얻은 쿠키 배열
    },

    // 다른 OTA에 대한 로그인 정보 추가 가능
  },
  { _id: false }
);

//
// 4. RoomType 스키마 (기존)
//
const RoomTypeSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    nameKor: { type: String, required: true },
    nameEng: { type: String, required: true },
    price: { type: Number, required: true },
    stock: { type: Number, required: true },
    aliases: [{ type: String, lowercase: true }],
  },
  { _id: false }
);

//
// 5. HotelSettings 스키마 (전체 구조)
//
const HotelSettingsSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    hotelId: {
      type: String,
      required: true,
      unique: true,
    },
    totalRooms: {
      type: Number,
      required: true,
      default: 50,
      min: [1, '총 객실 수는 최소 1개 이상이어야 합니다.'],
    },
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
    otas: {
      type: [otaSchema],
      default: availableOTAs.map((ota) => ({ name: ota, isActive: false })),
    },

    email: { type: String, required: true },
    address: { type: String, required: true },
    phoneNumber: { type: String, required: true },

    // === (중요) 각 OTA 자격증명(아이디,비번,쿠키)을 담는 필드 ===
    otaCredentials: {
      type: otaCredentialsSchema,
      default: {},
    },
  },
  { timestamps: true }
);

const HotelSettings = mongoose.model('HotelSettings', HotelSettingsSchema);
export default HotelSettings;
