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
      type: String, // ISO 8601 문자열 유지
      required: true,
    },
    checkOut: {
      type: String, // ISO 8601 문자열 유지
      required: true,
    },
    reservationDate: {
      type: String,
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
    // 추가 필드: 대실과 숙박 구분
    type: {
      type: String,
      enum: ['stay', 'dayUse'],
      default: 'stay',
    },
    duration: {
      type: Number, // 대실 시간(시간 단위), 대실일 경우에만 사용
      default: null,
    },
    // 새로 추가: 수동 퇴실 상태
    manuallyCheckedOut: {
      type: Boolean,
      default: false,
      index: true, // 검색 최적화
    },
  },
  {
    timestamps: true,
    strict: false,
  }
);

// 인덱스 설정
ReservationSchema.index({ checkIn: 1, checkOut: 1 }); // 날짜 범위 쿼리용
ReservationSchema.index({ createdAt: -1 }); // 최신 예약 정렬용
ReservationSchema.index({ customerName: 1, createdAt: -1 }); // 검색용
ReservationSchema.index({ type: 1 }); // 대실/숙박 필터링용
ReservationSchema.index({ manuallyCheckedOut: 1 }); // 퇴실 상태 쿼리용

const getReservationModel = (hotelId) => {
  const collectionName = `reservation_${hotelId}`;
  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName];
  }
  return mongoose.model(collectionName, ReservationSchema, collectionName);
};

export default getReservationModel;