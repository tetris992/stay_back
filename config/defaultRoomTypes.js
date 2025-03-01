export const defaultRoomTypes = [
  {
    roomInfo: 'standard',
    nameKor: '스탠다드',
    nameEng: 'Standard',
    price: 80000,
    aliases: ['standard'],
    stock: 7,
    floorSettings: { 2: 7 }, // 2층에 7개
    startRoomNumbers: { 2: '201' }, // 201부터 시작
  },
  {
    roomInfo: 'premium',
    nameKor: '프리미엄',
    nameEng: 'Premium',
    price: 90000,
    aliases: ['premium'],
    stock: 7,
    floorSettings: { 3: 7 }, // 3층에 7개
    startRoomNumbers: { 3: '301' }, // 301부터 시작
  },
  {
    roomInfo: 'executive',
    nameKor: '이그제큐티브',
    nameEng: 'Executive',
    price: 100000,
    aliases: ['executive'],
    stock: 7,
    floorSettings: { 4: 7 }, // 4층에 7개
    startRoomNumbers: { 4: '401' }, // 401부터 시작
  },
  {
    roomInfo: 'twin',
    nameKor: '트윈',
    nameEng: 'Twin',
    price: 110000,
    aliases: ['twin'],
    stock: 7,
    floorSettings: { 5: 7 }, // 5층에 7개
    startRoomNumbers: { 5: '501' }, // 501부터 시작
  },
  {
    roomInfo: 'pcroom',
    nameKor: 'PC룸',
    nameEng: 'PC Room',
    price: 110000,
    aliases: ['pcroom'],
    stock: 7,
    floorSettings: { 6: 7 }, // 6층에 7개
    startRoomNumbers: { 6: '601' }, // 601부터 시작
  },
  {
    roomInfo: 'styleroom',
    nameKor: '스타일러룸',
    nameEng: 'Styler Room',
    price: 90000,
    aliases: ['styleroom'],
    stock: 7,
    floorSettings: { 7: 7 }, // 7층에 7개
    startRoomNumbers: { 7: '701' }, // 701부터 시작
  },
  {
    roomInfo: 'hinokki',
    nameKor: '히노끼',
    nameEng: 'Hinokki',
    price: 150000,
    aliases: ['hinokki'],
    stock: 7,
    floorSettings: { 8: 7 }, // 8층에 7개
    startRoomNumbers: { 8: '801' }, // 801부터 시작
  },
];