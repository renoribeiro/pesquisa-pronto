import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

/**
 * Cliente de armazenamento S3-compatível (MinIO em dev, S3/MinIO em prod).
 * Usado para logos, imagens de capa, exports de relatórios.
 */
let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;
  client = new S3Client({
    endpoint: env.MINIO_ENDPOINT ?? "http://localhost:9000",
    region: "us-east-1",
    forcePathStyle: true, // necessário para MinIO
    credentials: {
      accessKeyId: env.MINIO_ACCESS_KEY ?? "minio",
      secretAccessKey: env.MINIO_SECRET_KEY ?? "minio_dev_pw",
    },
  });
  return client;
}

const BUCKET = env.MINIO_BUCKET ?? "pronto-assets";

export async function putObject(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType?: string,
): Promise<string> {
  await getClient().send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }),
  );
  return key;
}

/** URL assinada temporária para leitura de um objeto. */
export async function getObjectUrl(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(getClient(), new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn,
  });
}

/** URL pública direta (quando o bucket é público). */
export function publicUrl(key: string): string {
  const base = (env.MINIO_ENDPOINT ?? "http://localhost:9000").replace(/\/$/, "");
  return `${base}/${BUCKET}/${key}`;
}
