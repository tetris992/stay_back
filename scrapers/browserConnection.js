// // backend/scrapers/browserConnection.js

// import puppeteer from 'puppeteer-extra';
// import StealthPlugin from 'puppeteer-extra-plugin-stealth';
// import logger from '../utils/logger.js';
// import os from 'os';
// import fs from 'fs/promises';

// // Stealth plugin (Puppeteer 우회)
// puppeteer.use(StealthPlugin());

// /**
//  * puppeteer.launch() 기반의 브라우저 연결 함수
//  *  - Linux(도커)에서는 /usr/bin/google-chrome 사용 (존재 시)
//  *  - macOS/Windows에서는 경로를 못찾으면, Puppeteer 내장 Chromium 사용
//  */
// const connectToChrome = async () => {
//   try {
//     // 1) 운영체제 판별
//     const platform = os.platform(); // 'darwin' | 'win32' | 'linux' 등

//     // 2) 기본값(도커/리눅스)은 /usr/bin/google-chrome
//     let chromePath = '/usr/bin/google-chrome';

//     // 3) 맥( darwin )이면 맥 경로
//     if (platform === 'darwin') {
//       chromePath =
//         '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
//     }
//     // 4) 윈도우( win32 )면 윈도우 경로
//     else if (platform === 'win32') {
//       chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
//     }

//     // 5) 실제로 chromePath 파일이 존재하는지 검사
//     let useExecutablePath;
//     try {
//       await fs.access(chromePath);
//       useExecutablePath = chromePath;
//     } catch (err) {
//       logger.warn(
//         `[connectToChrome] '${chromePath}' not found; use bundled Chromium`
//       );
//       useExecutablePath = undefined;
//     }

//     // 6) Puppeteer.launch()
//     const browser = await puppeteer.launch({
//       headless: false,
//       executablePath: useExecutablePath,
//       args: [
//         '--no-sandbox',
//         '--disable-setuid-sandbox',
//         '--disable-gpu',
//         '--disable-extensions',
//         '--disable-dev-shm-usage',
//       ],
//     });

//     logger.info(
//       `Successfully launched Chrome (executablePath=${
//         useExecutablePath || 'default-bundled-chromium'
//       })`
//     );
//     return browser;
//   } catch (error) {
//     logger.error('Failed to launch Chrome with Puppeteer:', error.message);
//     throw error;
//   }
// };

// export default connectToChrome;


// // 예약 수정 컨트롤러
// export const updateReservation = async (req, res) => {
//     const { reservationId } = req.params;
//     const { hotelId, roomNumber, ...updateData } = req.body;
  
//     if (!hotelId) {
//       return res.status(400).send({ message: 'hotelId는 필수입니다.' });
//     }
  
//     try {
//       const Reservation = getReservationModel(hotelId);
//       const reservation = await Reservation.findOne({
//         _id: reservationId,
//         hotelId,
//       });
  
//       if (!reservation) {
//         return res.status(404).send({ message: '예약을 찾을 수 없습니다.' });
//       }
  
//       // 모든 예약 불러오기 (중복 검사를 위한 최소한의 필드만 선택)
//       const allReservations = await Reservation.find(
//         { hotelId, isCancelled: false },
//         'checkIn checkOut roomNumber _id'
//       );
  
//       // 중복 검사 수행
//       const { isConflict, conflictingReservation } = 중복검사(
//         reservation,
//         roomNumber,
//         allReservations
//       );
  
//       if (isConflict) {
//         return res.status(409).send({
//           message: '해당 객실은 이미 예약된 날짜가 포함되어 있습니다.',
//           conflictingReservation,
//         });
//       }
  
//       reservation.roomNumber = roomNumber;
//       Object.keys(updateData).forEach((key) => {
//         reservation[key] = updateData[key];
//       });
  
//       await reservation.save();
  
//       res.status(200).send(reservation);
//     } catch (error) {
//       logger.error('예약 수정 중 오류 발생:', error);
//       res.status(500).send({ message: '서버 오류가 발생했습니다.' });
//     }
//   };