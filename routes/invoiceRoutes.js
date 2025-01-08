// // backend/routes/invoiceRoutes.js
// import express from 'express';
// import { generateAndSendInvoice, downloadInvoice } from '../controllers/invoiceController.js';
// import { protect } from '../middleware/authMiddleware.js'; // 수정된 임포트

// const router = express.Router();

// // POST /api/invoice - 인보이스 생성 및 전송
// router.post('/', protect, generateAndSendInvoice);

// // GET /api/invoice/download - 인보이스 다운로드
// router.get('/download', protect, downloadInvoice);

// export default router;
