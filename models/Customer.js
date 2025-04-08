import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const CustomerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: [2, '이름은 최소 2자 이상이어야 합니다.'],
      maxlength: [50, '이름은 최대 50자 이하여야 합니다.'],
    },
    phoneNumber: {
      type: String,
      unique: true,
      trim: true,
      default: '01000000000',
      validate: {
        validator: function (v) {
          if (!v) return true;
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
      default: 'default@example.com',
      match: [/^\S+@\S+\.\S+$/, '유효한 이메일 주소를 입력해주세요.'],
      index: true,
    },
    password: {
      type: String,
      required: function () {
        return !this.socialLogin.provider;
      },
      minlength: [4, '비밀번호는 최소 4자 이상이어야 합니다.'],
    },
    isAdultVerified: {
      type: Boolean,
      default: false,
    },
    socialLogin: {
      provider: {
        type: String,
        enum: ['kakao', 'naver', 'google', null],
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
        visitCount: { type: Number, default: 1 }, // 호텔별 방문 횟수
      },
    ],
    totalVisits: {
      type: Number,
      default: 0, // 총 방문 횟수
    },
    coupons: [
      {
        code: { type: String, required: true },
        discount: { type: Number, required: true },
        expiryDate: { type: Date, required: true },
        used: { type: Boolean, default: false },
      },
    ],
    // 동의 항목 추가
    agreements: {
      terms: {
        type: Boolean,
        required: [true, '서비스 이용약관 동의는 필수입니다.'],
        default: false,
      },
      privacy: {
        type: Boolean,
        required: [true, '개인정보 수집 및 이용 동의는 필수입니다.'],
        default: false,
      },
      marketing: {
        type: Boolean,
        default: false, // 선택 항목
      },
      agreedAt: {
        type: Date,
        default: Date.now, // 동의한 시간 기록
      },
      termsVersion: {
        type: String,
        default: '2025.04.08', // 약관 버전 기록
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

// 비밀번호 해싱
CustomerSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

CustomerSchema.methods.comparePassword = async function (enteredPassword) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

CustomerSchema.index({
  'socialLogin.provider': 1,
  'socialLogin.providerId': 1,
});

export default mongoose.model('Customer', CustomerSchema);