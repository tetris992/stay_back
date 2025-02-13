// backend/controllers/reservationsController.js

import getReservationModel from '../models/Reservation.js';
import getCanceledReservationModel from '../models/CanceledReservation.js';
import logger from '../utils/logger.js';
import initializeHotelCollection from '../utils/initializeHotelCollection.js';
import availableOTAs from '../config/otas.js';
import { parseDate } from '../utils/dateParser.js';
import { isCancelledStatus } from '../utils/isCancelledStatus.js';
import { format } from 'date-fns';

// [추가된 부분: 호텔 설정 모델과 알림톡 전송 모듈 추가]
import HotelSettingsModel from '../models/HotelSettings.js';
// import { sendReservationConfirmation } from '../utils/sendAlimtalk.js';

// 전화번호에서 숫자만 추출하는 헬퍼 함수
function sanitizePhoneNumber(phoneNumber) {
  if (!phoneNumber) return '';
  // 숫자만 추출하는 정규식
  return phoneNumber.replace(/\D/g, '');
}

function parsePrice(priceString) {
  if (priceString == null) return 0; // null 혹은 undefined 처리

  // priceString이 숫자일 경우 바로 반환
  if (typeof priceString === 'number') {
    return priceString;
  }

  // 여기서부터는 priceString이 문자열이라고 가정
  const str = String(priceString);
  const match = str.match(/\d[\d,]*/);
  if (!match) return 0;
  return parseInt(match[0].replace(/,/g, ''), 10) || 0;
}

/**
 * 호텔 설정의 객실 컨테이너 목록을 바탕으로, updateData(예약 정보)의
 * checkIn, checkOut 날짜와 겹치지 않는 사용 가능한 객실번호(roomNumber)를
 * 자동으로 할당하는 함수.
 *
 * @param {Object} updateData - 예약 업데이트 데이터 (checkIn, checkOut, roomInfo 등 포함)
 * @param {String} finalHotelId - 호텔 ID
 * @param {Object} Reservation - 해당 호텔의 Reservation 모델
 * @returns {String} - 사용 가능한 객실번호 (없으면 빈 문자열)
 */
async function assignRoomNumber(updateData, finalHotelId, Reservation) {
  // 이미 roomNumber가 있다면 그대로 사용
  if (updateData.roomNumber && updateData.roomNumber.trim() !== '') {
    return updateData.roomNumber;
  }
  // 호텔 설정에서 객실 레이아웃(컨테이너) 조회
  const hotelSettings = await HotelSettingsModel.findOne({
    hotelId: finalHotelId,
  });
  if (
    !hotelSettings ||
    !hotelSettings.gridSettings ||
    !hotelSettings.gridSettings.containers
  ) {
    logger.warn('Hotel settings or gridSettings.containers not found.');
    return '';
  }
  const containers = hotelSettings.gridSettings.containers;
  // 해당 예약의 roomInfo(객실타입)와 일치하는 컨테이너 필터링 (대소문자 무시)
  const matchedContainers = containers.filter(
    (c) =>
      c.roomInfo &&
      c.roomInfo.toLowerCase() === updateData.roomInfo.toLowerCase()
  );
  if (!matchedContainers.length) {
    logger.warn(`No container found for roomInfo: ${updateData.roomInfo}`);
    return '';
  }
  // roomNumber 기준 오름차순 정렬 (숫자 변환 가능하면 숫자 비교)
  matchedContainers.sort((a, b) => {
    const aNum = parseInt(a.roomNumber, 10);
    const bNum = parseInt(b.roomNumber, 10);
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return aNum - bNum;
    }
    return a.roomNumber.localeCompare(b.roomNumber);
  });
  // 각 컨테이너에 대해 예약 날짜가 겹치는 기존 예약이 없는지 확인
  for (const container of matchedContainers) {
    const overlappingReservations = await Reservation.find({
      roomInfo: updateData.roomInfo,
      roomNumber: container.roomNumber,
      isCancelled: false,
      // 날짜 겹침 조건:
      // 새로운 예약의 checkIn < 기존 예약의 checkOut &&
      // 새로운 예약의 checkOut > 기존 예약의 checkIn
      $or: [
        {
          checkIn: { $lt: updateData.checkOut },
          checkOut: { $gt: updateData.checkIn },
        },
      ],
    });
    if (overlappingReservations.length === 0) {
      return container.roomNumber;
    }
  }
  // 만약 사용 가능한 객실번호가 없다면 재고 부족 로그 출력
  logger.warn(
    `재고 부족: ${updateData.roomInfo} 타입의 객실이 ${format(
      updateData.checkIn,
      "yyyy-MM-dd'T'HH:mm"
    )} ~ ${format(
      updateData.checkOut,
      "yyyy-MM-dd'T'HH:mm"
    )} 사이에 모두 예약되었습니다.`
  );
  return '';
}

// 모든 정상 예약 목록 가져오기
export const getReservations = async (req, res) => {
  const { name, hotelId } = req.query;

  if (!hotelId) {
    return res.status(400).send({ message: 'hotelId is required' });
  }

  const Reservation = getReservationModel(hotelId);
  const filter = {};

  if (name) {
    filter.customerName = { $regex: new RegExp(`^${name}$`, 'i') };
  }

  // 취소되지 않은 예약만 필터: isCancelled: false
  filter.isCancelled = false;

  const sort = { createdAt: -1 };
  try {
    const reservations = await Reservation.find(filter).sort(sort);
    const plain = reservations.map((doc) => {
      const obj = doc.toObject();
      obj.checkIn = format(obj.checkIn, "yyyy-MM-dd'T'HH:mm");
      obj.checkOut = format(obj.checkOut, "yyyy-MM-dd'T'HH:mm");
      obj.reservationDate = format(obj.reservationDate, "yyyy-MM-dd'T'HH:mm");
      return obj;
    });
    res.send(plain);
  } catch (error) {
    logger.error('Error fetching reservations:', error);
    res.status(500).send({ message: '서버 오류가 발생했습니다.' });
  }
};

// 예약 생성 또는 업데이트
export const createOrUpdateReservations = async (req, res) => {
  const { siteName, reservations, hotelId } = req.body;
  const finalHotelId = hotelId || req.user.hotelId;

  if (!siteName || !reservations || !finalHotelId) {
    return res.status(400).send({
      message: 'siteName, reservations, hotelId 필드는 필수입니다.',
    });
  }

  try {
    await initializeHotelCollection(finalHotelId);
    const Reservation = getReservationModel(finalHotelId);
    const CanceledReservation = getCanceledReservationModel(finalHotelId);
    const createdReservationIds = [];

    for (const reservation of reservations) {
      if (!reservation.reservationNo || reservation.reservationNo === 'N/A') {
        logger.warn(
          'Skipping reservation with invalid reservation number',
          reservation
        );
        continue;
      }

      const reservationId = `${siteName}-${reservation.reservationNo}`;
      let checkOutDate = reservation.checkOut;
      if (!/\d{2}:\d{2}/.test(checkOutDate)) {
        checkOutDate += ' 11:00';
      }
      const checkIn = parseDate(reservation.checkIn);
      const checkOut = parseDate(checkOutDate);
      if (!checkIn || !checkOut || checkIn >= checkOut) {
        logger.warn('Skipping reservation with invalid dates', reservation);
        continue;
      }

      let paymentMethod = '정보 없음';
      if (availableOTAs.includes(siteName)) {
        paymentMethod =
          reservation.paymentMethod && reservation.paymentMethod.trim() !== ''
            ? reservation.paymentMethod.trim()
            : 'OTA';
      } else if (siteName === '현장예약') {
        paymentMethod = reservation.paymentMethod || 'Pending';
      } else {
        paymentMethod = reservation.paymentMethod || 'Pending';
      }

      const sanitizedPhoneNumber = sanitizePhoneNumber(
        reservation.phoneNumber || ''
      );
      const parsedReservationDate =
        parseDate(reservation.reservationDate) || new Date();

      const updateData = {
        siteName,
        customerName: reservation.customerName,
        phoneNumber: sanitizedPhoneNumber,
        roomInfo: reservation.roomInfo,
        checkIn,
        checkOut,
        reservationDate: parsedReservationDate,
        reservationStatus: reservation.reservationStatus || 'Pending',
        price: parsePrice(reservation.price),
        specialRequests: reservation.specialRequests || null,
        additionalFees: reservation.additionalFees || 0,
        couponInfo: reservation.couponInfo || null,
        paymentStatus: reservation.paymentStatus || '확인 필요',
        paymentMethod,
        hotelId: finalHotelId,
      };

      // 기존에 roomNumber가 있다면 그대로 사용, 없으면 자동 할당
      const existingReservation = await Reservation.findById(reservationId);
      if (existingReservation) {
        if (!updateData.roomNumber || updateData.roomNumber.trim() === '') {
          updateData.roomNumber = existingReservation.roomNumber || '';
        }
        // manualAssignment 관련 코드는 제거합니다.
        await Reservation.updateOne(
          { _id: reservationId },
          { $set: updateData },
          { runValidators: true }
        );
        logger.info(`Updated reservation: ${reservationId}`);
      } else {
        if (!reservation.roomNumber || reservation.roomNumber.trim() === '') {
          updateData.roomNumber = await assignRoomNumber(
            updateData,
            finalHotelId,
            Reservation
          );
        } else {
          updateData.roomNumber = reservation.roomNumber;
        }
        const newReservation = new Reservation({
          _id: reservationId,
          ...updateData,
        });
        await newReservation.save();
        logger.info(`Created new reservation: ${reservationId}`);
        createdReservationIds.push(reservationId);
      }
    }
    res.status(201).json({
      message: 'Reservations processed successfully',
      createdReservationIds,
    });
  } catch (error) {
    logger.error('Error processing reservations:', error);
    res.status(500).send({ message: '서버 오류가 발생했습니다.' });
  }
};

// 예약 삭제 컨트롤러
export const deleteReservation = async (req, res) => {
  const { reservationId } = req.params; // URL 파라미터로부터 reservationId 추출
  const { hotelId, siteName } = req.query; // 쿼리 파라미터로부터 hotelId와 siteName 추출

  // 필수 파라미터 검증
  if (!reservationId || !hotelId || !siteName) {
    return res
      .status(400)
      .send({ message: 'reservationId, hotelId, siteName는 필수입니다.' });
  }

  try {
    // 해당 호텔의 예약 컬렉션 가져오기
    const Reservation = getReservationModel(hotelId);

    // 예약 삭제: reservationId, hotelId, siteName으로 예약 찾기
    const reservation = await Reservation.findOneAndDelete({
      _id: reservationId,
      hotelId,
      siteName,
    });

    // 예약이 존재하지 않을 경우 404 응답
    if (!reservation) {
      return res.status(404).send({ message: '해당 예약을 찾을 수 없습니다.' });
    }

    // 성공적으로 삭제되었을 경우 204 No Content 응답
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting reservation:', error);
    res.status(500).send({ message: '서버 오류가 발생했습니다.' });
  }
};

// 예약 확정 컨트롤러
export const confirmReservation = async (req, res) => {
  const { reservationId } = req.params;
  const { hotelId } = req.body;

  console.log(`Received reservationId: ${reservationId}, hotelId: ${hotelId}`);

  if (!reservationId || !hotelId) {
    return res
      .status(400)
      .send({ message: 'reservationId와 hotelId는 필수입니다.' });
  }

  try {
    const Reservation = getReservationModel(hotelId); // 동적 컬렉션 가져오기
    const reservation = await Reservation.findOne({
      _id: reservationId,
      hotelId,
    });

    if (!reservation) {
      return res.status(404).send({ message: '예약을 찾을 수 없습니다.' });
    }

    if (reservation.reservationStatus === 'confirmed') {
      return res.status(400).send({ message: '이미 확정된 예약입니다.' });
    }

    // 예약 상태를 'confirmed'로 변경
    reservation.reservationStatus = 'confirmed';
    await reservation.save();

    res
      .status(200)
      .send({ message: '예약이 성공적으로 확정되었습니다.', reservation });
  } catch (error) {
    logger.error('Error confirming reservation:', error);
    res.status(500).send({ message: '서버 오류가 발생했습니다.' });
  }
};

// 예약 수정 컨트롤러
export const updateReservation = async (req, res) => {
  const { reservationId } = req.params;
  const { hotelId, ...updateData } = req.body;

  // 요청 데이터 전체 로그
  console.log('[updateReservation] req.body:', req.body);
  // 분리된 업데이트 데이터 로그
  console.log('[updateReservation] updateData:', updateData);

  if (!hotelId) {
    return res.status(400).send({ message: 'hotelId는 필수입니다.' });
  }

  try {
    const Reservation = getReservationModel(hotelId);
    const reservation = await Reservation.findOne({
      _id: reservationId,
      hotelId,
    });

    if (reservation) {
      // 예) 전화번호, 가격, 날짜 변환 로직 처리
      if (updateData.phoneNumber) {
        updateData.phoneNumber = sanitizePhoneNumber(updateData.phoneNumber);
      }
      if (updateData.price) {
        updateData.price = parsePrice(updateData.price);
      }
      if (updateData.checkIn) {
        updateData.checkIn = parseDate(updateData.checkIn);
      }
      if (updateData.checkOut) {
        updateData.checkOut = parseDate(updateData.checkOut);
      }
      if (updateData.reservationDate) {
        updateData.reservationDate = parseDate(updateData.reservationDate);
      }

      // 업데이트 전 예약 객체 상태
      console.log('[updateReservation] Before updating, reservation:', reservation);

      Object.keys(updateData).forEach((key) => {
        reservation[key] = updateData[key];
      });

      // 특히 roomNumber가 제대로 설정되었는지 확인
      console.log('[updateReservation] After updating fields, roomNumber:', reservation.roomNumber);

      // 결제방법 관련 로직 (생략)
      await reservation.save();
      console.log('[updateReservation] After save, reservation:', reservation);

      logger.info(`Updated reservation: ${reservationId}`);
      res.send(reservation);
    } else {
      res
        .status(404)
        .send({ message: '해당 ID와 hotelId를 가진 예약을 찾을 수 없습니다.' });
    }
  } catch (error) {
    logger.error('Error updating reservation:', error);
    res.status(500).send({ message: '서버 오류가 발생했습니다.' });
  }
};


// 취소된 예약 목록 가져오기
export const getCanceledReservations = async (req, res) => {
  const { hotelId } = req.query;

  if (!hotelId) {
    return res.status(400).send({ message: 'hotelId는 필수입니다.' });
  }

  const CanceledReservation = getCanceledReservationModel(hotelId);

  try {
    // 취소된 예약 전용 콜렉션에서 직접 찾는다.
    const canceledReservations = await CanceledReservation.find();

    // canceledReservations가 제대로 조회되는지 콘솔 확인
    console.log('Fetched canceled reservations:', canceledReservations);

    res.status(200).send(canceledReservations);
  } catch (error) {
    logger.error('취소된 예약 가져오는 중 오류 발생:', error);
    res.status(500).send({ message: '서버 오류가 발생했습니다.' });
  }
};
