// backend/scrapers/goodMotel.js

import moment from 'moment';
import { sendReservations } from './scrapeHelper.js'; // 공통 헬퍼 모듈 임포트
import logger from '../utils/logger.js';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Stealth Plugin 사용하여 헤드리스 탐지 우회
puppeteer.use(StealthPlugin());

/**
 * GoodChoice Motel 스크래퍼 함수
 * @param {String} hotelId - 호텔 ID
 * @param {String} siteName - 예약 사이트 이름 (예: 'GoodMotel')
 * @param {Browser} browserInstance - Puppeteer Browser 인스턴스
 */
const scrapeGoodChoiceMotel = async (hotelId, siteName, browserInstance) => {
  let page;
  try {
    // 새로운 페이지 열기
    page = await browserInstance.newPage();
    await page.setCacheEnabled(false);

    // 사용자 에이전트 및 뷰포트 설정
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    );
    await page.setViewport({ width: 2080, height: 1680 });

    // 콘솔 로그 및 페이지 오류 로깅(디버그용)

    // 날짜 범위 계산 (오늘부터 30일 후까지)
    const today = moment();
    const thirtyDaysLater = moment().add(30, 'days');

    // 형식 지정
    const startDate = today.format('YYYY-MM-DD');
    const endDate = thirtyDaysLater.format('YYYY-MM-DD');

    logger.info(`Scraping reservations from ${startDate} to ${endDate}`);

    // 초기 예약 페이지로 이동 (오늘 날짜로)
    try {
      const initialURL = `https://ad.goodchoice.kr/reservation/history/total?start_date=${startDate}&end_date=${startDate}&keyword=&keywordType=ORDER_NUMBER&armgno=&sort=checkin&page=1&checked_in=&status=`;
      await page.goto(initialURL, {
        waitUntil: 'networkidle2',
        timeout: 60000, // 60초 타임아웃
      });
      logger.info(
        `Navigated to initial reservation page: ${siteName} for hotelId: ${hotelId}`
      );
      logger.info(`Initial URL: ${page.url()}`);

      // 디버깅용 스크린샷 (필요 시 주석 해제)
      // await page.screenshot({ path: `screenshot_${hotelId}_initial.png`, fullPage: true });
    } catch (error) {
      logger.error(
        `Error while navigating to the initial reservation page for hotelId ${hotelId}: ${error.message}`
      );
      await page.close();
      throw new Error(
        'Failed to navigate to initial GoodChoice Motel reservation page'
      );
    }

    // 초기 예약 테이블 로드 대기
    try {
      await page.waitForSelector('table > tbody > tr', { timeout: 60000 });
      logger.info('Initial reservation table loaded.');
    } catch (error) {
      logger.error(
        `Initial reservation table not found or failed to load: ${error.message}`
      );
      await page.close();
      return; // 테이블 로드 실패 시 작업 종료
    }

    // 원하는 날짜 범위로 URL 변경 후 페이지 새로 고침
    try {
      const updatedURL = `https://ad.goodchoice.kr/reservation/history/total?start_date=${startDate}&end_date=${endDate}&keyword=&keywordType=ORDER_NUMBER&armgno=&sort=checkin&page=1&checked_in=&status=`;
      await page.goto(updatedURL, {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });
      logger.info(`Navigated to updated reservation page with new date range.`);
      logger.info(`Updated URL: ${page.url()}`);

      // 디버깅용 스크린샷 (필요 시 주석 해제)
      // await page.screenshot({ path: `screenshot_${hotelId}_updated.png`, fullPage: true });
    } catch (error) {
      logger.error(
        `Error while navigating to the updated reservation page for hotelId ${hotelId}: ${error.message}`
      );
      await page.close();
      throw new Error(
        'Failed to navigate to updated GoodChoice Motel reservation page'
      );
    }

    // 업데이트된 예약 테이블 로드 대기
    try {
      await page.waitForSelector('table > tbody > tr', { timeout: 60000 });
      logger.info('Updated reservation table loaded.');
    } catch (error) {
      logger.error(
        `Updated reservation table not found or failed to load: ${error.message}`
      );
      await page.close();
      return; // 테이블 로드 실패 시 작업 종료
    }

    // 예약 정보 추출
    const reservations = await page.$$eval('table > tbody > tr', (rows) =>
      rows.map((row) => {
        // 예약 상태 추출
        const reservationStatusCell = row.querySelector('td.is-left.is-first');
        const reservationStatus = reservationStatusCell
          ? reservationStatusCell.innerText.trim()
          : '';

        // 고객 이름 및 전화번호 추출 (예: '박경록 | 050440636911')
        const roomInfoCell = row.querySelector('td.is-left.detail-info');
        const roomInfoText = roomInfoCell ? roomInfoCell.innerText.trim() : '';
        const [customerName, phoneNumberRaw] = roomInfoText
          ? roomInfoText.split('|').map((text) => text.trim())
          : ['', ''];

        // 전화번호에서 추가 정보 제거 (예: '05044010****\n대실' -> '05044010****')
        const phoneNumber = phoneNumberRaw
          ? phoneNumberRaw.split('\n')[0].trim()
          : '';

        // **예약 번호 추출 수정**
        // 기존의 예약 번호는 고객 전화번호였으므로, 실제 예약 번호는 새로운 선택자로 추출
        const reservationNoElement = row.querySelector(
          '#app > div.contents-wrapper.container > div.row > div > div > div.contents-component > div.common-component--table.is-type01 > table > tbody > tr > td:nth-child(2) > p'
        );
        const reservationNo = reservationNoElement
          ? reservationNoElement.innerText.trim()
          : '';

        // 체크인/체크아웃 날짜 추출
        const checkInOutMatch = roomInfoText
          ? roomInfoText.match(
              /\d{4}-\d{2}-\d{2} \d{2}:\d{2} ~ \d{4}-\d{2}-\d{2} \d{2}:\d{2}/
            )
          : null;
        const checkIn = checkInOutMatch
          ? checkInOutMatch[0].split('~')[0].trim()
          : '';
        const checkOut = checkInOutMatch
          ? checkInOutMatch[0].split('~')[1].trim()
          : '';

        // 가격 정보 추출
        const priceCell = row.querySelector(
          'td:nth-child(6) > ul > li:nth-child(1)'
        );
        const price = priceCell ? priceCell.innerText.trim() : '';

        // 예약일 정보 추출 (잘못된 데이터 수정: checkIn 사용)
        const reservationDate = checkIn; // reservationDate 대신 checkIn 사용

        return {
          reservationStatus,
          reservationNo, // 수정된 예약 번호
          customerName,
          phoneNumber, // **추가된 전화번호 필드**
          roomInfo: roomInfoText.split('-')[1]?.trim() || roomInfoText, // 객실 정보 정제
          checkIn,
          checkOut,
          price,
          reservationDate, // checkIn 날짜 사용
        };
      })
    );

    // 예: const reservationsWithPhone = reservations.map(res => ({ ...res, phoneNumber: res.phoneNumber || 'N/A' }));

    logger.info(
      `Extracted Reservation Data: ${JSON.stringify(reservations, null, 2)}`
    );

    // 예약 데이터 중복 제거 (reservationNo 기준)
    const uniqueReservations = Array.from(
      new Map(reservations.map((res) => [res.reservationNo, res])).values()
    );

    logger.info(
      `Total unique reservations extracted: ${uniqueReservations.length}`
    );

    // 예약 데이터 검증: 모든 예약이 지정된 날짜 범위 내에 있는지 확인 (checkIn 사용)
    const isDataValid = uniqueReservations.every((reservation) => {
      const checkInDate = moment(reservation.checkIn, 'YYYY-MM-DD HH:mm');
      const start = moment(startDate, 'YYYY-MM-DD');
      const end = moment(endDate, 'YYYY-MM-DD').endOf('day'); // 종료일의 끝까지 포함
      return checkInDate.isBetween(start, end, null, '[]'); // 시작일과 종료일을 포함
    });
    logger.info(
      `All reservations within the specified date range: ${isDataValid}`
    );

    if (!isDataValid) {
      logger.warn('Some reservations fall outside the specified date range.');
      // 필요 시 추가적인 처리 로직
    }

    // 예약이 없는 경우 종료
    if (!uniqueReservations || uniqueReservations.length === 0) {
      logger.info(
        `No reservations found for ${siteName} for hotelId: ${hotelId}. Data will not be sent to the server.`
      );
      return; // 정상적으로 작업 종료
    }

    // 예약 데이터 전송
    await sendReservations(hotelId, siteName, uniqueReservations);

    // 중복 로그 제거: sendReservations 함수 내부에서 이미 로그를 출력한다고 가정
    logger.info(
      `GoodMotel reservations successfully saved for hotelId ${hotelId}.`
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

export default scrapeGoodChoiceMotel;
