import { S3Client } from "@aws-sdk/client-s3";

export function createS3Client(region: string): S3Client {
  const endpoint = process.env.AWS_S3_ENDPOINT?.trim();
  const forcePathStyle = process.env.AWS_S3_FORCE_PATH_STYLE === "true";
  return new S3Client({
    region,
    ...(endpoint ? { endpoint } : {}),
    ...(forcePathStyle ? { forcePathStyle: true } : {}),
  });
}
