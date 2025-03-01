import mongoose from 'mongoose';
import { defaultRoomTypes } from '../config/defaultRoomTypes.js';
import availableOTAs from '../config/otas.js';

const otaSchema = new mongoose.Schema(
  {
    name: { type: String, enum: availableOTAs, required: true },
    isActive: { type: Boolean, default: false },
  },
  { _id: false }
);

const RoomTypeSchema = new mongoose.Schema(
  {
    roomInfo: { type: String, required: true },
    nameKor: { type: String, required: true },
    nameEng: { type: String, required: true },
    price: { type: Number, required: true },
    stock: { type: Number, required: true },
    aliases: [{ type: String, lowercase: true }],
    floorSettings: { type: Map, of: Number, default: {} },
    startRoomNumbers: { type: Map, of: String, default: {} },
  },
  { _id: false }
);

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

const FloorSchema = new mongoose.Schema(
  {
    floorNum: { type: Number, required: true },
    containers: { type: [ContainerSchema], default: [] },
  },
  { _id: false }
);

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
        },
        ...defaultRoomTypes,
      ],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: '적어도 하나의 객실 타입이 필요합니다.',
      },
    },
    otas: {
      type: [otaSchema],
      default: availableOTAs.map((ota) => ({ name: ota, isActive: false })),
    },
    otaCredentials: { type: Object, default: {} },
    gridSettings: {
      type: { floors: { type: [FloorSchema], default: [] } },
      default: () => ({ floors: [] }),
    },
  },
  { timestamps: true }
);

export default mongoose.model('HotelSettings', HotelSettingsSchema);
