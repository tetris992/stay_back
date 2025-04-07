import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import logger from './logger.js'; // 로깅 유틸리티 가져오기

// 필수 환경 변수 검증
const requiredEnvVars = [
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_S3_BUCKET_NAME',
];
requiredEnvVars.forEach((envVar) => {
  if (!process.env[envVar]) {
    throw new Error(`환경 변수 ${envVar}가 설정되지 않았습니다.`);
  }
});

// S3 클라이언트 생성 (단일 인스턴스)
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * S3에 파일 업로드
 * @param {Object} file - 업로드할 파일 객체 (multer에서 제공)
 * @param {string} hotelId - 호텔 ID
 * @param {string} category - 사진 카테고리 (room, exterior, facility)
 * @param {string} subCategory - 세부 카테고리 (예: 객실 타입 이름)
 * @returns {Promise<string>} - 업로드된 파일의 S3 URL
 * @throws {Error} - 업로드 실패 시 상세 에러 메시지
 */
export const uploadToS3 = async (file, hotelId, category, subCategory) => {
  try {
    // 파일 검증
    const MAX_FILE_SIZE = 3 * 1024 * 1024; // 5MB 제한
    const ALLOWED_FORMATS = ['image/jpeg', 'image/png', 'image/webp'];

    if (!file) {
      throw new Error('파일이 제공되지 않았습니다.');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`파일 크기가 ${MAX_FILE_SIZE / 1024 / 1024}MB를 초과했습니다.`);
    }
    if (!ALLOWED_FORMATS.includes(file.mimetype)) {
      throw new Error(`허용되지 않은 파일 형식입니다. 허용: ${ALLOWED_FORMATS.join(', ')}`);
    }

    // 파일 이름 생성
    const fileExtension = path.extname(file.originalname);
    const fileName = `${hotelId}/${category}/${subCategory}/${uuidv4()}${fileExtension}`;

    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    // S3에 파일 업로드
    await s3Client.send(new PutObjectCommand(params));

    // 업로드된 파일의 URL 생성
    const photoUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
    logger.info(`S3 업로드 성공: ${photoUrl}`, {
      hotelId,
      category,
      subCategory,
      fileSize: file.size,
    });

    return photoUrl;
  } catch (error) {
    const errorMessage = `S3 업로드 실패: ${error.message} (Bucket: ${process.env.AWS_S3_BUCKET_NAME}, File: ${file?.originalname || 'unknown'})`;
    logger.error(errorMessage, {
      stack: error.stack,
      hotelId,
      category,
      subCategory,
    });
    throw new Error(errorMessage);
  }
};

// S3 클라이언트 내보내기
export { s3Client };