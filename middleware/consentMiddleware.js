// backend/middleware/consentMiddleware.js

import User from '../models/User.js';
import logger from '../utils/logger.js';

/**
 * 사용자가 개인정보에 동의했는지 확인하는 미들웨어
 */
const ensureConsent = async (req, res, next) => {
  const userId = req.user.id;
  const hotelId = req.user.hotelId;

  try {
    const user = await User.findOne({ _id: userId, hotelId });

    if (!user) {
      logger.warn(`User not found for hotelId: ${hotelId}`);
      return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    }

    if (!user.consentChecked) {
      logger.warn(`User ${userId} has not consented to privacy policy.`);
      return res.status(403).json({ message: '개인정보 동의가 필요합니다.' });
    }

    next();
  } catch (error) {
    logger.error('개인정보 동의 확인 중 오류 발생:', error);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
};

export default ensureConsent;
