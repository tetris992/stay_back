import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import crypto from 'crypto'; // crypto를 import하여 generatePasswordResetToken 사용

const UserSchema = new mongoose.Schema(
  {
    hotelId: {
      type: String,
      required: true,
      unique: true,
      minlength: [5, '호텔 ID는 최소 5자 이상이어야 합니다.'],
      maxlength: [20, '호텔 ID는 최대 20자 이하이어야 합니다.'],
      index: true, // 인덱스 유지
    },
    password: {
      type: String,
      required: true,
      minlength: [8, '비밀번호는 최소 8자 이상이어야 합니다.'],
    },
    hotelName: {
      type: String,
      required: false,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: /.+\@.+\..+/,
      index: true, // 인덱스 유지
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [
        /^(\+82|0)\s?([0-9]{2,4})\s?-?\s?([0-9]{3,4})\s?-?\s?([0-9]{4})$/,
        '전화번호는 올바른 형식이어야 합니다 (예: 010-2224-4444).',
      ],
      index: true, // 인덱스 유지
    },
    // 개인정보 동의 관련 필드
    consentChecked: {
      type: Boolean,
      default: false,
    },
    consentAt: {
      type: Date,
      default: null,
    },
    // 로그인 실패 횟수 추적
    loginAttempts: {
      type: Number,
      default: 0, // 초기값 0
      index: true, // 인덱스 유지
    },
    lastAttemptAt: {
      type: Date, // 마지막 로그인 시도 시간
      default: null,
      index: true, // 인덱스 유지
    },
    // 비밀번호 재설정 관련 필드
    passwordResetToken: {
      type: String, // 비밀번호 재설정 토큰
      default: null,
    },
    passwordResetExpires: {
      type: Date, // 토큰 만료 시간
      default: null,
    },
  },
  { timestamps: true }
);

// 전화번호 표준화를 위한 pre-save 훅
UserSchema.pre('save', function (next) {
  if (this.isModified('phoneNumber')) {
    // 공백 제거 및 하이픈 추가
    this.phoneNumber = this.phoneNumber
      .replace(/\s+/g, '') // 모든 공백 제거
      .replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3'); // 하이픈 추가
  }
  next();
});

// 비밀번호 해싱을 위한 pre-save 훅
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
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

// 비밀번호 매칭 메서드
UserSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// 비밀번호 재설정 토큰 생성 메서드
UserSchema.methods.generatePasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  this.passwordResetExpires = Date.now() + 3600000; // 1시간 유효
  return resetToken;
};

const User = mongoose.model('User', UserSchema);

export default User;
