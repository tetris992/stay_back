//backend/utils/dateParser.js

import { parse, isValid } from 'date-fns';
import { ko, enUS } from 'date-fns/locale';

// 캐싱을 위한 객체
const parsedDateCache = {};

// 전처리 함수
const cleanString = (str) => {
  return str
    .replace(/\([^)]*\)/g, '') // 괄호 안의 내용 제거
    .replace(/[-]+$/g, '') // 문자열 끝의 하이픈 제거
    .replace(/\s+/g, ' ') // 연속된 공백을 단일 공백으로 대체
    .replace(/\n/g, ' ') // 줄바꿈 문자 제거
    .replace(/미리예약/g, '') // 불필요한 텍스트 제거
    .trim(); // 앞뒤 공백 제거
};

export const parseDate = (dateString) => {
  // 캐시에 있는 경우 반환
  if (parsedDateCache[dateString] !== undefined) {
    return parsedDateCache[dateString];
  }

  // 전처리
  let cleanedDateString = cleanString(dateString);

  // 개발 모드에서만 전처리된 문자열 로그 출력
  if (process.env.NODE_ENV === 'development') {
    console.log(
      `Cleaned Date String: "${cleanedDateString}" [length: ${cleanedDateString.length}]`
    );
  }

  const dateFormats = [
    // 한국어 날짜 형식
    "yyyy-MM-dd'T'HH:mm",
    "yyyy-MM-dd'T'HH:mm:ss",
    'yyyy년 M월 d일 HH:mm',
    'yyyy년 MM월 dd일 HH:mm',
    'yyyy년 M월 d일',
    'yyyy년 MM월 dd일',
    'yyyy.MM.dd HH:mm',
    'yyyy.MM.dd',
    'yyyy.MM.dd HH:mm:ss',
    // 영어 날짜 형식
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
    // ISO 형식
    "yyyy-MM-dd'T'HH:mm:ss.SSSxxx",
    // 기타 형식
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

  // 여러 로케일에 대해 시도
  for (let locale of locales) {
    for (let formatString of dateFormats) {
      const parsed = parse(cleanedDateString, formatString, new Date(), {
        locale,
      });
      if (isValid(parsed)) {
        parsedDate = parsed;
        parsedDateCache[dateString] = parsedDate; // 캐시에 저장
        return parsedDate;
      }
    }
  }

  // 파싱에 실패한 경우만 로그 출력
  if (process.env.NODE_ENV === 'development') {
    console.error(`Failed to parse date: "${dateString}"`);
  }
  parsedDateCache[dateString] = null;
  return null;
};
