// backend/scrapers/scrapeAgoda.js

import moment from 'moment';
import { sendReservations } from './scrapeHelper.js';
import logger from '../utils/logger.js';
import HotelSettings from '../models/HotelSettings.js';
import connectToChrome from './browserConnection.js';

// 한글 범위 판별
function isKorean(str) {
  if (!str || str.length === 0) return false;
  const code = str.charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3;
}

// 동의어 사전 (double ↔ 더블, twin ↔ 트윈)
// 필요시 hinoki, terrace 등 추가 가능
const synonyms = {
  double: ['double', '더블'],
  twin: ['twin', '트윈'],
  hinoki: ['hinoki', '히노키'],
  // 'terrace': ['terrace', '테라스']
};

// 언어 기반 부분 매칭 함수
function partialLangMatch(scrapedWord, roomTypeWord) {
  const scrapedIsKorean = isKorean(scrapedWord);
  const roomIsKorean = isKorean(roomTypeWord);

  // 언어가 다르면 불일치
  if (scrapedIsKorean !== roomIsKorean) return false;

  if (scrapedIsKorean) {
    // 한글: 최소 2글자 일치
    if (scrapedWord.length < 2 || roomTypeWord.length < 2) return false;
    return scrapedWord.slice(0, 2) === roomTypeWord.slice(0, 2);
  } else {
    // 영어: 최소 3글자 일치
    if (scrapedWord.length < 3 || roomTypeWord.length < 3) return false;
    return scrapedWord.slice(0, 3) === roomTypeWord.slice(0, 3);
  }
}

// 동의어 처리 함수
function partialSynonymMatch(scrapedWord, roomTypeWord) {
  for (const canonicalForm in synonyms) {
    const variants = synonyms[canonicalForm];
    const scrapedMatches = variants.some((v) =>
      partialLangMatch(scrapedWord, v)
    );
    const roomMatches = variants.some((v) => partialLangMatch(roomTypeWord, v));
    if (scrapedMatches && roomMatches) {
      return true;
    }
  }
  return false;
}

// 최종 partialMatch 함수
function partialMatch(scrapedWord, roomTypeWord) {
  if (partialLangMatch(scrapedWord, roomTypeWord)) return true;
  if (partialSynonymMatch(scrapedWord, roomTypeWord)) return true;
  return false;
}

/**
 * 룸타입 매칭 함수 개선
 * - partialMatch로 단어별 매칭 점수 계산
 * - 매칭 단어 수(matchCount)가 낮을 경우 fallback:
 *   전체 roomInfo 문자열에 roomTypeWords 중 하나라도 포함되면 추가 점수 부여
 * - 매칭된 단어가 많을수록 해당 룸타입 점수가 높아지며, substring match로도 보조
 */
function findBestMatchingRoomType(scrapedRoomName, savedRoomTypes) {
  if (!scrapedRoomName) return null;

  const lowerScrapedName = scrapedRoomName.toLowerCase();
  const scrapedWords = lowerScrapedName.split(/[\s\-]+/);

  const roomTypeScores = savedRoomTypes.map((roomType) => {
    const roomTypeWords = [
      ...roomType.type.toLowerCase().split(/[\s\-]+/),
      ...roomType.nameKor.toLowerCase().split(/[\s\-]+/),
      ...roomType.nameEng.toLowerCase().split(/[\s\-]+/),
      ...(roomType.aliases
        ? roomType.aliases.flatMap((alias) =>
            alias.toLowerCase().split(/[\s\-]+/)
          )
        : []),
    ].filter((w) => w.length > 0);

    // 1차: partialMatch 기반 점수 계산
    const matchedWords = scrapedWords.filter((scrapedWord) =>
      roomTypeWords.some((rtWord) => partialMatch(scrapedWord, rtWord))
    );
    let matchCount = matchedWords.length;

    // 2차: substring 기반 fallback
    // roomTypeWords 중 하나라도 scrapedRoomName에 포함되면 추가 점수
    // 이미 matchedWords가 많다면 굳이 추가 점수가 필요 없겠지만,
    // matchCount가 2 미만일 때 substring match 시도
    if (matchCount < 2) {
      const substringMatches = roomTypeWords.filter(
        (rtWord) => rtWord.length > 0 && lowerScrapedName.includes(rtWord)
      );
      // substringMatches 길이에 비례해서 약간의 가산점 부여
      // substring 매치된 단어 수만큼 점수를 추가할 수 있음
      matchCount += substringMatches.length;
    }

    return {
      roomType: roomType.type.toLowerCase(),
      matchCount,
      matchWords: matchedWords,
    };
  });

  roomTypeScores.sort((a, b) => b.matchCount - a.matchCount);
  const bestMatch = roomTypeScores[0];

  // 매칭 점수가 높을수록 해당 룸타입 매칭
  // 여기선 기본적으로 matchCount가 1 이상이면 어느정도 유사도가 있다고 볼 수도 있으나
  // 기존 로직과의 일관성을 위해 2 이상일 때 확실히 매칭
  if (bestMatch.matchCount > 1) {
    logger.info(
      `Best match for "${scrapedRoomName}": "${bestMatch.roomType}" with ${
        bestMatch.matchCount
      } matched score (${bestMatch.matchWords.join(', ')})`
    );
    return bestMatch.roomType;
  }

  logger.warn(
    `No suitable match found for "${scrapedRoomName}". Using general default price.`
  );
  return null;
}

async function scrapeAgoda(hotelId, siteName) {
  let browser;
  let page;
  try {
    browser = await connectToChrome();
    page = await browser.newPage();
    logger.info(`New page opened for ${siteName} and hotelId: ${hotelId}`);

    // 호텔 설정 정보 로드
    const hotelSettings = await HotelSettings.findOne({ hotelId }).lean();
    if (!hotelSettings) {
      throw new Error(
        `hotelId: ${hotelId}에 해당하는 호텔 설정을 찾을 수 없습니다.`
      );
    }

    // 룸타입별 가격 매핑
    const roomTypePriceMap = {};
    hotelSettings.roomTypes.forEach((roomType) => {
      roomTypePriceMap[roomType.type.toLowerCase()] = roomType.price;
    });

    const generalDefaultPrice = 100000; // 기본 가격 10만원

    const today = moment();
    const formattedToday = today.format('DD-MM-YYYY');
    const endDate = moment().add(30, 'days').format('DD-MM-YYYY');

    await page.setCacheEnabled(false);
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    );
    await page.setViewport({ width: 2080, height: 1680 });

    const dashboardUrl = `https://ycs.agoda.com/mldc/ko-kr/app/reporting/dashboard/18989082`;
    try {
      await page.goto(dashboardUrl, {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });
      logger.info(
        `Navigated to dashboard page: ${siteName} for hotelId: ${hotelId}`
      );
    } catch (error) {
      logger.error('Failed to navigate to the dashboard page:', error.message);
      throw new Error('Failed to navigate to Agoda dashboard page');
    }

    const bookingUrl = `https://ycs.agoda.com/mldc/ko-kr/app/reporting/booking/18989082?startDate=${formattedToday}&endDate=${endDate}`;
    try {
      await page.goto(bookingUrl, {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });
      logger.info(
        `Navigated to reservation page: ${siteName} for hotelId: ${hotelId} with date range ${formattedToday} to ${endDate}`
      );
    } catch (error) {
      logger.error(
        'Failed to navigate to the reservation page:',
        error.message
      );
      throw new Error('Failed to navigate to Agoda reservation page');
    }

    await page.waitForSelector('#root');

    // 예약 정보 스크래핑
    const scrapedReservations = await page.$$eval(
      'table > tbody > tr',
      (rows) =>
        rows
          .map((row) => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 6) return null;

            const rawReservationNo = cells[0]?.innerText.trim() || '';
            const customerName = cells[1]?.innerText.trim() || '';
            let roomInfo = cells[3]?.innerText.trim() || '';
            const paymentMethod = cells[4]?.innerText.trim() || '';
            const reservationDate = cells[5]?.innerText.trim() || '';

            const checkInElement = row.querySelector(
              'td:nth-child(3) > div > p:nth-child(1)'
            );
            const checkOutElement = row.querySelector(
              'td:nth-child(3) > div > p:nth-child(2)'
            );

            const checkIn = checkInElement
              ? checkInElement.innerText.trim()
              : '';
            const checkOut = checkOutElement
              ? checkOutElement.innerText.trim()
              : '11:00';

            let reservationStatus = 'Confirmed';
            let reservationNo = rawReservationNo;

            if (rawReservationNo.includes('취소된 예약')) {
              reservationNo = rawReservationNo
                .replace('취소된 예약', '')
                .trim();
              reservationStatus = 'Canceled';
            } else if (rawReservationNo.includes('확정된 예약')) {
              reservationNo = rawReservationNo
                .replace('확정된 예약', '')
                .trim();
              reservationStatus = 'Confirmed';
            }

            // roomInfo 최대 50자로 제한
            if (roomInfo.length > 50) {
              roomInfo = roomInfo.substring(0, 50);
            }

            return {
              reservationStatus,
              reservationNo,
              customerName,
              roomInfo,
              checkIn,
              checkOut,
              paymentMethod,
              reservationDate: checkIn,
            };
          })
          .filter((reservation) => reservation !== null)
    );

    if (!scrapedReservations || scrapedReservations.length === 0) {
      logger.info(
        `No reservations found for ${siteName} for hotelId: ${hotelId} within the date range ${formattedToday} to ${endDate}. Data will not be sent to the server.`
      );
      return;
    }

    for (let i = 0; i < scrapedReservations.length; i++) {
      const reservation = scrapedReservations[i];
      const { roomInfo, reservationNo } = reservation;

      let matchedRoomType = null;
      let assignedPrice = generalDefaultPrice;

      try {
        if (!roomInfo || roomInfo.trim().length === 0) {
          // roomInfo 없음 → 기본가격 사용
          logger.warn(
            `Reservation No: ${reservationNo} - No roomInfo provided. Using default price: ${assignedPrice}`
          );
        } else {
          // 룸타입 매칭 시도
          matchedRoomType = findBestMatchingRoomType(
            roomInfo,
            hotelSettings.roomTypes
          );

          if (!matchedRoomType) {
            // 매칭 실패 → 기본가격
            logger.warn(
              `Reservation No: ${reservationNo} - No room type matched. Using default price: ${assignedPrice}`
            );
          } else {
            // 매칭된 룸타입 가격 확인
            if (
              roomTypePriceMap[matchedRoomType] !== undefined &&
              !isNaN(roomTypePriceMap[matchedRoomType]) &&
              roomTypePriceMap[matchedRoomType] > 0
            ) {
              assignedPrice = roomTypePriceMap[matchedRoomType];
              logger.info(
                `Reservation No: ${reservationNo} - Matched Room Type: "${matchedRoomType}", Assigned Price: ${assignedPrice}`
              );
            } else {
              // 매칭됐지만 가격 없음 → 기본가격
              logger.warn(
                `Reservation No: ${reservationNo} - Matched Room Type: "${matchedRoomType}", but no valid price found. Using default price: ${assignedPrice}`
              );
            }
          }
        }

        scrapedReservations[i] = {
          ...reservation,
          price: assignedPrice,
          matchedRoomType: matchedRoomType || null,
        };
      } catch (error) {
        logger.error(
          `Failed to process reservation ${reservationNo}, fallback to default price: ${assignedPrice}. Error:`,
          error.message
        );
        scrapedReservations[i] = {
          ...reservation,
          price: assignedPrice,
          matchedRoomType: null,
        };
      }
    }

    await sendReservations(hotelId, siteName, scrapedReservations);
    logger.info(
      `Agoda reservations successfully saved for hotelId ${hotelId}.`
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
    if (browser) {
      await browser.disconnect();
      logger.info(
        `Disconnected from browser for ${siteName} for hotelId: ${hotelId}.`
      );
    }
  }
}

export default scrapeAgoda;
