// // backend/scrapers/yanolja.js

// import moment from 'moment';
// import { sendReservations } from './scrapeHelper.js'; // 공통 헬퍼 모듈
// import logger from '../utils/logger.js';
// import connectToChrome from './browserConnection.js';
// import HotelSettingsModel from '../models/HotelSettings.js';

// /**
//  * (추가) DB 쿠키 재활용 시 필요할 수 있는 safe 변환 함수
//  */
// function toSafeCookies(storedCookies = []) {
//   return storedCookies.map((c) => ({
//     name: c.name,
//     value: c.value,
//     domain: c.domain || 'partner.yanolja.com',
//     path: c.path || '/',
//     expires: c.expires > 0 ? c.expires : 0,
//     httpOnly: !!c.httpOnly,
//     secure: !!c.secure,
//     sameSite: c.sameSite || 'None',
//   }));
// }

// /**
//  * 이미 로그인된 상태인지 간단히 체크
//  * (메인 페이지에서 로그인창(#input-35) 있으면 => 로그인 필요)
//  */
// async function checkAlreadyLoggedIn(page) {
//   const loginIdSelector = '#input-35';
//   try {
//     // 3초 이내에 로그인창이 보이면 => 아직 로그인 안 됨
//     await page.waitForSelector(loginIdSelector, { timeout: 3000 });
//     return false; // 로그인창 표시 => 로그인 필요
//   } catch (err) {
//     // 셀렉터 미등장 => 이미 로그인 상태로 판단
//     return true;
//   }
// }

// /**
//  * (추가) “인트로 페이지”에서 “파트너센터 로그인” 버튼이 보이면 클릭
//  *  - 예: https://partner.yanolja.com/intro
//  *  - Selector:
//  *    #root > div.MuiBox-root.css-0 > div > div.MuiGrid-root.MuiGrid-container.e1rt3jk68.css-dokbh6
//  *    > div.MuiStack-root.e1rt3jk65.css-jkbg3l > div:nth-child(3) > button > span.MuiTypography-root...
//  */
// async function handleIntroPage(page) {
//   try {
//     // (1) 혹시 /intro로 자동 리다이렉트 되면, 해당 셀렉터(파트너센터 로그인 버튼)가 나타날 수도 있음
//     //     ※ 버튼 셀렉터는 버전/화면에 따라 변동될 가능성 있으니 주의
//     const partnerCenterLoginBtn =
//       '#root > div.MuiBox-root.css-0 > div > div.MuiGrid-root.MuiGrid-container.e1rt3jk68.css-dokbh6 > div.MuiStack-root.e1rt3jk65.css-jkbg3l > div:nth-child(3) > button';

//     // (2) 2~3초 내에 버튼을 찾는다
//     await page.waitForSelector(partnerCenterLoginBtn, { timeout: 3000 });
//     logger.info('[Yanolja Intro] "파트너센터 로그인" 버튼 발견 → 클릭 시도');

//     await page.click(partnerCenterLoginBtn);

//     // (3) 클릭 후 네비게이션 대기 (로그인화면으로 넘어갈 수 있음)
//     await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 });
//     logger.info('[Yanolja Intro] 인트로 → 로그인 페이지 이동 완료');
//   } catch (err) {
//     // 버튼 미발견 => 인트로 페이지가 아닐 수도 있고, 이미 로그인일 수도 있음
//     logger.warn('[Yanolja Intro] 인트로 버튼 미발견 or 클릭 실패(무시)');
//   }
// }

// /**
//  * 실제 로그인 함수
//  */
// export async function loginYanolja(
//   page,
//   hotelId,
//   yanoljaLoginId,
//   yanoljaLoginPw
// ) {
//   try {
//     // (A) 인트로 페이지 시도
//     await page.goto('https://partner.yanolja.com/intro', {
//       waitUntil: 'networkidle0',
//       timeout: 60000,
//     });
//     logger.info('[Yanolja] 인트로 페이지 접근 시도');

//     // (B) 인트로 화면에서 ‘파트너센터 로그인’ 버튼 클릭 (있다면)
//     await handleIntroPage(page);

//     // (C) 이후 실제 로그인 페이지:
//     //   https://account.yanolja.biz/?serviceType=PC&redirectURL=%2F&returnURL=...
//     const loginUrl =
//       'https://account.yanolja.biz/?serviceType=PC&redirectURL=%2F&returnURL=https%3A%2F%2Fpartner.yanolja.com%2Fauth%2Flogin';
//     await page.goto(loginUrl, { waitUntil: 'networkidle0', timeout: 60000 });
//     logger.info(`[Yanolja] 로그인 페이지 접속: ${loginUrl}`);

//     const loginIdSelector = '#input-35';
//     const loginPwSelector = '#input-41';

//     // 아이디/비번 필드 채우기
//     await page.waitForSelector(loginIdSelector, { timeout: 15000 });
//     await page.click(loginIdSelector, { clickCount: 3 });
//     await page.keyboard.press('Backspace');
//     await page.type(loginIdSelector, yanoljaLoginId, { delay: 50 });
//     logger.info(`[Yanolja] 아이디 입력 완료: ${yanoljaLoginId}`);

//     await page.waitForSelector(loginPwSelector, { timeout: 15000 });
//     await page.click(loginPwSelector, { clickCount: 3 });
//     await page.keyboard.press('Backspace');
//     await page.type(loginPwSelector, yanoljaLoginPw, { delay: 50 });
//     logger.info('[Yanolja] 비밀번호 입력 완료');

//     // 로그인 유지 체크박스 (있을 경우)
//     const stayLoggedInSelector =
//       '#app > div > div.wrap__content > div > div.v-input.inp-checkbox.v-input--hide-details.theme--light.v-input--selection-controls.v-input--checkbox > div > div > div > div';
//     try {
//       await page.waitForSelector(stayLoggedInSelector, { timeout: 3000 });
//       await page.click(stayLoggedInSelector);
//       logger.info('[Yanolja] "로그인 유지" 체크박스 클릭');
//     } catch {
//       logger.warn('[Yanolja] "로그인 유지" 체크박스 미존재(무시)');
//     }

//     // 로그인 버튼 클릭
//     const loginButtonSelector =
//       '#app > div > div.wrap__content > div > button > span';
//     await page.waitForSelector(loginButtonSelector, { timeout: 15000 });
//     await page.click(loginButtonSelector);
//     logger.info('[Yanolja] 로그인 버튼 클릭');

//     // 페이지 로딩 대기
//     await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 });
//     logger.info('[Yanolja] 로그인 후 페이지 로딩 완료');

//     // 로그인 후 쿠키 추출
//     const cookies = await page.cookies();
//     logger.info(`[Yanolja] 로그인 후 쿠키 length: ${cookies.length}`);

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

// /**
//  * 예약 목록 파싱
//  */
// export async function extractReservations(page) {
//   return page.$$eval('table > tbody > tr', (rows) =>
//     rows
//       .map((row) => {
//         const reservationNo = row
//           .querySelector('td.ReservationSearchListItem__no > span')
//           ?.innerText.trim();
//         const reservationStatus = row
//           .querySelector('td.ReservationSearchListItem__status')
//           ?.innerText.trim();
//         const customerName =
//           row
//             .querySelector(
//               'td.ReservationSearchListItem__visitor > span:nth-child(1)'
//             )
//             ?.innerText.trim() || '';
//         const roomInfo =
//           row
//             .querySelector('td.ReservationSearchListItem__roomInfo')
//             ?.innerText.trim() || '';

//         const checkInRaw =
//           row
//             .querySelector('td.ReservationSearchListItem__date')
//             ?.innerText.trim() || '';
//         const checkIn = checkInRaw ? checkInRaw.split('\n')[0].trim() : null;

//         const checkOut =
//           row
//             .querySelector(
//               'td.ReservationSearchListItem__date > span:nth-child(2)'
//             )
//             ?.innerText.trim() || '';

//         const reservationDate =
//           row
//             .querySelector('td.ReservationSearchListItem__reservation')
//             ?.innerText.trim() || '';
//         const price =
//           row
//             .querySelector('td.ReservationSearchListItem__price')
//             ?.innerText.trim() || '';

//         return {
//           reservationNo,
//           reservationStatus,
//           customerName,
//           roomInfo,
//           checkIn,
//           checkOut,
//           reservationDate,
//           price,
//         };
//       })
//       .filter(Boolean)
//   );
// }

// /**
//  * 숙소 전환 (모텔↔호텔 등)
//  */
// export async function switchAccommodation(page, desiredAccommodationName) {
//   try {
//     const firstButtonSelector =
//       '#root > div.MuiBox-root.css-0 > header > div > div > div:nth-child(1) > button:nth-child(2)';
//     logger.info(`Attempting to find first button: ${firstButtonSelector}`);
//     await page.waitForSelector(firstButtonSelector, { timeout: 20000 });
//     await page.click(firstButtonSelector);
//     logger.info('드롭다운 버튼 클릭 완료');

//     const dropdownContentSelector =
//       '#app-bar-property-info > div.MuiPaper-root.MuiPaper-elevation.MuiPaper-rounded.MuiPaper-elevation8.MuiPopover-paper.css-1dmzujt > div > div > div.MuiStack-root.css-9jay18';
//     await page.waitForSelector(dropdownContentSelector, { timeout: 15000 });
//     logger.info('드롭다운 메뉴 로드 완료');

//     const secondButtonSelector =
//       '#app-bar-property-info > div.MuiPaper-root.MuiPaper-elevation.MuiPaper-rounded.MuiPaper-elevation8.MuiPopover-paper.css-1dmzujt > div > div > div.MuiStack-root.css-9jay18 > button';
//     await page.waitForSelector(secondButtonSelector, { timeout: 15000 });
//     await page.click(secondButtonSelector);

//     // (이후 숙소 리스트 중 원하는 것을 선택)
//     // 예: 임의로 첫 번째 숙소만 클릭, 등등
//     // 자세한 로직은 실제 DOM 구조에 맞게 구현...

//     return true;
//   } catch (error) {
//     logger.error(`숙소 전환 중 오류 발생: ${error.message}`);
//     return false;
//   }
// }

// /**
//  * 스크래퍼 진입 함수
//  */
// export default async function scrapeYanoljaMotel(hotelId, siteName) {
//   let browser;
//   let page;
//   try {
//     // 1) 브라우저 연결
//     browser = await connectToChrome();
//     logger.info('[Yanolja] 브라우저 연결됨.');

//     // 2) 새 페이지
//     page = await browser.newPage();
//     logger.info('[Yanolja] 새 페이지 생성 완료.');

//     // 해상도 설정
//     await page.setViewport({ width: 1920, height: 1080 });

//     // 2-1) DB 쿠키 재활용
//     const hotelSettings = await HotelSettingsModel.findOne({ hotelId });
//     const storedCookies = hotelSettings?.otaCredentials?.yanolja?.cookies || [];
//     if (storedCookies.length > 0) {
//       const safeCookies = toSafeCookies(storedCookies);
//       await page.setCookie(...safeCookies);
//       logger.info(`[Yanolja] 기존 쿠키(${safeCookies.length}개) 로드됨.`);
//     } else {
//       logger.info('[Yanolja] 쿠키 없음(최초 로그인 필요).');
//     }

//     // 3) 메인 페이지로 이동 + 로그인 여부 확인
//     await page.goto('https://partner.yanolja.com/', {
//       waitUntil: 'networkidle0',
//       timeout: 60000,
//     });
//     logger.info('[Yanolja] 메인 페이지 접속. 로그인 여부 판단...');

//     // 로그인 필요?
//     const loggedIn = await checkAlreadyLoggedIn(page);
//     if (!loggedIn) {
//       logger.info('[Yanolja] 로그아웃 상태, 로그인 시도...');
//       if (
//         !hotelSettings?.otaCredentials?.yanolja?.loginId ||
//         !hotelSettings?.otaCredentials?.yanolja?.loginPw
//       ) {
//         throw new Error('[Yanolja] 야놀자 아이디/비번 미설정 → 로그인 불가.');
//       }
//       const { loginId, loginPw } = hotelSettings.otaCredentials.yanolja;
//       await loginYanolja(page, hotelId, loginId, loginPw);
//       logger.info('[Yanolja] 로그인 완료.');
//     } else {
//       logger.info('[Yanolja] 이미 로그인 상태로 간주.');
//     }

//     // 4) 예약 페이지 이동
//     const reservationsUrl = 'https://partner.yanolja.com/reservation/search';
//     await page.goto(reservationsUrl, {
//       waitUntil: 'networkidle0',
//       timeout: 60000,
//     });
//     logger.info(`예약 페이지 이동 완료: ${siteName} (hotelId: ${hotelId})`);

//     // 5) 추가로 날짜 파라미터를 붙여 다시 이동
//     const today = moment();
//     const startDate = today.format('YYYY-MM-DD');
//     const endDate = moment().add(30, 'days').format('YYYY-MM-DD');

//     const url = `https://partner.yanolja.com/reservation/search?dateType=CHECK_IN_DATE&startDate=${startDate}&endDate=${endDate}&reservationStatus=ALL&keywordType=VISITOR_NAME&page=1&size=50&sort=checkInDate,desc&propertyCategory=MOTEL&checkedIn=STAY_STATUS_ALL&selectedDate=${today.format(
//       'YYYY-MM-DD'
//     )}&searchType=detail&useTypeDetail=ALL&useTypeCheckIn=ALL`;

//     await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
//     logger.info(`예약 검색 URL 이동 완료 (기간: ${startDate} ~ ${endDate})`);

//     // 6) 예약 목록 추출
//     const reservations = await extractReservations(page);
//     if (reservations?.length > 0) {
//       await sendReservations(hotelId, siteName, reservations);
//       logger.info(`[Yanolja] 예약 정보 ${reservations.length}건 저장 완료.`);
//     } else {
//       logger.info(`[Yanolja] 예약 없음. 전송 생략 (hotelId=${hotelId}).`);
//     }

//     // 7) 숙소 전환 로직 (예시)
//     logger.info('[Yanolja] 첫 번째 스크래핑 완료 후 메인페이지 이동...');
//     await page.goto('https://partner.yanolja.com/', {
//       waitUntil: 'networkidle0',
//       timeout: 60000,
//     });

//     const desiredAccommodationName = '숙소전환(모텔<-->호텔)';
//     const switched = await switchAccommodation(page, desiredAccommodationName);
//     if (switched) {
//       logger.info('숙소 전환 성공 → 두 번째 스크래핑...');
//       // ... 동일하게 예약 페이지 접속, 목록 수집, etc.
//     } else {
//       logger.warn('숙소 전환 실패(수동 전환 필요)');
//     }
//   } catch (err) {
//     logger.error(
//       `[Yanolja] 스크래핑 실패(${siteName}, hotelId=${hotelId}): ${err.message}`
//     );
//     throw err; // 큐/재시도 로직
//   } finally {
//     // 자원 정리
//     if (page) {
//       await page.close();
//       logger.info(`페이지 닫음: ${siteName}(hotelId=${hotelId}).`);
//     }
//     if (browser) {
//       await browser.disconnect(); // puppeteer@19+라면 close() vs disconnect()등 상황에 맞게
//       logger.info(`브라우저 연결 해제: ${siteName}(hotelId=${hotelId}).`);
//     }
//   }
// }
