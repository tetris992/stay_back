// backend/config/defaultAmenities.js

const DEFAULT_AMENITIES = [
  // On-Site Amenities
  { nameKor: '무료 Wi-Fi', nameEng: 'Free Wi-Fi', icon: 'FaWifi', type: 'on-site', isActive: false }, // 무료 WIFI
  { nameKor: '주차장', nameEng: 'Parking', icon: 'FaParking', type: 'on-site', isActive: false }, // 주차장
  { nameKor: '발레파킹 서비스', nameEng: 'Valet Parking', icon: 'FaCar', type: 'on-site', isActive: false }, // 발렛파킹 서비스
  { nameKor: '전기차 충전소', nameEng: 'EV Charging Station', icon: 'FaChargingStation', type: 'on-site', isActive: false }, // 전기차 충전소
  { nameKor: '실내 수영장', nameEng: 'Indoor Swimming Pool', icon: 'FaSwimmingPool', type: 'on-site', isActive: false }, // 실내 수영장
  { nameKor: '야외 수영장', nameEng: 'Outdoor Swimming Pool', icon: 'FaSwimmingPool', type: 'on-site', isActive: false }, // 야외 수영장
  { nameKor: '피트니스 센터', nameEng: 'Fitness Center', icon: 'FaDumbbell', type: 'on-site', isActive: false }, // 피트니스 센터
  { nameKor: '사우나', nameEng: 'Sauna', icon: 'FaSpa', type: 'on-site', isActive: false }, // 사우나
  { nameKor: '스파/마사지 서비스', nameEng: 'Spa/Massage Service', icon: 'FaSpa', type: 'on-site', isActive: false }, // 스파/마사지 서비스
  { nameKor: '온천탕', nameEng: 'Hot Spring Bath', icon: 'FaHotTub', type: 'on-site', isActive: false }, // 온천탕
  { nameKor: '노래방', nameEng: 'Karaoke', icon: 'FaMicrophone', type: 'on-site', isActive: false }, // 노래방
  { nameKor: '오락실', nameEng: 'Game Room', icon: 'FaGamepad', type: 'on-site', isActive: false }, // 오락실
  { nameKor: '골프 연습장', nameEng: 'Golf Practice Range', icon: 'FaGolfBall', type: 'on-site', isActive: false }, // 골프 연습장
  { nameKor: '키즈 클럽', nameEng: 'Kids Club', icon: 'FaChild', type: 'on-site', isActive: false }, // 키즈 클럽
  { nameKor: '비즈니스 센터', nameEng: 'Business Center', icon: 'FaBriefcase', type: 'on-site', isActive: false }, // 비즈니스 센터
  { nameKor: '회의실', nameEng: 'Meeting Room', icon: 'FaUsers', type: 'on-site', isActive: false }, // 회의실
  { nameKor: '연회장', nameEng: 'Banquet Hall', icon: 'FaGlassCheers', type: 'on-site', isActive: false }, // 연회장
  { nameKor: '공용 라운지', nameEng: 'Lounge Area', icon: 'FaCouch', type: 'on-site', isActive: false }, // 공용 라운지
  { nameKor: '공용 주방', nameEng: 'Shared Kitchen', icon: 'FaUtensils', type: 'on-site', isActive: false }, // 공용 주방
  { nameKor: '바비큐장', nameEng: 'BBQ Area', icon: 'FaFire', type: 'on-site', isActive: false }, // 바비큐
  { nameKor: '정원', nameEng: 'Garden', icon: 'FaTree', type: 'on-site', isActive: false }, // 정원
  { nameKor: '옥상 테라스', nameEng: 'Rooftop Terrace', icon: 'FaBuilding', type: 'on-site', isActive: false }, // 테라스
  { nameKor: '피크닉 공간', nameEng: 'Picnic Area', icon: 'FaTree', type: 'on-site', isActive: false }, // 피크닉 공간
  { nameKor: '자전거', nameEng: 'Bicycle', icon: 'FaBicycle', type: 'on-site', isActive: false }, // 자전거
  { nameKor: '레스토랑', nameEng: 'Restaurant', icon: 'FaUtensils', type: 'on-site', isActive: false }, // 레스토랑
  { nameKor: '커피숍', nameEng: 'Coffee Shop', icon: 'FaCoffee', type: 'on-site', isActive: false }, // 커피숍
  { nameKor: '바/라운지', nameEng: 'Bar/Lounge', icon: 'FaCocktail', type: 'on-site', isActive: false }, // 바/라운지
  { nameKor: '룸서비스', nameEng: 'Room Service', icon: 'FaConciergeBell', type: 'on-site', isActive: false }, // 룸서비스
  { nameKor: '자판기', nameEng: 'Vending Machine', icon: 'FaStore', type: 'on-site', isActive: false }, // 자판기
  { nameKor: '편의점', nameEng: 'Convenience Store', icon: 'FaStore', type: 'on-site', isActive: false }, // 편의점
  { nameKor: 'ATM', nameEng: 'ATM', icon: 'FaMoneyBillWave', type: 'on-site', isActive: false }, // ATM
  { nameKor: '세탁실', nameEng: 'Laundry Room', icon: 'FaTshirt', type: 'on-site', isActive: false }, // 세탁실
  { nameKor: '세탁/드라이클리닝 서비스', nameEng: 'Laundry/Dry Cleaning Service', icon: 'FaTshirt', type: 'on-site', isActive: false }, // 세탁/드라이클리닝 서비스
  { nameKor: '24시간 프런트 데스크', nameEng: '24-Hour Front Desk', icon: 'FaClock', type: 'on-site', isActive: false }, // 24시간 프론트 데스크
  { nameKor: '익스프레스 체크인/체크아웃', nameEng: 'Express Check-In/Check-Out', icon: 'FaMoneyCheck', type: 'on-site', isActive: false }, // 익스프레스 체크인/체크아웃
  { nameKor: '컨시어지 서비스', nameEng: 'Concierge Service', icon: 'FaConciergeBell', type: 'on-site', isActive: false }, // 컨시어지 서비스
  { nameKor: '수하물 보관 서비스', nameEng: 'Luggage Storage', icon: 'FaSuitcase', type: 'on-site', isActive: false }, // 수하물 보관 서비스
  { nameKor: '셔틀버스 서비스', nameEng: 'Shuttle Service', icon: 'FaBus', type: 'on-site', isActive: false }, // 셔틀버스 서비스
  { nameKor: '렌터카 서비스', nameEng: 'Car Rental Service', icon: 'FaCar', type: 'on-site', isActive: false }, // 렌터카 서비스
  { nameKor: '투어 데스크', nameEng: 'Tour Desk', icon: 'FaMap', type: 'on-site', isActive: false }, // 투어 데스크
  { nameKor: '환전 서비스', nameEng: 'Currency Exchange', icon: 'FaMoneyBillWave', type: 'on-site', isActive: false }, // 환전 서비스
  { nameKor: '흡연 구역', nameEng: 'Smoking Area', icon: 'FaSmoking', type: 'on-site', isActive: false }, // 흡연 구역
  { nameKor: '장애인 편의시설', nameEng: 'Accessibility Features', icon: 'FaWheelchair', type: 'on-site', isActive: false }, // 장애인 편의시설
  { nameKor: '반려동물 동반 가능', nameEng: 'Pet Friendly', icon: 'FaPaw', type: 'on-site', isActive: false }, // 반려동물 동반 가능

  // In-Room Amenities
  { nameKor: '넷플릭스', nameEng: 'Netflix', icon: 'FaFilm', type: 'in-room', isActive: false }, // 넷플릭스
  { nameKor: '스마트 TV', nameEng: 'Smart TV', icon: 'FaTv', type: 'in-room', isActive: false }, // 스마트 TV
  { nameKor: '게이밍 PC', nameEng: 'Gaming PC', icon: 'FaDesktop', type: 'in-room', isActive: false }, // 게이밍 PC
  { nameKor: '게임 콘솔', nameEng: 'Game Console', icon: 'FaGamepad', type: 'in-room', isActive: false }, // 게임 콘솔
  { nameKor: '안마의자', nameEng: 'Massage Chair', icon: 'FaChair', type: 'in-room', isActive: false }, // 안마의자
  { nameKor: '스타일러', nameEng: 'Styler', icon: 'FaTshirt', type: 'in-room', isActive: false }, // 스타일러
  { nameKor: '공기청정기', nameEng: 'Air Purifier', icon: 'FaWind', type: 'in-room', isActive: false }, // 공기청정기
  { nameKor: '에어컨', nameEng: 'Air Conditioning', icon: 'FaSnowflake', type: 'in-room', isActive: false }, // 에어컨
  { nameKor: '난방', nameEng: 'Heating', icon: 'FaFire', type: 'in-room', isActive: false }, // 난방
  { nameKor: '냉장고', nameEng: 'Refrigerator', icon: 'FaSnowflake', type: 'in-room', isActive: false }, // 냉장고
  { nameKor: '미니바', nameEng: 'Mini Bar', icon: 'FaGlassMartini', type: 'in-room', isActive: false }, // 미니바
  { nameKor: '전자레인지', nameEng: 'Microwave', icon: 'FaUtensils', type: 'in-room', isActive: false }, // 전자레인지
  { nameKor: '전기 주전자', nameEng: 'Electric Kettle', icon: 'FaCoffee', type: 'in-room', isActive: false }, // 전기 주전자
  { nameKor: '커피 메이커', nameEng: 'Coffee Maker', icon: 'FaCoffee', type: 'in-room', isActive: false }, // 커피 메이커
  { nameKor: '간이주방', nameEng: 'Kitchenette', icon: 'FaUtensils', type: 'in-room', isActive: false }, // 간이주방
  { nameKor: '객실 내 세탁기', nameEng: 'In-Room Washer', icon: 'FaTshirt', type: 'in-room', isActive: false }, // 객실 내 세탁기
  { nameKor: '금고', nameEng: 'Safe', icon: 'FaLock', type: 'in-room', isActive: false }, // 금고
  { nameKor: '헤어드라이어', nameEng: 'Hair Dryer', icon: 'FaWind', type: 'in-room', isActive: false }, // 헤어드라이어
  { nameKor: '다리미/다림판', nameEng: 'Iron/Ironing Board', icon: 'FaTshirt', type: 'in-room', isActive: false }, // 다리미/다림판
  { nameKor: '욕조', nameEng: 'Bathtub', icon: 'FaBath', type: 'in-room', isActive: false }, // 욕조
  { nameKor: '월풀 욕조', nameEng: 'Whirlpool Tub', icon: 'FaHotTub', type: 'in-room', isActive: false }, // 월풀 욕조
  { nameKor: '샤워 부스', nameEng: 'Shower', icon: 'FaShower', type: 'in-room', isActive: false }, // 샤워 부스
  { nameKor: '비데', nameEng: 'Bidet', icon: 'FaToilet', type: 'in-room', isActive: false }, // 비데
  { nameKor: '무료 세면용품', nameEng: 'Free Toiletries', icon: 'FaSoap', type: 'in-room', isActive: false }, // 무료 세면용품 (객실지 충소)
  { nameKor: '전용 욕실', nameEng: 'Private Bathroom', icon: 'FaBath', type: 'in-room', isActive: false }, // 전용 욕실
  { nameKor: '발코니', nameEng: 'Balcony', icon: 'FaUmbrellaBeach', type: 'in-room', isActive: false }, // 발코니
  { nameKor: '방음 시설', nameEng: 'Soundproofing', icon: 'FaVolumeMute', type: 'in-room', isActive: false }, // 방음 시설
  { nameKor: '커넥팅 룸', nameEng: 'Connecting Room', icon: 'FaDoorOpen', type: 'in-room', isActive: false }, // 커넥팅 룸
  { nameKor: '금연 객실', nameEng: 'Non-Smoking Room', icon: 'FaBan', type: 'in-room', isActive: false }, // 금연 객실
  { nameKor: '장애인용 객실', nameEng: 'Accessible Room', icon: 'FaWheelchair', type: 'in-room', isActive: false }, // 장애인용 객실
];

export default DEFAULT_AMENITIES;