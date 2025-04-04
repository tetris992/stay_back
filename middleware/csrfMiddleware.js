// backend/middleware/csrfMiddleware.js
import { randomBytes } from 'crypto'; // crypto 모듈을 상단에서 import
import logger from '../utils/logger.js';

// CSRF 토큰 저장소 (메모리 사용 – 실제 운영에서는 Redis 등 외부 저장소 사용 권장)
const csrfTokens = new Map();

/**
 * CSRF 토큰 생성 함수
 * @returns {Object} { tokenId, csrfToken }
 */
export const generateCsrfToken = () => {
  const csrfToken = randomBytes(32).toString('hex');
  const tokenId = randomBytes(16).toString('hex');
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24시간 유효
  csrfTokens.set(tokenId, { token: csrfToken, expiresAt });
  return { tokenId, csrfToken };
};

/**
 * CSRF 검증 미들웨어
 * GET, HEAD, OPTIONS 요청은 검증하지 않음.
 */
export const verifyCsrfToken = async (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const tokenId = req.headers['x-csrf-token-id'];
  const csrfToken = req.headers['x-csrf-token'];

  if (!tokenId || !csrfToken) {
    logger.warn('CSRF token missing in request', {
      method: req.method,
      url: req.url,
      headers: req.headers,
    });
    return res.status(403).json({ message: 'CSRF token missing' });
  }

  try {
    const storedData = csrfTokens.get(tokenId);
    if (!storedData) {
      logger.warn('CSRF token not found', {
        tokenId,
        providedToken: csrfToken,
        method: req.method,
        url: req.url,
      });
      return res.status(403).json({ message: 'Invalid or expired CSRF token' });
    }

    const { token, expiresAt } = storedData;
    if (token !== csrfToken || expiresAt < Date.now()) {
      logger.warn('Invalid or expired CSRF token', {
        tokenId,
        providedToken: csrfToken,
        method: req.method,
        url: req.url,
      });
      return res.status(403).json({ message: 'Invalid or expired CSRF token' });
    }

    next();
  } catch (error) {
    logger.error(`CSRF token verification failed: ${error.message}`, {
      stack: error.stack,
      headers: req.headers,
      ip: req.ip,
    });
    res.status(500).json({ message: 'Failed to verify CSRF token', error: error.message });
  }
};