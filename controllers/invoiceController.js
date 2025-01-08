// // backend/controllers/invoiceController.js

// import Reservation from '../models/Reservation.js';
// import HotelSettings from '../models/HotelSettings.js';
// import logger from '../utils/logger.js';
// import ejs from 'ejs';
// import path from 'path';
// import sendgridMail from '@sendgrid/mail';
// import twilio from 'twilio';
// import dotenv from 'dotenv';
// import { generatePdf } from './invoiceBrowserConnection.js'; // 별도 브라우저 인스턴스 사용

// dotenv.config();

// // SendGrid 설정
// sendgridMail.setApiKey(process.env.SENDGRID_API_KEY);

// // Twilio 설정
// const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
// const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// /**
//  * 인보이스 생성 및 전송 함수
//  * @param {Request} req
//  * @param {Response} res
//  */
// export const generateAndSendInvoice = async (req, res) => {
//   const { reservationId } = req.body;

//   if (!reservationId) {
//     return res.status(400).json({ success: false, message: 'reservationId가 필요합니다.' });
//   }

//   try {
//     // 예약 정보 가져오기
//     const reservation = await Reservation.findById(reservationId);
//     if (!reservation) {
//       return res.status(404).json({ success: false, message: '예약을 찾을 수 없습니다.' });
//     }

//     // 호텔 설정 가져오기
//     const hotelSettings = await HotelSettings.findOne({ hotelId: reservation.hotelId });
//     if (!hotelSettings) {
//       return res.status(404).json({ success: false, message: '호텔 설정을 찾을 수 없습니다.' });
//     }

//     // 인보이스 HTML 렌더링
//     const invoiceHtml = await ejs.renderFile(
//       path.join(process.cwd(), 'views', 'invoice.ejs'),
//       { reservation, hotelSettings }
//     );

//     // PDF 생성
//     const pdfBuffer = await generatePdf(invoiceHtml);

//     // 이메일 전송
//     const msg = {
//       to: reservation.customerEmail, // 예약자 이메일
//       from: hotelSettings.email, // 호텔 이메일 (SendGrid에 등록된 발신 이메일)
//       subject: `호텔 인보이스 - 예약 번호: ${reservation.reservationNo}`,
//       text: '첨부된 PDF 파일을 확인해주세요.',
//       attachments: [
//         {
//           content: pdfBuffer.toString('base64'),
//           filename: `Invoice_${reservation.reservationNo}.pdf`,
//           type: 'application/pdf',
//           disposition: 'attachment',
//         },
//       ],
//     };

//     await sendgridMail.send(msg);

//     // SMS 전송 (옵션)
//     if (reservation.customerPhone) {
//       const smsMessage = `호텔 인보이스가 이메일로 전송되었습니다. 예약 번호: ${reservation.reservationNo}`;
//       await twilioClient.messages.create({
//         body: smsMessage,
//         from: TWILIO_PHONE_NUMBER,
//         to: reservation.customerPhone,
//       });
//     }

//     // 성공 응답
//     res.json({ success: true, message: '인보이스가 성공적으로 전송되었습니다.' });
//   } catch (error) {
//     logger.error('인보이스 생성 및 전송 오류:', error);
//     res.status(500).json({ success: false, message: '인보이스 전송 중 오류가 발생했습니다.' });
//   }
// };

// /**
//  * 인보이스 다운로드 함수
//  * @param {Request} req
//  * @param {Response} res
//  */
// export const downloadInvoice = async (req, res) => {
//   const { reservationId } = req.query;

//   if (!reservationId) {
//     return res.status(400).json({ success: false, message: 'reservationId가 필요합니다.' });
//   }

//   try {
//     // 예약 정보 가져오기
//     const reservation = await Reservation.findById(reservationId);
//     if (!reservation) {
//       return res.status(404).json({ success: false, message: '예약을 찾을 수 없습니다.' });
//     }

//     // 호텔 설정 가져오기
//     const hotelSettings = await HotelSettings.findOne({ hotelId: reservation.hotelId });
//     if (!hotelSettings) {
//       return res.status(404).json({ success: false, message: '호텔 설정을 찾을 수 없습니다.' });
//     }

//     // 인보이스 HTML 렌더링
//     const invoiceHtml = await ejs.renderFile(
//       path.join(process.cwd(), 'views', 'invoice.ejs'),
//       { reservation, hotelSettings }
//     );

//     // PDF 생성
//     const pdfBuffer = await generatePdf(invoiceHtml);

//     // PDF 파일 전송
//     res.set({
//       'Content-Type': 'application/pdf',
//       'Content-Disposition': `attachment; filename=Invoice_${reservation.reservationNo}.pdf`,
//       'Content-Length': pdfBuffer.length,
//     });
//     res.send(pdfBuffer);
//   } catch (error) {
//     logger.error('인보이스 다운로드 오류:', error);
//     res.status(500).json({ success: false, message: '인보이스 다운로드 중 오류가 발생했습니다.' });
//   }
// };
