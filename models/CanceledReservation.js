// backend/models/CanceledReservation.js
import mongoose from 'mongoose';

const CanceledReservationSchema = new mongoose.Schema(
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
    reservationStatus: { type: String, required: true, default: 'Canceled' },
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
      default: true,
    },
  },
  {
    timestamps: true,
    strict: false,
  }
);

// 인덱스 추가
CanceledReservationSchema.index({ customerName: 1, createdAt: -1 });

const getCanceledReservationModel = (hotelId) => {
  const collectionName = `canceled_reservation_${hotelId}`;

  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName];
  }

  return mongoose.model(collectionName, CanceledReservationSchema, collectionName);
};

export default getCanceledReservationModel;
