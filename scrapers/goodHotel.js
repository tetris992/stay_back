// backend/scrapers/goodHotel.js

// import moment from 'moment';
import { sendReservations } from './scrapeHelper.js'; // 공통 헬퍼 모듈 임포트
import logger from '../utils/logger.js';

/**
 * GoodChoice Hotel 스크래퍼 함수
 * @param {String} hotelId - 호텔 ID
 * @param {String} siteName - 예약 사이트 이름 (예: 'GoodHotel')
 * @param {Browser} browserInstance - Puppeteer Browser 인스턴스
 */
const scrapeGoodChoiceHotel = async (hotelId, siteName, browserInstance) => {
  let page;
  try {
    // 새로운 페이지 열기
    page = await browserInstance.newPage();
    await page.setCacheEnabled(false);

    // 사용자 에이전트 및 뷰포트 설정
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)'
    );
    await page.setViewport({ width: 2080, height: 1680 });

    // 예약 페이지로 이동
    try {
      await page.goto(
        'https://partner.goodchoice.kr/reservations/reservation-list',
        {
          waitUntil: 'networkidle0',
          timeout: 60000,
        }
      );
      logger.info(
        `Navigated to reservation page: ${siteName} for hotelId: ${hotelId}`
      );
    } catch (error) {
      logger.error(
        `Error while navigating to the reservation page for hotelId ${hotelId}:`,
        error.message
      );
      await page.close();
      throw new Error(
        'Failed to navigate to GoodChoice Hotel reservation page'
      ); // 큐 매니저에서 재시도 로직을 작동시킬 수 있도록 에러를 던짐
    }

    // ====== 여기에 추가된 코드 시작 ======

    // 월별 클릭 (드롭다운 열기)
    const monthDropdownSelector =
      '#__next > div > div > main > section > div.css-1kiy3dg.eobbxyy1 > div:nth-child(2) > button';
    await page.waitForSelector(monthDropdownSelector, {
      visible: true,
      timeout: 10000,
    });
    await page.click(monthDropdownSelector);
    logger.info('월별 드롭다운 버튼 클릭');

    // 드롭 메뉴 중 월 선택 (예: 3번째 항목 선택)
    const selectMonthSelector =
      '#__next > div > div > main > section > div.css-1kiy3dg.eobbxyy1 > div:nth-child(2) > div > ul > li:nth-child(3) > button';
    await page.waitForSelector(selectMonthSelector, {
      visible: true,
      timeout: 10000,
    });
    await page.click(selectMonthSelector);
    logger.info('드롭 메뉴에서 특정 월 선택');

    // 기본 10개 보기 버튼 클릭
    const view10ButtonSelector =
      '#__next > div > div > main > section > div.css-6obysj.e7w8kta5 > div.css-1bg37p3.e7w8kta2 > div.css-j2u1gu.eifwycs3 > button';
    await page.waitForSelector(view10ButtonSelector, {
      visible: true,
      timeout: 10000,
    });
    await page.click(view10ButtonSelector);
    logger.info('기본 10개 보기 버튼 클릭');

    // 50개씩 보기 드롭 메뉴 클릭
    const view50ButtonSelector =
      '#__next > div > div > main > section > div.css-6obysj.e7w8kta5 > div.css-1bg37p3.e7w8kta2 > div.css-j2u1gu.eifwycs3 > div > ul > li:nth-child(3) > button';
    await page.waitForSelector(view50ButtonSelector, {
      visible: true,
      timeout: 10000,
    });
    await page.click(view50ButtonSelector);
    logger.info('50개씩 보기 드롭 메뉴 클릭');

    // 페이지 로딩 대기 (필요시)
    if (typeof page.waitForTimeout === 'function') {
      await page.waitForTimeout(2000); // 2초 대기
    } else if (typeof page.waitFor === 'function') {
      await page.waitFor(2000); // Puppeteer v4 이하
    } else {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // 대체 대기
    }
    logger.info('필요한 클릭 동작 완료 및 페이지 로딩 대기');

    // ====== 추가된 코드 끝 ======

    // 예약 정보 추출
    const reservationData = [];
    const reservations = await page.$$eval('table > tbody > tr', (rows) =>
      rows.map((row) => {
        // Extract reservation status
        const reservationStatusCell = row.querySelector('td:nth-child(1)');
        const reservationStatus = reservationStatusCell
          ? reservationStatusCell.innerText.trim().split('\n')[0].trim()
          : '';

        // Extract reservation number
        const reservationNoCell = row.querySelector('td:nth-child(2)');
        const reservationNo = reservationNoCell
          ? reservationNoCell.innerText.trim().split('\n')[0].trim()
          : '';

        // Extract customer name
        const customerNameCell = row.querySelector('td:nth-child(3)');
        const customerName = customerNameCell
          ? customerNameCell.innerText.trim().split('\n')[0].trim()
          : '';

        // Extract room information
        const roomInfoCell = row.querySelector('td:nth-child(4)');
        const roomInfo = roomInfoCell
          ? roomInfoCell.innerText.trim().split('\n')[0].trim()
          : '';

        // Extract check-in and check-out dates
        const checkInCell = row.querySelector(
          'td:nth-child(5) > div:nth-child(1) > p'
        );
        const checkIn = checkInCell ? checkInCell.innerText.trim() : '';

        const checkOutCell = row.querySelector(
          'td:nth-child(5) > div:nth-child(2) > p'
        );
        const checkOut = checkOutCell ? checkOutCell.innerText.trim() : '';

        // Extract price information
        const priceCell = row.querySelector('td:nth-child(6)');
        const price = priceCell
          ? priceCell.innerText.trim().split('\n')[0].trim()
          : '';

        // Extract reservation date
        const reservationDateCell = row.querySelector('td:nth-child(8)');
        const reservationDate = reservationDateCell
          ? reservationDateCell.innerText.trim()
          : '';

        return {
          reservationStatus,
          reservationNo,
          customerName,
          roomInfo,
          checkIn,
          checkOut,
          price,
          reservationDate,
        };
      })
    );

    reservationData.push(...reservations);
    console.log('Extracted Reservation Data:', reservationData);

    // 예약이 없는 경우 종료
    if (!reservations || reservations.length === 0) {
      logger.info(
        `No reservations found for ${siteName} for hotelId: ${hotelId}. Data will not be sent to the server.`
      );
      return; // 정상적으로 작업 종료
    }

    // 예약 데이터 전송
    await sendReservations(hotelId, siteName, reservations);

    logger.info(
      `GoodHotel reservations successfully saved for hotelId ${hotelId}.`
    );
  } catch (error) {
    logger.error(
      `Scraping failed for ${siteName} for hotelId ${hotelId}:`,
      error.message
    );
    throw error; // 큐 매니저에서 재시도 로직을 작동시킬 수 있도록 에러를 던짐
  } finally {
    if (page) {
      await page.close(); // 페이지 닫기
      logger.info(`Closed page for ${siteName} for hotelId: ${hotelId}.`);
    }
  }
};

export default scrapeGoodChoiceHotel;
