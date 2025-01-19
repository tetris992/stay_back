// 파일: backend/scrapers/yanolja.js
import moment from 'moment';
import { sendReservations } from './scrapeHelper.js'; // 공통 헬퍼 모듈
import logger from '../utils/logger.js';
import connectToChrome from './browserConnection.js';
import HotelSettingsModel from '../models/HotelSettings.js';

// (1) 쿠키 안전 변환
function toSafeCookies(storedCookies = []) {
  return storedCookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain || 'partner.yanolja.com',
    path: c.path || '/',
    expires: c.expires > 0 ? c.expires : 0,
    httpOnly: !!c.httpOnly,
    secure: !!c.secure,
    sameSite: c.sameSite || 'None',
  }));
}

// (2) 로그인 여부 체크
async function checkAlreadyLoggedIn(page) {
  const loginIdSelector = '#input-35';
  try {
    await page.waitForSelector(loginIdSelector, { timeout: 3000 });
    return false; // 로그인창 표시됨 => 로그인 필요
  } catch {
    // 셀렉터 안보임 => 이미 로그인
    return true;
  }
}

// (3) 인트로 페이지에서 "파트너센터 로그인" 버튼
async function handleIntroPage(page) {
  try {
    const partnerCenterLoginBtn =
      '#root > div.MuiBox-root.css-0 > div > div.MuiGrid-root.MuiGrid-container.e1rt3jk68.css-dokbh6 > div.MuiStack-root.e1rt3jk65.css-jkbg3l > div:nth-child(3) > button';
    await page.waitForSelector(partnerCenterLoginBtn, { timeout: 3000 });
    logger.info('[Yanolja Intro] "파트너센터 로그인" 버튼 발견 → 클릭');

    await page.click(partnerCenterLoginBtn);
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 });
    logger.info('[Yanolja Intro] 인트로→로그인 페이지 이동 완료');
  } catch (err) {
    logger.warn('[Yanolja Intro] 인트로 버튼 미발견 or 클릭 실패(무시)');
  }
}

// (4) 야놀자 로그인
export async function loginYanolja(page, hotelId, yanoljaLoginId, yanoljaLoginPw) {
  try {
    await page.goto('https://partner.yanolja.com/intro', {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });
    logger.info('[Yanolja] 인트로 페이지 접근 시도');
    await handleIntroPage(page);

    const loginUrl =
      'https://account.yanolja.biz/?serviceType=PC&redirectURL=%2F&returnURL=https%3A%2F%2Fpartner.yanolja.com%2Fauth%2Flogin';
    await page.goto(loginUrl, { waitUntil: 'networkidle0', timeout: 60000 });
    logger.info(`[Yanolja] 로그인 페이지 접속: ${loginUrl}`);

    const loginIdSelector = '#input-35';
    const loginPwSelector = '#input-41';

    // 아이디 입력
    await page.waitForSelector(loginIdSelector, { timeout: 15000 });
    await page.click(loginIdSelector, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type(loginIdSelector, yanoljaLoginId, { delay: 50 });

    // 비밀번호 입력
    await page.waitForSelector(loginPwSelector, { timeout: 15000 });
    await page.click(loginPwSelector, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type(loginPwSelector, yanoljaLoginPw, { delay: 50 });

    // 로그인 유지 체크 (옵션)
    const stayLoggedInSelector =
      '#app > div > div.wrap__content > div > div.v-input.inp-checkbox.v-input--hide-details.theme--light.v-input--selection-controls.v-input--checkbox > div > div > div > div';
    try {
      await page.waitForSelector(stayLoggedInSelector, { timeout: 3000 });
      await page.click(stayLoggedInSelector);
      logger.info('[Yanolja] 로그인 유지 체크박스 클릭');
    } catch (err) {
      logger.warn('[Yanolja] 로그인 유지 체크박스 없음(무시)');
    }

    // 로그인 버튼
    const loginButtonSelector = '#app > div > div.wrap__content > div > button > span';
    await page.waitForSelector(loginButtonSelector, { timeout: 15000 });
    await page.click(loginButtonSelector);
    logger.info('[Yanolja] 로그인 버튼 클릭');

    // 로딩 대기
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 });
    logger.info('[Yanolja] 로그인 후 페이지 로딩 완료');

    // 쿠키 추출 후 DB 저장
    const cookies = await page.cookies();
    logger.info(`[Yanolja] 로그인 후 쿠키 length: ${cookies.length}`);
    try {
      const updated = await HotelSettingsModel.findOneAndUpdate(
        { hotelId },
        { $set: { 'otaCredentials.yanolja.cookies': cookies } },
        { new: true }
      );
      if (updated) {
        logger.info(`[Yanolja] 호텔ID=${hotelId} 쿠키 DB저장 완료 (개수=${cookies.length}).`);
      } else {
        logger.warn(`[Yanolja] HotelSettings 미존재? hotelId=${hotelId}`);
      }
    } catch (dbErr) {
      logger.error(`[Yanolja] 쿠키 저장 오류: ${dbErr.message}`);
    }
    return cookies;
  } catch (error) {
    logger.error(`[Yanolja] 로그인 오류: ${error.message}`);
    throw error;
  }
}

// (5) 예약 목록 추출
export async function extractReservations(page) {
  const rows = await page.$$('table > tbody > tr');
  if (!rows || rows.length === 0) return [];

  return page.$$eval('table > tbody > tr', (trs) =>
    trs
      .map((row) => {
        const reservationNo = row.querySelector('td.ReservationSearchListItem__no > span')
          ?.innerText.trim();
        const reservationStatus = row.querySelector('td.ReservationSearchListItem__status')
          ?.innerText.trim();
        const customerName = row.querySelector(
          'td.ReservationSearchListItem__visitor > span:nth-child(1)'
        )?.innerText.trim();
        const roomInfo = row.querySelector('td.ReservationSearchListItem__roomInfo')
          ?.innerText.trim();

        // 날짜 셀
        const dateTd = row.querySelector('td.ReservationSearchListItem__date');
        let checkIn = '';
        let checkOut = '';
        if (dateTd) {
          const lines = dateTd.innerText.split('\n').map((s) => s.trim());
          checkIn = lines[0] || '';
          checkOut = lines[1] || '';
        }

        const reservationDate = row.querySelector('td.ReservationSearchListItem__reservation')
          ?.innerText.trim() || '';
        const price = row.querySelector('td.ReservationSearchListItem__price')
          ?.innerText.trim() || '';

        // reservationNo가 없으면 무효 행으로 간주(필요시)
        if (!reservationNo) return null;

        return {
          reservationNo,
          reservationStatus,
          customerName,
          roomInfo,
          checkIn,
          checkOut,
          reservationDate,
          price,
        };
      })
      .filter(Boolean)
  );
}

/**
 * 숙소 전환 함수
 */
export async function switchAccommodation(page, desiredAccommodationName) {
  try {
    const firstButtonSelector =
      '#root > div.MuiBox-root.css-0 > header > div > div > div:nth-child(1) > button:nth-child(2)';
    logger.info(`Attempting to find first button: ${firstButtonSelector}`);
    await page.waitForSelector(firstButtonSelector, { timeout: 20000 });
    const firstButton = await page.$(firstButtonSelector);
    if (!firstButton) throw new Error('드롭다운 버튼을 찾을 수 없습니다.');
    await firstButton.evaluate((el) => el.scrollIntoView());
    await firstButton.click();
    logger.info('드롭다운 버튼 클릭 완료');

    const dropdownContentSelector =
      '#app-bar-property-info > div.MuiPaper-root.MuiPaper-elevation.MuiPaper-rounded.MuiPaper-elevation8.MuiPopover-paper.css-1dmzujt > div > div > div.MuiStack-root.css-9jay18';
    await page.waitForSelector(dropdownContentSelector, { timeout: 15000 });
    logger.info('드롭다운 메뉴 로드 완료');

    const secondButtonSelector =
      '#app-bar-property-info > div.MuiPaper-root.MuiPaper-elevation.MuiPaper-rounded.MuiPaper-elevation8.MuiPopover-paper.css-1dmzujt > div > div > div.MuiStack-root.css-9jay18 > button';
    await page.waitForSelector(secondButtonSelector, { timeout: 15000 });
    const secondButton = await page.$(secondButtonSelector);
    if (!secondButton) {
      logger.warn('(다른 숙소 선택)을 찾을 수 없습니다.');
      return false;
    }
    await secondButton.evaluate((el) => el.scrollIntoView());
    await secondButton.click();

    const accommodationListSelector =
      'body > div.MuiPopover-root.e1d6lcwf6.MuiModal-root.css-1xyay8i > div.MuiPaper-root.MuiPaper-elevation.MuiPaper-rounded.MuiPaper-elevation8.MuiPopover-paper.css-17c12ww > ul > div > div > div > span';
    await page.waitForSelector(accommodationListSelector, { timeout: 15000 });

    const accommodationSelector =
      'body > div.MuiPopover-root.e1d6lcwf6.MuiModal-root.css-1xyay8i > div.MuiPaper-root.MuiPaper-elevation.MuiPaper-rounded.MuiPaper-elevation8.MuiPopover-paper.css-17c12ww > ul > div > div > div > span';
    await page.waitForSelector(accommodationSelector, { timeout: 15000 });
    const accommodationElement = await page.$(accommodationSelector);
    if (!accommodationElement) {
      logger.warn(`숙소 '${desiredAccommodationName}'를 찾을 수 없습니다.`);
      return false;
    }
    await accommodationElement.evaluate((el) => el.scrollIntoView());
    await accommodationElement.click();
    return true;
  } catch (error) {
    logger.error(`숙소 전환 중 오류 발생: ${error.message}`);
    return false;
  }
}

/**
 * 변경된 로직: 첫 번째 스크랩 결과는 서버 전송 X, 
 * 두 번째 스크랩(숙소전환 후) 결과만 서버 전송
 */
export default async function scrapeYanoljaMotel(hotelId, siteName) {
  let browser;
  let page;
  try {
    // 1) 브라우저 연결
    browser = await connectToChrome();
    logger.info('[Yanolja] 브라우저 연결됨.');

    // 2) 새 페이지 열기
    page = await browser.newPage();
    logger.info('[Yanolja] 새 페이지 생성 완료.');
    await page.setViewport({ width: 2080, height: 1680 });

    // 2-1) DB 쿠키 로드
    const hotelSettings = await HotelSettingsModel.findOne({ hotelId });
    const storedCookies = hotelSettings?.otaCredentials?.yanolja?.cookies || [];
    if (storedCookies.length > 0) {
      const safeCookies = toSafeCookies(storedCookies);
      await page.setCookie(...safeCookies);
      logger.info(`[Yanolja] 기존 쿠키(${safeCookies.length}개) 로드됨.`);
    } else {
      logger.info('[Yanolja] 쿠키 없음(최초 로그인 필요 가능).');
    }

    // 3) 메인 페이지 → 로그인 여부
    await page.goto('https://partner.yanolja.com/', {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });
    logger.info('[Yanolja] 메인 페이지 접속. 로그인 여부 판단 중...');

    let loggedIn = await checkAlreadyLoggedIn(page);
    if (!loggedIn) {
      // 로그인 필요
      if (
        !hotelSettings?.otaCredentials?.yanolja?.loginId ||
        !hotelSettings?.otaCredentials?.yanolja?.loginPw
      ) {
        throw new Error('[Yanolja] 아이디/비번 설정 안됨. 로그인 불가.');
      }
      const { loginId, loginPw } = hotelSettings.otaCredentials.yanolja;

      logger.info('[Yanolja] 쿠키 만료 or 로그아웃 상태 → 로그인 시도');
      await loginYanolja(page, hotelId, loginId, loginPw);
      logger.info('[Yanolja] 로그인 완료.');
    } else {
      logger.info('[Yanolja] 이미 로그인된 상태');
    }

    // 날짜 범위
    const today = moment();
    const startDate = today.format('YYYY-MM-DD');
    const endDate = moment().add(30, 'days').format('YYYY-MM-DD');

    // 4) 예약 페이지 이동
    await page.goto('https://partner.yanolja.com/reservation/search', {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });
    logger.info(`(1) 예약 페이지 이동 완료: ${siteName} (hotelId: ${hotelId})`);

    // 5) 첫 번째 스크랩(모텔)용 URL
    const motelUrl = `https://partner.yanolja.com/reservation/search?dateType=CHECK_IN_DATE&startDate=${startDate}&endDate=${endDate}&reservationStatus=ALL&keywordType=VISITOR_NAME&page=1&size=50&sort=checkInDate,desc&propertyCategory=MOTEL&checkedIn=STAY_STATUS_ALL&selectedDate=${today.format(
      'YYYY-MM-DD'
    )}&searchType=detail&useTypeDetail=ALL&useTypeCheckIn=ALL`;
    await page.goto(motelUrl, { waitUntil: 'networkidle0', timeout: 60000 });
    logger.info(`(1) 예약 검색 URL 이동 완료 (모텔): ${startDate} ~ ${endDate}`);

    // 6) 첫 번째 스크랩 - "서버 전송은 하지 않는다!"
    const firstReservations = await extractReservations(page);
    if (firstReservations && firstReservations.length > 0) {
      logger.info(
        `[Yanolja] 첫 번째 스크랩 (모텔) 결과: ${firstReservations.length}건. (서버 전송은 생략)`
      );
    } else {
      logger.info('[Yanolja] 첫 번째 스크랩(모텔) 결과: 없음.');
    }

    // 7) 메인페이지 → 숙소전환
    logger.info('[Yanolja] 첫 번째 스크래핑 후, 메인페이지로 이동...');
    await page.goto('https://partner.yanolja.com/', {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });
    logger.info('[Yanolja] 메인페이지 이동 완료.');

    const desiredAccommodationName = '숙소전환(모텔<-->호텔)';
    const switchSuccess = await switchAccommodation(page, desiredAccommodationName);
    if (!switchSuccess) {
      logger.warn('[Yanolja] 숙소 전환 실패 (수동 전환 필요) → 종료');
      return;
    }

    logger.info('[Yanolja] 숙소 전환 성공 → 두 번째 스크래핑 시도');

    // 8) 다시 예약 페이지
    await page.goto('https://partner.yanolja.com/reservation/search', {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });
    logger.info('(2) 두 번째 예약 검색 페이지 이동 완료 (호텔?)');

    // 8-1) 필요하다면 호텔 전용 URL로 갈 수 있음.
    // 여기서는 motelUrl 그대로 써도 같은 결과가 나올 수 있지만,
    // 실제로 호텔 전용 파라미터( useTypeCheckIn=STAY, propertyCategory=HOTEL 등)를 사용 가능.
    const hotelUrl = motelUrl.replace('propertyCategory=MOTEL', 'propertyCategory=HOTEL');
    // 예: useTypeCheckIn=STAY & useTypeDetail=STAY 등으로 바꿀 수도 있음

    await page.goto(hotelUrl, { waitUntil: 'networkidle0', timeout: 60000 });
    logger.info(`(2) 예약 검색 URL 이동 완료 (호텔): ${startDate} ~ ${endDate}`);

    // 9) 두 번째 스크랩 결과를 서버 전송
    const secondReservations = await extractReservations(page);
    if (secondReservations && secondReservations.length > 0) {
      await sendReservations(hotelId, siteName, secondReservations);
      logger.info(`[Yanolja] 두 번째 스크랩(숙소전환 후) 예약 ${secondReservations.length}건 전송완료`);
    } else {
      logger.info('[Yanolja] 두 번째 스크랩(숙소전환 후) 예약 없음.');
    }
  } catch (error) {
    logger.error(`스크래핑 실패: ${siteName}(hotelId=${hotelId}) - ${error.message}`);
    throw error;
  } finally {
    // 10) 자원 정리
    if (page) {
      await page.close();
      logger.info(`[Yanolja] 페이지 닫음: ${siteName} (hotelId=${hotelId}).`);
    }
    if (browser) {
      await browser.close();
      logger.info(`[Yanolja] 브라우저 종료: ${siteName} (hotelId=${hotelId}).`);
    }
  }
}
