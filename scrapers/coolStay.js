import moment from 'moment';
import { sendReservations } from './scrapeHelper.js';
import logger from '../utils/logger.js';

/**
 * CoolStay 스크래퍼 함수
 * @param {String} hotelId - 호텔 ID
 * @param {String} siteName - 예약 사이트 이름 (예: 'CoolStay')
 * @param {Browser} browserInstance - Puppeteer Browser 인스턴스
 */
const scrapeCoolStay = async (hotelId, siteName, browserInstance) => {
  let page;
  let reservationData = null;

  try {
    // 페이지 열기
    page = await browserInstance.newPage();
    const today = moment().format('YYYY-MM-DD');
    await page.setCacheEnabled(false);

    // 사용자 에이전트 및 뷰포트 설정
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 1024 });

    // 네트워크 요청 및 응답 가로채기
    page.on('response', async (response) => {
      const url = response.url();
      try {
        if (url.includes('/coolstay/pms/book')) {
          const data = await response.json(); // JSON 파싱 시도
          reservationData = data;
          logger.info('Intercepted Reservation Data (POST):', data);
        }
      } catch (error) {
        logger.warn(
          `Failed to parse reservation data from: ${url}, attempting raw text.`
          //   error.message
        );
        // try {
        //   const rawText = await response.text(); // 원시 텍스트로 응답 확인
        //   logger.info('Raw reservation response:', rawText);
        // } catch (rawError) {
        //   logger.error(
        //     `Failed to parse raw text reservation data from: ${url}.`,
        //     rawError.message
        //   );
        // }
      }
    });

    // 1단계: 대시보드 페이지로 이동
    try {
      await page.goto(`https://pms.coolstay.co.kr/motel-biz-pc/dashboard`, {
        waitUntil: 'networkidle0',
        timeout: 120000,
      });
      logger.info(
        `Navigated to dashboard page: ${siteName} for hotelId: ${hotelId}`
      );
    } catch (error) {
      logger.error(
        `Error while navigating to the dashboard page for hotelId ${hotelId}:`,
        error.message
      );
      await page.close();
      return;
    }

    // 로그인 여부 확인 및 로그인 수행
    const isLoggedIn = await page.evaluate(() => {
      const loginButton = document.querySelector('button[type="submit"]');
      return !loginButton;
    });

    if (!isLoggedIn) {
      logger.info('Not logged in. Proceeding to login...');
      await page.type('input[name="userId"]', process.env.COOLSTAY_USERNAME);
      await page.type(
        'input[name="userPassword"]',
        process.env.COOLSTAY_PASSWORD
      );
      await Promise.all([
        page.click('button[type="submit"]'),
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }),
      ]);
      logger.info(`Logged in successfully as ${process.env.COOLSTAY_USERNAME}`);
    } else {
      logger.info('Already logged in.');
    }

    // 2단계: 예약 페이지로 이동
    try {
      await page.goto(`https://pms.coolstay.co.kr/motel-biz-pc/reservation`, {
        waitUntil: 'networkidle0',
        timeout: 120000,
      });
      logger.info(
        `Navigated to reservation page: ${siteName} for hotelId: ${hotelId}`
      );
    } catch (error) {
      logger.error(
        `Error while navigating to the reservation page for hotelId ${hotelId}:`,
        error.message
      );
      await page.close();
      return;
    }

    // 데이터 로드 대기
    await page.waitForResponse(
      (response) =>
        response.url().includes('/coolstay/pms/book') &&
        response.status() === 200,
      { timeout: 30000 }
    );

    // 3단계: 예약 데이터 가공
    if (
      !reservationData ||
      !reservationData.orders ||
      reservationData.orders.length === 0
    ) {
      logger.info(
        `No reservations found for ${siteName} for hotelId: ${hotelId}.`
      );
      return; // 예약 데이터가 없으면 종료
    }

    const reservations = reservationData.orders.map((order) => ({
      reservationNo: order.orderKey || 'Unknown', // 여기서 order.orderKey로 수정
      customerName: order.book?.user?.name || 'Unknown',
      roomInfo: order.book?.room?.name || 'Unknown Room',
      checkIn: moment(order.book?.startDt).format('YYYY-MM-DD HH:mm'),
      checkOut: moment(order.book?.endDt).format('YYYY-MM-DD HH:mm'),
      reservationDate: moment(order.book?.regDt).format('YYYY-MM-DD HH:mm'),
      reservationStatus: statusMap[order.book?.status] || 'Unknown',
      price: order.totalPrice || order.salesPrice || 0,
      paymentMethod:
        order.payment?.methodDetailKr &&
        order.payment.methodDetailKr !== '결제수단없음'
          ? order.payment.methodDetailKr
          : 'OTA', // 결제 수단이 없을 경우 'OTA'로 설정
      customerPhone: order.book?.safeNumber || '정보 없음',
      siteName,
    }));

    logger.info(`Processed reservations:`, reservations);

    // 4단계: 예약 데이터 서버 전송
    await sendReservations(hotelId, siteName, reservations);
    logger.info(
      `${siteName} reservations successfully saved for hotelId ${hotelId}.`
    );
  } catch (error) {
    logger.error(
      `Scraping failed for ${siteName} for hotelId ${hotelId}:`,
      error.message
    );
    throw error;
  } finally {
    if (page) {
      await page.close();
      logger.info(`Closed page for ${siteName} for hotelId: ${hotelId}.`);
    }
  }
};

export default scrapeCoolStay;
