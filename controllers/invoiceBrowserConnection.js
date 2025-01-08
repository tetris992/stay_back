// // backend/controllers/invoiceBrowserConnection.js

// import puppeteer from 'puppeteer';
// import logger from '../utils/logger.js';

// /**
//  * 주어진 HTML 콘텐츠를 PDF로 변환하는 함수.
//  * 인보이스 생성 시 별도의 브라우저 인스턴스를 사용하여 독립적으로 작업을 수행합니다.
//  * @param {String} htmlContent - PDF로 변환할 HTML 콘텐츠
//  * @returns {Buffer} - 생성된 PDF의 버퍼
//  */
// export const generatePdf = async (htmlContent) => {
//   let browser = null;
//   try {
//     browser = await puppeteer.launch({
//       headless: true, // 헤드리스 모드로 실행
//       args: [
//         '--no-sandbox',
//         '--disable-setuid-sandbox',
//       ],
//     });

//     const page = await browser.newPage();
//     await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
//     const pdfBuffer = await page.pdf({ format: 'A4' });
//     await page.close();
//     return pdfBuffer;
//   } catch (error) {
//     logger.error('Error generating PDF:', error);
//     throw error;
//   } finally {
//     if (browser) {
//       await browser.close();
//     }
//   }
// };
