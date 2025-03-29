import mongoose from 'mongoose';

const PaymentHistorySchema = new mongoose.Schema({
  date: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  timestamp: { type: String, required: true },
  method: {
    type: String,
    enum: [
      'Cash',
      'Card',
      'Account Transfer',
      'BankTransfer',
      'Point',
      'Pending',
    ],
    default: 'Card',
  },
});

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
    originalRoomInfo: {
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
      min: 0,
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
      enum: [
        'Card',
        'Cash',
        'Account Transfer',
        'Pending',
        'PerNight(Card)',
        'PerNight(Cash)',
        'Various',
        'OTA',
        '미결제',
        '현장결제',
      ],
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
      type: [PaymentHistorySchema],
      default: [],
    },
    remainingBalance: {
      type: Number,
      required: true,
      min: 0,
      default: function () {
        return this.price || 0;
      },
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

// 인덱스 추가
ReservationSchema.index({ checkIn: 1, checkOut: 1 });
ReservationSchema.index({ createdAt: -1 });
ReservationSchema.index({ customerName: 1, createdAt: -1 });
ReservationSchema.index({ type: 1 });
ReservationSchema.index({ remainingBalance: 1 }); // 부분 결제 관련 조회 최적화

// remainingBalance가 음수가 되지 않도록 검증
ReservationSchema.pre('save', function (next) {
  if (this.remainingBalance < 0) {
    this.remainingBalance = 0;
  }
  next();
});

const getReservationModel = (hotelId) => {
  const collectionName = `reservation_${hotelId}`;
  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName];
  }
  return mongoose.model(collectionName, ReservationSchema, collectionName);
};

export default getReservationModel;
