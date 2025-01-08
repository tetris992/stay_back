// // backend/models/Memo.js
// import mongoose from 'mongoose';

// const MemoSchema = new mongoose.Schema({
//   hotelId: { type: String, required: true, index: true },
//   reservationId: { type: String, required: true, index: true },
//   customerName: { type: String, required: true, index: true },
//   memoText: { type: String, default: '' },
//   updatedAt: { type: Date, default: Date.now }
// });

// // hotelId별로 동적 콜렉션 생성
// function getMemoModel(hotelId) {
//   const collectionName = `memo_${hotelId}`;
//   if (mongoose.models[collectionName]) {
//     return mongoose.models[collectionName];
//   }
//   return mongoose.model(collectionName, MemoSchema, collectionName);
// }

// export default getMemoModel;
