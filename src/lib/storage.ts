import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

/**
 * Cliente de armazenamento S3-compatível (MinIO em dev, S3/MinIO em prod).
 * Usado para logos, imagens de capa, exports de relatórios.
 */
let client: S3Client | null = null;

/**
 * Em desenvolvimento permitimos o endpoint local padrão do docker-compose,
 * mas NUNCA embutimos credenciais no código — devem vir do ambiente (.env).
 * Em produção, env.ts já exige MINIO_ENDPOINT/ACCESS_KEY/SECRET_KEY no boot.
 */
const DEV_ENDPOINT = "http://localhost:9000";

function getClient(): S3Client {
  if (client) return client;
  const endpoint = env.MINIO_ENDPOINT ?? DEV_ENDPOINT;
  const accessKeyId = env.MINIO_ACCESS_KEY;
  const secretAccessKey = env.MINIO_SECRET_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "Credenciais de armazenamento ausentes: defina MINIO_ACCESS_KEY e MINIO_SECRET_KEY no ambiente.",
    );
  }
  client = new S3Client({
    endpoint,
    region: "us-east-1",
    forcePathStyle: true, // necessário para MinIO
    credentials: { accessKeyId, secretAccessKey },
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
  const base = (env.MINIO_ENDPOINT ?? DEV_ENDPOINT).replace(/\/$/, "");
  return `${base}/${BUCKET}/${key}`;
}
