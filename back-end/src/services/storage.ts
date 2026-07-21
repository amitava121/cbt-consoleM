import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { extname } from "path";

const endpoint = process.env.S3_ENDPOINT || "http://localhost:8333";
const region = process.env.S3_REGION || "us-east-1";
const accessKeyId = process.env.S3_ACCESS_KEY || "admin";
const secretAccessKey = process.env.S3_SECRET_KEY || "admin123456";
const bucket = process.env.S3_BUCKET || "cbe-console";
const publicUrl = process.env.S3_PUBLIC_URL || endpoint;

export const s3Client = new S3Client({
  endpoint,
  region,
  forcePathStyle: true,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

/**
 * Upload a file buffer to S3-compatible storage (SeaweedFS).
 * Returns the public URL to access the file.
 */
export async function uploadFile(
  buffer: Buffer<ArrayBufferLike>,
  mimeType: string,
  folder: string,
  originalName?: string,
): Promise<string> {
  const ext = originalName ? extname(originalName) : "";
  const key = `${folder}/${randomUUID()}${ext}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }),
  );

  return `${publicUrl}/${bucket}/${key}`;
}

/**
 * Upload an image and return its URL.
 */
export async function uploadImage(
  buffer: Buffer<ArrayBufferLike>,
  folder: string,
  originalName?: string,
): Promise<string> {
  const ext = originalName ? extname(originalName).toLowerCase() : ".png";
  const mimeMap: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
  };
  const mimeType = mimeMap[ext] ?? "image/png";
  return uploadFile(buffer, mimeType, folder, originalName);
}
