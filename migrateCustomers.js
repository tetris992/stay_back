import mongoose from 'mongoose';
import dotenv from 'dotenv';

// .env 파일 로드
dotenv.config();

// 몽고DB 연결
console.log('Connecting to MongoDB:', process.env.DATABASE_URL);
await mongoose.connect(process.env.DATABASE_URL);

const CustomerSchema = new mongoose.Schema({
  nickname: { type: String, default: null },
  phoneNumber: { type: String, required: true },
  email: { type: String },
  ageRange: { type: String, default: null },
  name: { type: String, default: null },
  isActive: { type: Boolean, default: false },
  isAdultVerified: { type: Boolean, default: false },
  socialLogin: Object,
  totalVisits: { type: Number, default: 0 },
  agreements: Object,
  reservations: Array,
  coupons: Array,
}, { timestamps: true });

const Customer = mongoose.model('Customer', CustomerSchema);

async function migrateCustomers() {
  try {
    const customers = await Customer.find({});

    for (const customer of customers) {
      const updates = {};
      if (customer.nickname === undefined) {
        updates.nickname = customer.name || null;
      }
      if (customer.ageRange === undefined) {
        updates.ageRange = null;
      }
      if (customer.isActive === undefined) {
        updates.isActive = false;
      }

      if (Object.keys(updates).length > 0 || customer.password !== undefined) {
        await Customer.updateOne(
          { _id: customer._id },
          {
            $set: updates,
            $unset: { password: "" }
          }
        );
        console.log(`Updated customer ${customer._id} with new fields`);
      }
    }

    console.log('Migration completed');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    mongoose.connection.close();
  }
}

migrateCustomers();