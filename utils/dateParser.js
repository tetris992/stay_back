import { parse, isValid, format } from 'date-fns';
import { ko, enUS } from 'date-fns/locale';
import HotelSettingsModel from '../models/HotelSettings.js'; // 호텔 설정 모델 추가

const parsedDateCache = {};

const cleanString = (str) => {
  return str
    .replace(/\([^)]*\)/g, '')
    .replace(/[-]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/미리예약/g, '')
    .trim();
};

/**
 * 호텔 설정에서 체크인/체크아웃 시간을 가져오는 헬퍼 함수
 * @param {string} hotelId - 호텔 ID
 * @param {string} type - 'checkIn' 또는 'checkOut'
 * @returns {string} - HH:mm 형식의 시간 문자열
 */
const getHotelDefaultTime = async (hotelId, type) => {
  const defaultTimes = {
    checkIn: '16:00', // 기본 체크인 시간
    checkOut: '11:00', // 기본 체크아웃 시간
  };
  try {
    const hotelSettings = await HotelSettingsModel.findOne({ hotelId });
    if (type === 'checkIn') {
      return hotelSettings?.checkInTime || defaultTimes.checkIn;
    } else if (type === 'checkOut') {
      return hotelSettings?.checkOutTime || defaultTimes.checkOut;
    }
    return defaultTimes[type] || '00:00';
  } catch (error) {
    console.error(`Failed to fetch hotel settings for ${hotelId}:`, error);
    return defaultTimes[type] || '00:00';
  }
};

/**
 * 날짜 문자열을 파싱하여 KST ISO 8601 문자열로 반환
 * @param {string} dateString - 파싱할 날짜 문자열
 * @param {string} [hotelId] - 호텔 ID (선택적, 시간 기본값 조회용)
 * @param {boolean} [isCheckIn=true] - 체크인인지 체크아웃인지 여부
 * @returns {string|null} - "yyyy-MM-dd'T'HH:mm:ss+09:00" 형식의 문자열 또는 null
 */
export const parseDate = async (dateString, hotelId = null, isCheckIn = true) => {
  if (!dateString) return null;

  if (parsedDateCache[dateString] !== undefined) {
    return parsedDateCache[dateString];
  }

  let cleanedDateString = cleanString(dateString);

  if (process.env.NODE_ENV === 'development') {
    console.log(`Cleaned Date String: "${cleanedDateString}" [length: ${cleanedDateString.length}]`);
  }

  const dateFormats = [
    "yyyy-MM-dd'T'HH:mm:ss.SSS",
    "yyyy-MM-dd'T'HH:mm:ss",
    "yyyy-MM-dd'T'HH:mm",
    'yyyy년 M월 d일 HH:mm',
    'yyyy년 MM월 dd일 HH:mm',
    'yyyy년 M월 d일',
    'yyyy년 MM월 dd일',
    'yyyy.MM.dd HH:mm',
    'yyyy.MM.dd',
    'yyyy.MM.dd HH:mm:ss',
    'dd MMM yyyy HH:mm',
    'dd MMM yyyy',
    'MMM dd, yyyy HH:mm',
    'MMM dd, yyyy',
    'MMM dd yyyy',
    'MMMM dd, yyyy',
    'd MMM yyyy',
    'd MMM yyyy HH:mm',
    'd MMM yyyy HH:mm:ss',
    'MMM d, yyyy',
    'MMM d, yyyy HH:mm',
    'yyyy-MM-dd HH:mm',
    'yyyy-MM-dd HH:mm:ss',
    'yyyy-MM-dd',
    'yyyy/MM/dd HH:mm',
    'yyyy/MM/dd HH:mm:ss',
    'yyyy/MM/dd',
    'dd-MM-yyyy HH:mm',
    'dd-MM-yyyy',
    'dd.MM.yyyy HH:mm',
    'dd.MM.yyyy',
    'dd/MM/yyyy HH:mm',
    'dd/MM/yyyy',
  ];

  const locales = [ko, enUS];

  let parsedDate = null;
  for (let locale of locales) {
    for (let formatString of dateFormats) {
      const parsed = parse(cleanedDateString, formatString, new Date(), { locale });
      if (isValid(parsed)) {
        const hasTime = formatString.includes('HH') || formatString.includes('mm');
        let timeString;
        if (!hasTime && hotelId) {
          // 시간이 없는 경우 호텔 설정에서 가져옴
          timeString = await getHotelDefaultTime(hotelId, isCheckIn ? 'checkIn' : 'checkOut');
        } else {
          timeString = hasTime ? format(parsed, 'HH:mm:ss') : '00:00:00';
        }
        const resultString = `${format(parsed, 'yyyy-MM-dd')}T${timeString}+09:00`;
        parsedDateCache[dateString] = resultString;
        if (process.env.NODE_ENV === 'development') {
          console.log(`Parsed Date: ${resultString}`);
        }
        return resultString;
      }
    }
  }

  // 직접 파싱 시도
  try {
    const directParsed = new Date(cleanedDateString);
    if (isValid(directParsed)) {
      const hasTime = cleanedDateString.match(/\d{2}:\d{2}/);
      let timeString;
      if (!hasTime && hotelId) {
        timeString = await getHotelDefaultTime(hotelId, isCheckIn ? 'checkIn' : 'checkOut');
      } else {
        timeString = hasTime ? format(directParsed, 'HH:mm:ss') : '00:00:00';
      }
      const resultString = `${format(directParsed, 'yyyy-MM-dd')}T${timeString}+09:00`;
      parsedDateCache[dateString] = resultString;
      if (process.env.NODE_ENV === 'development') {
        console.log(`Direct Parsed Date: ${resultString}`);
      }
      return resultString;
    }
  } catch (error) {
    console.error(`Failed to directly parse date: "${dateString}"`, error);
  }

  if (process.env.NODE_ENV === 'development') {
    console.error(`Failed to parse date: "${dateString}"`);
  }
  parsedDateCache[dateString] = null;
  return null;
};