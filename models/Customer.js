import mongoose from 'mongoose';

const CustomerSchema = new mongoose.Schema(
  {
    nickname: {
      type: String,
      trim: true,
      minlength: [2, '닉네임은 최소 2자 이상이어야 합니다.'],
      maxlength: [50, '닉네임은 최대 50자 이하여야 합니다.'],
      unique: true,
      sparse: true,
      index: true,
    },
    phoneNumber: {
      type: String,
      required: [true, '전화번호는 필수입니다.'],
      unique: true,
      trim: true,
      validate: {
        validator: function (v) {
          const cleaned = v.replace(/\D/g, '');
          return cleaned.length >= 10 && cleaned.length <= 11;
        },
        message: '전화번호는 10~11자리 숫자여야 합니다.',
      },
      index: true,
    },
    email: {
      type: String,
      unique: true,
      lowercase: true,
      sparse: true,
      match: [/^\S+@\S+\.\S+$/, '유효한 이메일 주소를 입력해주세요.'],
      index: true,
    },
    ageRange: {
      type: String,
      enum: ['10대', '20대', '30대', '40대', '50대 이상', null],
      default: null,
    },
    name: {
      type: String,
      trim: true,
      minlength: [2, '이름은 최소 2자 이상이어야 합니다.'],
      maxlength: [50, '이름은 최대 50자 이하여야 합니다.'],
      default: null,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    isAdultVerified: {
      type: Boolean,
      default: false,
    },
    socialLogin: {
      provider: {
        type: String,
        enum: ['kakao', null],
        default: null,
      },
      providerId: {
        type: String,
        default: null,
        required: function () {
          return !!this.socialLogin.provider;
        },
      },
    },
    reservations: [
      {
        hotelId: { type: String, required: true },
        reservationId: { type: String, required: true },
        visitCount: { type: Number, default: 1 },
      },
    ],
    totalVisits: {
      type: Number,
      default: 0,
    },
    coupons: [
      {
        code: { type: String, required: true },
        discount: { type: Number, required: true },
        expiryDate: { type: Date, required: true },
        used: { type: Boolean, default: false },
      },
    ],
    agreements: {
      terms: {
        type: Boolean,
        default: false,
      },
      privacy: {
        type: Boolean,
        default: false,
      },
      marketing: {
        type: Boolean,
        default: false,
      },
      agreedAt: {
        type: Date,
        default: null,
      },
      termsVersion: {
        type: String,
        default: '2025.04.08',
      },
    },
  },
  { timestamps: true }
);

// 전화번호 형식 정규화
CustomerSchema.pre('save', function (next) {
  if (this.isModified('phoneNumber') && this.phoneNumber) {
    let cleaned = this.phoneNumber.replace(/\D/g, '');
    if (cleaned.length < 10 || cleaned.length > 11) {
      return next(new Error('전화번호는 10~11자리 숫자여야 합니다.'));
    }
    if (cleaned.length === 11 && !cleaned.startsWith('010')) {
      cleaned = '010' + cleaned.slice(-8);
    } else if (cleaned.length === 10 && !cleaned.startsWith('010')) {
      cleaned = '010' + cleaned.slice(-7);
    }
    if (cleaned.length === 11) {
      this.phoneNumber = `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
    } else {
      this.phoneNumber = `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
  }
  next();
});

CustomerSchema.index({
  'socialLogin.provider': 1,
  'socialLogin.providerId': 1,
});

export default mongoose.model('Customer', CustomerSchema);