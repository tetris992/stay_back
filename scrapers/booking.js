// backend/scrapers/booking.js

import moment from 'moment';
import { sendReservations } from './scrapeHelper.js'; // 공통 헬퍼 모듈 임포트
import logger from '../utils/logger.js';

/**
 * Booking.com 스크래퍼 함수
 * @param {String} hotelId - 호텔 ID
 * @param {String} siteName - 예약 사이트 이름 (예: 'Booking.com')
 * @param {Browser} browserInstance - Puppeteer Browser 인스턴스
 */
const scrapeBooking = async (hotelId, siteName, browserInstance) => {
  let page;
  try {
    // 새로운 페이지 열기
    page = await browserInstance.newPage();
    const today = moment().format('YYYY-MM-DD');
    await page.setCacheEnabled(false);

    // 사용자 에이전트 및 뷰포트 설정
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 1024 });

    // 예약 페이지로 이동
    try {
      await page.goto(
        'https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/search_reservations.html?upcoming_reservations=1&source=nav&hotel_id=6876426&lang=ko&ses=381071588211304306533bb308f23c1d&date_from=2024-11-29&date_to=2024-11-30&date_type=arrival',
        {
          waitUntil: 'networkidle2',
          timeout: 60000,
        }
      );
      logger.info(
        `Navigated to reservation page: ${siteName} for hotelId: ${hotelId}`
      );
    } catch (error) {
      logger.error(
        'Failed to navigate to the reservation page:',
        error.message
      );
      await page.close();
      throw new Error('Failed to navigate to Booking.com reservation page'); // 큐 매니저에서 재시도 로직을 작동시킬 수 있도록 에러를 던짐
    }

    // 예약 정보 추출
    const reservations = await page.$$eval(
      '#main-content > div > div.reservation-table__wrapper > table > tbody > tr',
      (rows) =>
        rows
          .map((row) => {
            const customerNameElement = row.querySelector('th'); // 예약자
            if (!customerNameElement) return null;

            const customerName = customerNameElement.innerText.trim();
            const checkIn =
              row.querySelector('td:nth-child(2)')?.innerText.trim() || '';
            const checkOut =
              row.querySelector('td:nth-child(3)')?.innerText.trim() || '';
            const roomInfo =
              row
                .querySelector('td.wrap-anywhere.bui-table__cell')
                ?.innerText.trim() || '';
            const reservationDate =
              row.querySelector('td:nth-child(5)')?.innerText.trim() || '';
            const reservationStatus =
              row.querySelector('td:nth-child(6)')?.innerText.trim() || '';
            const price =
              row.querySelector('td:nth-child(7)')?.innerText.trim() || '';
            const reservationNo =
              row.querySelector('td:nth-child(9)')?.innerText.trim() || '';

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
          .filter((reservation) => reservation !== null)
    );

    logger.info('Extracted Reservation Data:', reservations);

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
      `Booking.com reservations successfully saved for hotelId ${hotelId}.`
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

export default scrapeBooking;
