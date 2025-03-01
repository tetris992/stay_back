// 중복검사.js (개선 완료)

export const 중복검사 = (draggedReservation, targetRoomNumber, allReservations) => {
    const draggedCheckIn = new Date(draggedReservation.checkIn);
    const draggedCheckOut = new Date(draggedReservation.checkOut);
  
    // 동일 객실번호, 자신 제외
    const sameRoomReservations = allReservations.filter(reservation => 
      reservation.roomNumber === targetRoomNumber &&
      reservation._id !== draggedReservation._id &&
      !reservation.isCancelled
    );
  
    // 기간 겹침 확인 (단 하루라도 겹치는지)
    const conflictingReservation = sameRoomReservations.find(reservation => {
      const existingCheckIn = new Date(reservation.checkIn);
      const existingCheckOut = new Date(reservation.checkOut);
  
      return draggedCheckIn < existingCheckOut && draggedCheckOut > existingCheckIn;
    });
  
    return conflictingReservation
      ? { isConflict: true, conflictingReservation }
      : { isConflict: false };
  };
  