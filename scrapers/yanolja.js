// backend/scrapers/yanolja.js
import moment from 'moment';
import { sendReservations } from './scrapeHelper.js'; // 공통 헬퍼 모듈
import logger from '../utils/logger.js';
import connectToChrome from './browserConnection.js';
import HotelSettingsModel from '../models/HotelSettings.js';

/**
 * 로그인 수행때 인트로 페이지가 나타나는 경우를 대비한 함수
 * (추가) DB 쿠키 재활용 시 필요할 수 있는 safe 변환 함수
 * 쿠키에 필수 필드만 남기고, 불필요하거나 유효하지 않은 값(expires=-1 등)을 교정
 */
function toSafeCookies(storedCookies = []) {
  return storedCookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain || 'partner.yanolja.com',
    path: c.path || '/',
    expires: c.expires > 0 ? c.expires : 0, // 0보다 작으면 0으로
    httpOnly: !!c.httpOnly,
    secure: !!c.secure,
    sameSite: c.sameSite || 'None',
  }));
}

export async function findOrCreatePage(browser, domain, fallbackURL) {
  const pages = await browser.pages();
  for (const pg of pages) {
    if (pg.isClosed()) continue; // 닫힌 탭 무시
    const url = pg.url();
    if (url.includes(domain)) {
      logger.info(`Reusing tab: ${url}`);
      return pg;
    }
  }
  logger.info(`No existing tab for '${domain}'. Opening new page...`);
  const newPage = await browser.newPage();
  await newPage.goto(fallbackURL, { waitUntil: 'networkidle0' });
  logger.info(`Opened new tab at '${fallbackURL}'`);
  return newPage;
}

/**
 * 이미 로그인된 상태인지 간단히 체크
 * (메인 페이지에서 로그인창(#input-35) 있으면 => 로그인 필요)
 */
async function checkAlreadyLoggedIn(page) {
  const loginIdSelector = '#input-35';
  try {
    // 3초 이내에 로그인창이 보이면 => 아직 로그인 안 됨
    await page.waitForSelector(loginIdSelector, { timeout: 3000 });
    return false; // 로그인창 표시 => 로그인 필요
  } catch (err) {
    // 셀렉터 미등장 => 이미 로그인 상태로 판단
    return true;
  }
}

/**
 * (추가) “인트로 페이지”에서 “파트너센터 로그인” 버튼이 보이면 클릭
 *  - 예: https://partner.yanolja.com/intro
 *  - Selector:
 *    #root > div.MuiBox-root.css-0 > div > div.MuiGrid-root.MuiGrid-container.e1rt3jk68.css-dokbh6
 *    > div.MuiStack-root.e1rt3jk65.css-jkbg3l > div:nth-child(3) > button > span.MuiTypography-root...
 */
async function handleIntroPage(page) {
  try {
    // (1) 혹시 /intro로 자동 리다이렉트 되면, 해당 셀렉터(파트너센터 로그인 버튼)가 나타날 수도 있음
    //     ※ 버튼 셀렉터는 버전/화면에 따라 변동될 가능성 있으니 주의
    const partnerCenterLoginBtn =
      '#root > div.MuiBox-root.css-0 > div > div.MuiGrid-root.MuiGrid-container.e1rt3jk68.css-dokbh6 > div.MuiStack-root.e1rt3jk65.css-jkbg3l > div:nth-child(3) > button';

    // (2) 2~3초 내에 버튼을 찾는다
    await page.waitForSelector(partnerCenterLoginBtn, { timeout: 3000 });
    logger.info('[Yanolja Intro] "파트너센터 로그인" 버튼 발견 → 클릭 시도');

    await page.click(partnerCenterLoginBtn);

    // (3) 클릭 후 네비게이션 대기 (로그인화면으로 넘어갈 수 있음)
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 });
    logger.info('[Yanolja Intro] 인트로 → 로그인 페이지 이동 완료');
  } catch (err) {
    // 버튼 미발견 => 인트로 페이지가 아닐 수도 있고, 이미 로그인일 수도 있음
    logger.warn('[Yanolja Intro] 인트로 버튼 미발견 or 클릭 실패(무시)');
  }
}

export async function loginYanolja(
  page,
  hotelId,
  yanoljaLoginId,
  yanoljaLoginPw
) {
  try {
    // (A) 인트로 페이지 시도
    await page.goto('https://partner.yanolja.com/intro', {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });
    logger.info('[Yanolja] 인트로 페이지 접근 시도');

    // (B) 인트로 화면에서 ‘파트너센터 로그인’ 버튼 클릭 (있다면)
    await handleIntroPage(page);

    const loginUrl =
      'https://account.yanolja.biz/?serviceType=PC&redirectURL=%2F&returnURL=https%3A%2F%2Fpartner.yanolja.com%2Fauth%2Flogin';
    await page.goto(loginUrl, { waitUntil: 'networkidle0', timeout: 60000 });
    logger.info(`[Yanolja] 로그인 페이지 접속: ${loginUrl}`);

    const loginIdSelector = '#input-35';
    const loginPwSelector = '#input-41';

    // 아이디 입력 필드
    await page.waitForSelector(loginIdSelector, { timeout: 15000 });

    await page.click(loginIdSelector, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type(loginIdSelector, yanoljaLoginId, { delay: 50 });
    logger.info(`[Yanolja] 아이디 입력 완료: ${yanoljaLoginId}`);

    // 비밀번호 입력 필드
    await page.waitForSelector(loginPwSelector, { timeout: 15000 });
    await page.click(loginPwSelector, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type(loginPwSelector, yanoljaLoginPw, { delay: 50 });
    logger.info('[Yanolja] 비밀번호 입력 완료');

    // 로그인 유지 체크박스 (선택)
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
    const loginButtonSelector =
      '#app > div > div.wrap__content > div > button > span';
    await page.waitForSelector(loginButtonSelector, { timeout: 15000 });
    await page.click(loginButtonSelector);
    logger.info('[Yanolja] 로그인 버튼 클릭');

    // (5) 페이지 로딩 대기
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 });
    logger.info('[Yanolja] 로그인 후 페이지 로딩 완료');

    // (6) 로그인 후 쿠키 추출
    const cookies = await page.cookies();
    logger.info(`[Yanolja] 로그인 후 쿠키 length: ${cookies.length}`);

    // 쿠키 DB 저장
    try {
      const updated = await HotelSettingsModel.findOneAndUpdate(
        { hotelId },
        { $set: { 'otaCredentials.yanolja.cookies': cookies } },
        { new: true }
      );
      if (updated) {
        logger.info(
          `[Yanolja] 호텔ID=${hotelId} 쿠키 DB저장 완료 (개수=${cookies.length}).`
        );
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

// /**
//  * 이미 로그인되어 있나? 간단한 판단 로직
//  * - 메인 페이지에서 로그인창(#input-35)이 뜨는지 짧게 waitForSelector 시도
//  */
// async function checkAlreadyLoggedIn(page) {
//   const loginIdSelector = '#input-35';
//   try {
//     await page.waitForSelector(loginIdSelector, { timeout: 3000 });
//     // 여기까지 왔다는 건 => 로그인창이 있음 => 로그인 필요
//     return false;
//   } catch {
//     // 셀렉터가 안 보이면 => 이미 로그인됨
//     return true;
//   }
// }

/**
 * 예약 목록 추출(테이블 파싱)
 * @param {Page} page - Puppeteer Page
 * @returns {Array} - 예약 정보 배열
 */
export async function extractReservations(page) {
  return page.$$eval('table > tbody > tr', (rows) =>
    rows
      .map((row) => {
        const reservationNo = row
          .querySelector('td.ReservationSearchListItem__no > span')
          ?.innerText.trim();
        const reservationStatus = row
          .querySelector('td.ReservationSearchListItem__status')
          ?.innerText.trim();
        const customerName = row
          .querySelector(
            'td.ReservationSearchListItem__visitor > span:nth-child(1)'
          )
          ?.innerText.trim();
        const roomInfo = row
          .querySelector('td.ReservationSearchListItem__roomInfo')
          ?.innerText.trim();

        const checkInRaw = row
          .querySelector('td.ReservationSearchListItem__date')
          ?.innerText.trim();
        const checkIn = checkInRaw ? checkInRaw.split('\n')[0].trim() : null;

        const checkOut = row
          .querySelector(
            'td.ReservationSearchListItem__date > span:nth-child(2)'
          )
          ?.innerText.trim();
        const reservationDate = row
          .querySelector('td.ReservationSearchListItem__reservation')
          ?.innerText.trim();
        const price = row
          .querySelector('td.ReservationSearchListItem__price')
          ?.innerText.trim();

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
 * 숙소 전환 함수 (야놀자 내에서 숙소 리스트 전환)
 * @param {Page} page
 * @param {String} desiredAccommodationName
 * @returns {Boolean} - 전환 성공 여부
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
 * YanoljaMotel 스크래퍼 함수 (기본)
 * @param {String} hotelId   - 호텔 ID
 * @param {String} siteName  - 예: 'YanoljaMotel'
 */
export default async function scrapeYanoljaMotel(hotelId, siteName) {
  let browser;
  let page;
  try {
    // (1) 브라우저 연결
    browser = await connectToChrome();
    logger.info('[Yanolja] 브라우저 연결됨.');

    // (2) 새 페이지 열기
    page = await browser.newPage();
    logger.info('[Yanolja] 새 페이지 생성 완료.');

    await page.setViewport({ width: 2080, height: 1680 });

    // (2-1) DB에서 쿠키 로드해서 적용
    const hotelSettings = await HotelSettingsModel.findOne({ hotelId });
    const storedCookies = hotelSettings?.otaCredentials?.yanolja?.cookies || [];
    if (storedCookies.length > 0) {
      const safeCookies = toSafeCookies(storedCookies);
      await page.setCookie(...safeCookies);
      logger.info(`[Yanolja] 기존 쿠키(${safeCookies.length}개) 로드됨.`);
    } else {
      logger.info('[Yanolja] 쿠키 없음(최초 로그인 필요 가능).');
    }

    // (3) 메인 페이지(https://partner.yanolja.com)로 이동 -> 로그인 여부 체크
    await page.goto('https://partner.yanolja.com/', {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });
    logger.info('[Yanolja] 메인 페이지 접속. 로그인 여부 판단 중...');

    let loggedIn = await checkAlreadyLoggedIn(page);
    if (!loggedIn) {
      // 로그인 필요 => DB에 아이디/비번이 있어야 한다.
      if (
        !hotelSettings?.otaCredentials?.yanolja?.loginId ||
        !hotelSettings?.otaCredentials?.yanolja?.loginPw
      ) {
        throw new Error('[Yanolja] 아이디/비번 설정 안됨. 로그인 불가.');
      }
      const { loginId, loginPw } = hotelSettings.otaCredentials.yanolja;

      logger.info(
        '[Yanolja] 쿠키가 만료되었거나 로그아웃 상태. 로그인 시도...'
      );
      await loginYanolja(page, hotelId, loginId, loginPw);
      logger.info('[Yanolja] 로그인 완료.');
    } else {
      logger.info('[Yanolja] 이미 로그인된 상태로 간주.');
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
    logger.info(`예약 페이지 이동 완료: ${siteName} (hotelId: ${hotelId})`);

    // 5) 원하는 URL로 다시 이동(날짜 범위)
    const url = `https://partner.yanolja.com/reservation/search?dateType=CHECK_IN_DATE&startDate=${startDate}&endDate=${endDate}&reservationStatus=ALL&keywordType=VISITOR_NAME&page=1&size=50&sort=checkInDate,desc&propertyCategory=MOTEL&checkedIn=STAY_STATUS_ALL&selectedDate=${today.format(
      'YYYY-MM-DD'
    )}&searchType=detail&useTypeDetail=ALL&useTypeCheckIn=ALL`;
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    logger.info(`예약 검색 URL 이동 완료 (날짜범위 ${startDate} ~ ${endDate})`);

    // 6) 예약 목록 추출
    const reservations = await extractReservations(page);
    // logger.info(`추출된 예약 데이터: ${JSON.stringify(reservations, null, 2)}`);

    if (!reservations || reservations.length === 0) {
      logger.info(`${siteName}(${hotelId})에 예약 없음. 서버에 전송안함.`);
    } else {
      await sendReservations(hotelId, siteName, reservations);
      logger.info(`${siteName} 예약 정보 저장 성공 (hotelId=${hotelId}).`);
    }

    // 7) 메인페이지로 이동 후 숙소전환 시도
    logger.info('첫 번째 스크래핑 완료 후 메인페이지 이동...');
    await page.goto('https://partner.yanolja.com/', {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });
    logger.info('메인페이지 이동 완료.');

    // 원하는 숙소 (예: '숙소전환(모텔<-->호텔)')
    const desiredAccommodationName = '숙소전환(모텔<-->호텔)';
    const switchSuccess = await switchAccommodation(
      page,
      desiredAccommodationName
    );
    if (switchSuccess) {
      logger.info('숙소 전환에 성공했습니다. (두 번째 스크래핑 시도)');

      // 두 번째 검색 페이지
      await page.goto('https://partner.yanolja.com/reservation/search', {
        waitUntil: 'networkidle0',
        timeout: 60000,
      });
      logger.info('두 번째 예약 검색 페이지 이동 완료.');

      // 다시 날짜범위 URL로 이동
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
      logger.info(`두 번째 예약 검색 URL 이동 완료 (${startDate}~${endDate})`);

      const newReservations = await extractReservations(page);
      // logger.info(
      //   `숙소 전환 후 새 예약 데이터: ${JSON.stringify(
      //     newReservations,
      //     null,
      //     2
      //   )}`
      // );

      if (newReservations && newReservations.length > 0) {
        await sendReservations(hotelId, siteName, newReservations);
        logger.info(
          `숙소 전환 후 예약도 성공적으로 저장 (hotelId=${hotelId}).`
        );
      } else {
        logger.info(`${siteName}(${hotelId}) 숙소전환 후 예약 없음.`);
      }
    } else {
      logger.warn('숙소 전환 실패 (수동 전환 필요)');
    }
  } catch (error) {
    logger.error(
      `스크래핑 실패: ${siteName}(hotelId=${hotelId}) - ${error.message}`
    );
    throw error; // 큐 재시도 로직 등에서 감지하기 위함
  } finally {
    // 8) 자원 정리
    if (page) {
      // page.close() 시도 (원하면 주석 해제)
      await page.close();
      logger.info(`페이지를 닫았습니다: ${siteName} (hotelId=${hotelId}).`);
    }
    if (browser) {
      // await browser.disconnect(); // 브라우저 연결 해제 브라우저는 메모리에 살아있음, 결국 메모리 점유율이 올라감.
      await browser.close(); // 브라우저 종료
      logger.info(`브라우저 연결 해제: ${siteName} (hotelId=${hotelId}).`);
    }
  }
}
