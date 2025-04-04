// backend/utils/s3.js
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

// 필수 환경 변수 검증
const requiredEnvVars = ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET_NAME'];
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
 */
export const uploadToS3 = async (file, hotelId, category, subCategory) => {
  try {
    // 파일 확장자 추출
    const fileExtension = path.extname(file.originalname);
    // UUID를 사용하여 고유한 파일 이름 생성 (충돌 방지)
    const fileName = `${hotelId}/${category}/${subCategory}/${uuidv4()}${fileExtension}`;

    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
      // ACL은 제거하고 버킷 정책으로 공개 읽기 권한 설정
    };

    // S3에 파일 업로드
    await s3Client.send(new PutObjectCommand(params));

    // 업로드된 파일의 URL 생성
    const photoUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
    return photoUrl;
  } catch (error) {
    // 에러 메시지 상세화
    const errorMessage = `S3 업로드 실패: ${error.message} (Code: ${error.code}, Bucket: ${process.env.AWS_S3_BUCKET_NAME}, File: ${file.originalname})`;
    throw new Error(errorMessage);
  }
};

// S3 클라이언트 내보내기 (다른 모듈에서 재사용 가능)
export { s3Client };