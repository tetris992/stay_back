// backend/middleware/consentMiddleware.js
import User from '../models/User.js';
import Customer from '../models/Customer.js';
import logger from '../utils/logger.js';

/**
 * 호텔 관리자와 고객 모두에 대해 개인정보 동의 여부를 검사하는 미들웨어.
 * 호텔 관리자(req.user)가 존재하면 User 모델을 통해, 고객(req.customer)이 존재하면 Customer 모델을 통해 검사합니다.
 */
const ensureConsent = async (req, res, next) => {
  // 호텔 관리자인 경우
  if (req.user) {
    const { id: userId, hotelId } = req.user;
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
      return next();
    } catch (error) {
      logger.error('개인정보 동의 확인 중 오류 발생:', error);
      return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
  }
  // 고객인 경우
  if (req.customer) {
    try {
      // 고객에게 동의 검사를 적용하고 싶다면 아래 코드를 사용합니다.
      if (!req.customer.consentChecked) {
        logger.warn(`Customer ${req.customer._id} has not consented to privacy policy.`);
        return res.status(403).json({ message: '고객 개인정보 동의가 필요합니다.' });
      }
      return next();
    } catch (error) {
      logger.error('고객 개인정보 동의 확인 중 오류 발생:', error);
      return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
  }
  // 둘 다 없는 경우 (인증이 제대로 되지 않은 경우)
  return res.status(401).json({ message: '인증 정보가 없습니다.' });
};

export default ensureConsent;

/**
 * 고객 전용 동의 검사 미들웨어.
 * 고객 토큰(req.customer)에 대해서만 동의 여부를 검사합니다.
 */
export const ensureConsentForCustomer = async (req, res, next) => {
  if (req.customer) {
    const customerId = req.customer.id;
    try {
      const customer = await Customer.findById(customerId);
      if (!customer) {
        logger.warn(`Customer not found for id: ${customerId}`);
        return res.status(404).json({ message: '고객을 찾을 수 없습니다.' });
      }
      if (!customer.consentChecked) {
        logger.warn(`Customer ${customerId} has not consented to privacy policy.`);
        return res.status(403).json({ message: '고객 개인정보 동의가 필요합니다.' });
      }
      return next();
    } catch (error) {
      logger.error('고객 동의 확인 중 오류 발생:', error);
      return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
  }
  return res.status(401).json({ message: '고객 인증 정보가 없습니다.' });
};
