import mongoose from 'mongoose';

const ReservationSchema = new mongoose.Schema(
  {
    hotelId: {
      type: String,
      required: true,
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
    originalRoomInfo: { // 원본 roomInfo 저장 필드 추가
      type: String,
      default: '',
    },
    roomNumber: {
      type: String,
      default: '',
      index: true,
    },
    checkIn: {
      type: String,
      required: true,
    },
    checkOut: {
      type: String,
      required: true,
    },
    reservationDate: {
      type: String,
      required: false,
      default: () => new Date().toISOString().replace('Z', '+09:00'),
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
      default: '',
    },
    paymentMethod: {
      type: String,
      default: 'Pending',
    },
    isCancelled: {
      type: Boolean,
      default: false,
      index: true,
    },
    type: {
      type: String,
      enum: ['stay', 'dayUse'],
      default: 'stay',
    },
    duration: {
      type: Number,
      default: null,
    },
    isCheckedIn: {
      type: Boolean,
      default: false,
      index: true,
    },
    isCheckedOut: {
      type: Boolean,
      default: false,
      index: true,
    },
    manuallyCheckedOut: {
      type: Boolean,
      default: false,
      index: true,
    },
    paymentHistory: {
      type: [
        {
          date: { type: String, required: true },
          amount: { type: Number, required: true },
          timestamp: { type: String, required: true },
          method: { type: String, default: 'Cash' },
        },
      ],
      default: [],
    },
    remainingBalance: {
      type: Number,
      default: 0,
      required: true,
    },
    notificationHistory: {
      type: [
        {
          type: { type: String, enum: ['create', 'cancel'], required: true },
          success: { type: Boolean, required: true },
          timestamp: { type: String, required: true },
          message: { type: String, required: true },
        },
      ],
      default: [],
    },
    sentCreate: {
      type: Boolean,
      default: false,
    },
    sentCancel: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    strict: false,
  }
);

ReservationSchema.index({ checkIn: 1, checkOut: 1 });
ReservationSchema.index({ createdAt: -1 });
ReservationSchema.index({ customerName: 1, createdAt: -1 });
ReservationSchema.index({ type: 1 });

const getReservationModel = (hotelId) => {
  const collectionName = `reservation_${hotelId}`;
  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName];
  }
  return mongoose.model(collectionName, ReservationSchema, collectionName);
};

export default getReservationModel;