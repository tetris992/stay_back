// src/config/defaultRoomTypes.js

export const defaultRoomTypes = [
  {
    roomInfo: 'standard', // 기존의 type → roomInfo로 변경
    nameKor: '스탠다드',
    nameEng: 'Standard',
    price: 80000,
    aliases: ['standard'],
    // roomNumbers 는 객체 { number, price } (필요 시 사용)
    roomNumbers: [],
    stock: 5,
  },
  {
    roomInfo: 'premium',
    nameKor: '프리미엄',
    nameEng: 'Premium',
    price: 90000,
    aliases: ['premium'],
    roomNumbers: [],
    stock: 5,
  },
  {
    roomInfo: 'executive',
    nameKor: '이그제큐티브',
    nameEng: 'Executive',
    price: 100000,
    aliases: ['executive'],
    roomNumbers: [],
    stock: 5,
  },
  {
    roomInfo: 'twin',
    nameKor: '트윈',
    nameEng: 'Twin',
    price: 110000,
    aliases: ['twin'],
    roomNumbers: [],
    stock: 5,
  },
  {
    roomInfo: 'pcroom',
    nameKor: 'PC룸',
    nameEng: 'PC Room',
    price: 110000,
    aliases: ['pcroom'],
    roomNumbers: [],
    stock: 5,
  },
  {
    roomInfo: 'styleroom',
    nameKor: '스타일러룸',
    nameEng: 'Styler Room',
    price: 90000,
    aliases: ['styleroom'],
    roomNumbers: [],
    stock: 5,
  },
  {
    roomInfo: 'hinokki',
    nameKor: '히노끼',
    nameEng: 'Hinokki',
    price: 150000,
    aliases: ['hinokki'],
    roomNumbers: [],
    stock: 5,
  },
];
