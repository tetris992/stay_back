// // backend/routes/memo.js
// import express from 'express';
// import { getMemo, updateMemo } from '../controllers/memoController.js';
// import asyncHandler from '../utils/asyncHandler.js';
// import { protect } from '../middleware/authMiddleware.js';

// const router = express.Router();

// // 메모 조회
// // 경로: /memo/:hotelId/:reservationId/:customerName
// router.get('/:hotelId/:reservationId/:customerName', protect, asyncHandler(getMemo));

// // 메모 수정(또는 생성)
// router.patch('/:hotelId/:reservationId/:customerName', protect, asyncHandler(updateMemo));

// export default router;
