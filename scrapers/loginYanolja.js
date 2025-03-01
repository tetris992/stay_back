// // backend/scrapers/loginYanolja.js
// import HotelSettingsModel from '../models/HotelSettings.js';
// import logger from '../utils/logger.js';

// export async function loginYanolja(page, hotelId, yanoljaLoginId, yanoljaLoginPw) {
//   try {
//     const loginUrl =
//       'https://account.yanolja.biz/?serviceType=PC&redirectURL=%2F&returnURL=https%3A%2F%2Fpartner.yanolja.com%2Fauth%2Flogin';
//     await page.goto(loginUrl, { waitUntil: 'networkidle0', timeout: 60000 });
//     logger.info(`[Yanolja] 로그인 페이지 접속: ${loginUrl}`);

//     const loginIdSelector = '#input-35';
//     const loginPwSelector = '#input-41';

//     // 아이디 입력 필드
//     await page.waitForSelector(loginIdSelector, { timeout: 15000 });
//     await page.click(loginIdSelector, { clickCount: 3 });
//     await page.keyboard.press('Backspace');
//     await page.type(loginIdSelector, yanoljaLoginId, { delay: 50 });
//     logger.info(`[Yanolja] 아이디 입력 완료: ${yanoljaLoginId}`);

//     // 비밀번호 필드
//     await page.waitForSelector(loginPwSelector, { timeout: 15000 });
//     await page.click(loginPwSelector, { clickCount: 3 });
//     await page.keyboard.press('Backspace');
//     await page.type(loginPwSelector, yanoljaLoginPw, { delay: 50 });
//     logger.info('[Yanolja] 비밀번호 입력 완료');

//     // 로그인 유지 체크박스(선택)
//     const stayLoggedInSelector =
//       '#app > div > div.wrap__content > div > div.v-input.inp-checkbox.v-input--hide-details.theme--light.v-input--selection-controls.v-input--checkbox > div > div > div > div';
//     try {
//       await page.waitForSelector(stayLoggedInSelector, { timeout: 3000 });
//       await page.click(stayLoggedInSelector);
//       logger.info('[Yanolja] 로그인 유지 체크박스 클릭');
//     } catch (err) {
//       logger.warn('[Yanolja] 로그인 유지 체크박스 없음(무시)');
//     }

//     // 로그인 버튼
//     const loginButtonSelector =
//       '#app > div > div.wrap__content > div > button > span';
//     await page.waitForSelector(loginButtonSelector, { timeout: 15000 });
//     await page.click(loginButtonSelector);
//     logger.info('[Yanolja] 로그인 버튼 클릭');

//     // 네비게이션 대기
//     await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 });
//     logger.info('[Yanolja] 로그인 후 페이지 로딩 완료');

//     // 쿠키 추출
//     const cookies = await page.cookies();
//     logger.info(`[Yanolja] 로그인 후 쿠키개수: ${cookies.length}`);

//     // DB 저장
//     try {
//       const updated = await HotelSettingsModel.findOneAndUpdate(
//         { hotelId },
//         { $set: { 'otaCredentials.yanolja.cookies': cookies } },
//         { new: true }
//       );
//       if (updated) {
//         logger.info(
//           `[Yanolja] 호텔ID=${hotelId} 쿠키 DB저장 완료 (개수=${cookies.length}).`
//         );
//       } else {
//         logger.warn(`[Yanolja] HotelSettings 미존재? hotelId=${hotelId}`);
//       }
//     } catch (dbErr) {
//       logger.error(`[Yanolja] 쿠키 저장 오류: ${dbErr.message}`);
//     }

//     return cookies;
//   } catch (error) {
//     logger.error(`[Yanolja] 로그인 오류: ${error.message}`);
//     throw error;
//   }
// }
