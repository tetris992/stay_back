// migrateHotelSettingsFields.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// .env 파일 로드
dotenv.config();

// 몽고DB 연결
console.log('Connecting to MongoDB:', process.env.DATABASE_URL);
await mongoose.connect(process.env.DATABASE_URL);

const HotelSettingsSchema = new mongoose.Schema({
  hotelId: String,
  totalRooms: Number,
  roomTypes: Array,
  otas: Array,
  gridSettings: Object,
  amenities: Array,
  photos: Array,
  checkInTime: String,
  checkOutTime: String,
  address: String,
  latitude: Number,
  longitude: Number,
  email: String,
  phoneNumber: String,
  hotelName: String,
}, { timestamps: true });

const UserSchema = new mongoose.Schema({
  hotelId: String,
  password: String,
  hotelName: String,
  email: String,
  address: String,
  phoneNumber: String,
  consentChecked: Boolean,
  consentAt: Date,
  loginAttempts: Number,
  lastAttemptAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
}, { timestamps: true });

const HotelSettings = mongoose.model('HotelSettings', HotelSettingsSchema);
const User = mongoose.model('User', UserSchema);

async function migrateHotelSettingsFields() {
  try {
    // 모든 HotelSettings 문서 조회
    const hotelSettings = await HotelSettings.find({});

    for (const setting of hotelSettings) {
      // 해당 hotelId에 맞는 User 문서 조회
      const user = await User.findOne({ hotelId: setting.hotelId });

      if (user) {
        const updates = {};
        if (!setting.address || setting.address === "") {
          updates.address = user.address || "";
        }
        if (!setting.email || setting.email === "") {
          updates.email = user.email || "";
        }
        if (!setting.phoneNumber || setting.phoneNumber === "") {
          updates.phoneNumber = user.phoneNumber || "";
        }
        if (!setting.hotelName || setting.hotelName === "") {
          updates.hotelName = user.hotelName || "";
        }

        if (Object.keys(updates).length > 0) {
          await HotelSettings.updateOne(
            { hotelId: setting.hotelId },
            { $set: updates }
          );
          console.log(`Updated HotelSettings for hotelId ${setting.hotelId} with new fields:`, updates);
        }
      }
    }

    console.log('Migration completed');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    mongoose.connection.close();
  }
}

migrateHotelSettingsFields();