// backend/models/User.js

import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const UserSchema = new mongoose.Schema(
  {
    hotelId: {
      type: String,
      required: true,
      unique: true,
      minlength: [5, '호텔 ID는 최소 5자 이상이어야 합니다.'],
      maxlength: [20, '호텔 ID는 최대 20자 이하이어야 합니다.'],
    },
    password: {
      type: String,
      required: true,
      minlength: [8, '비밀번호는 최소 8자 이상이어야 합니다.'],
      // maxlength: [50, '비밀번호는 최대 50자 이하이어야 합니다.'], //서버에 저장된 해시비번은 항상 60자가 넘어서 오류
      // validate: {
      //   validator: function (value) {
      //     return /^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[!@#$%^&*]).{8,50}$/.test(
      //       value
      //     );
      //   },
      //   message:
      //     //보안형식은 몽고에서 소급적용되지 않음.
      //     '비밀번호는 대문자, 소문자, 숫자, 특수문자를 각각 1개 이상 포함해야 합니다.',
      // },
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: /.+\@.+\..+/,
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

const User = mongoose.model('User', UserSchema);

export default User;
