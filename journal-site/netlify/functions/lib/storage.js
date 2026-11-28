import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  endpoint: process.env.OCI_S3_ENDPOINT,
  region: process.env.OCI_S3_REGION,
  credentials: {
    accessKeyId: process.env.OCI_S3_ACCESS_KEY,
    secretAccessKey: process.env.OCI_S3_SECRET_KEY
  },
  forcePathStyle: true // Required for Oracle Object Storage
});

const BUCKET = process.env.OCI_S3_BUCKET;

export async function uploadFile(key, buffer, contentType = 'application/pdf') {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType
  }));
}

export async function downloadFile(key) {
  try {
    const { Body } = await s3.send(new GetObjectCommand({
      Bucket: BUCKET,
      Key: key
    }));
    return Buffer.from(await Body.transformToByteArray());
  } catch (error) {
    if (error.name === 'NoSuchKey') return null;
    throw error;
  }
}