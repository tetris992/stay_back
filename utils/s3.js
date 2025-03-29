// backend/utils/s3.js
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export const uploadToS3 = async (file, hotelId, category, subCategory) => {
  const fileExtension = path.extname(file.originalname);
  const fileName = `${hotelId}/${category}/${subCategory}/${Date.now()}${fileExtension}`;
  
  const params = {
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: fileName,
    Body: file.buffer,
    ContentType: file.mimetype,
    ACL: 'public-read', // 공개 읽기 권한 설정
  };

  try {
    await s3Client.send(new PutObjectCommand(params));
    const photoUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
    return photoUrl;
  } catch (error) {
    throw new Error(`S3 업로드 실패: ${error.message}`);
  }
};