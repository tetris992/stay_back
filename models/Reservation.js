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
    roomNumber: {
      type: String,
      default: '',
      index: true,
    },
    checkIn: {
      type: String, // Date 대신 String으로 변경
      required: true,
    },
    checkOut: {
      type: String, // Date 대신 String으로 변경
      required: true,
    },
    reservationDate: {
      type: String, // Date 대신 String으로 변경
      required: false,
      default: () => new Date().toISOString().replace('Z', '+09:00'), // KST 기본값
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
    // 알림 관련 필드 추가
    notificationCount: { type: Number, default: 0 }, // 총 알림 전송 횟수
    lastNotificationReset: { type: Date, default: Date.now }, // 마지막 리셋 날짜
    sentCreate: { type: Boolean, default: false }, // 생성 알림 전송 여부
    sentUpdate: { type: Boolean, default: false }, // 변경 알림 전송 여부
    sentCancel: { type: Boolean, default: false }, // 취소 알림 전송 여부
  },
  {
    timestamps: true,
    strict: false,
  }
);

// 인덱스 설정
ReservationSchema.index({ checkIn: 1, checkOut: 1 }); // 날짜 범위 쿼리용
ReservationSchema.index({ createdAt: -1 }); // 최신 예약 정렬용
ReservationSchema.index({ customerName: 1, createdAt: -1 }); // 필요 시 유지

const getReservationModel = (hotelId) => {
  const collectionName = `reservation_${hotelId}`;
  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName];
  }
  return mongoose.model(collectionName, ReservationSchema, collectionName);
};

export default getReservationModel;