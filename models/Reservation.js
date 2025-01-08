// backend/models/Reservation.js
import mongoose from 'mongoose';

const ReservationSchema = new mongoose.Schema(
  {
    hotelId: {
      type: String,
      required: true,
      index: true,
    },
    siteName: {
      type: String,
      required: true,
    },
    _id: {
      type: String,
      required: true,
    },
    customerName: {
      type: String,
      required: true,
      index: true,
    },
    phoneNumber: {
      type: String,
      required: false,
    },
    roomInfo: {
      type: String,
      default: '',
    },
    checkIn: {
      type: Date,
      required: true,
    },
    checkOut: {
      type: Date,
      required: true,
    },
    reservationDate: {
      type: Date,
      required: false,
      default: Date.now,
    },
    reservationStatus: { type: String, required: true, default: 'Confirmed' },
    price: {
      type: Number,
      default: 0,
    },
    specialRequests: {
      type: String,
      default: null,
    },
    additionalFees: {
      type: Number,
      default: 0,
    },
    couponInfo: {
      type: String,
      default: null,
    },
    paymentStatus: {
      type: String,
      default: '미결제',
    },
    paymentMethod: {
      type: String,
      enum: ['Card', 'Cash', 'Account Transfer', 'Pending', 'OTA'],
      required: false,
      default: 'Pending',
    },
    isCancelled: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    strict: false,
  }
);

// 인덱스 추가
ReservationSchema.index({ customerName: 1, createdAt: -1 });

const getReservationModel = (hotelId) => {
  const collectionName = `reservation_${hotelId}`;

  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName];
  }

  return mongoose.model(collectionName, ReservationSchema, collectionName);
};

export default getReservationModel;
