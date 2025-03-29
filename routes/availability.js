// // backend/routes/availability.js

// import express from 'express';
// import asyncHandler from '../utils/asyncHandler.js';
// import { getAvailability, getAvailabilityMessage, getRemainingInventory } from '../controllers/availabilityController.js';

// const router = express.Router();

// // 날짜별/타입별 재고 조회
// router.get('/', asyncHandler(getAvailability));

// // 재고 메시지 조회
// router.get('/message', asyncHandler(getAvailabilityMessage));

// // 오늘의 잔여 재고 조회
// router.get('/remaining', asyncHandler(getRemainingInventory));

// export default router;