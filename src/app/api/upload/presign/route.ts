import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getServerApiUrl } from "@/lib/api-url";

type PresignBody = {
  filename?: string;
  content_type?: string;
};

function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() || "model.glb";
  const cleaned = base.replace(/[^\w.\-]+/g, "_").slice(0, 200);
  return cleaned || "model.glb";
}

export async function POST(request: Request) {
  let body: PresignBody;
  try {
    body = (await request.json()) as PresignBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const filename = body.filename;
  if (!filename) {
    return NextResponse.json({ error: "filename is required" }, { status: 400 });
  }

  const bucket = process.env.AWS_BUCKET;
  const region = process.env.AWS_REGION || "us-east-1";

  if (bucket) {
    try {
      const safe = sanitizeFilename(filename);
      const key = `models/${randomUUID()}-${safe}`;
      const contentType = body.content_type || "model/gltf-binary";
      const client = new S3Client({ region });
      const cmd = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      });
      const upload_url = await getSignedUrl(client, cmd, { expiresIn: 900 });
      return NextResponse.json({
        upload_url,
        key,
        method: "PUT",
        expires_in: 900,
        source: "next",
      });
    } catch {
      /* fall through to FastAPI presign or 503 */
    }
  }

  const api = getServerApiUrl();
  if (!api) {
    return NextResponse.json(
      {
        error:
          "Presign unavailable: set AWS_BUCKET on Next (with default credential chain) or API_URL for FastAPI presign",
      },
      { status: 503 },
    );
  }

  const upstream = await fetch(`${api}/upload/presign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename,
      content_type: body.content_type || "model/gltf-binary",
    }),
  });

  const json = (await upstream.json()) as Record<string, unknown>;
  if (!upstream.ok) {
    const detail =
      typeof json.detail === "string"
        ? json.detail
        : typeof json.error === "string"
          ? json.error
          : "Presign failed";
    return NextResponse.json({ error: detail }, { status: upstream.status });
  }

  return NextResponse.json({ ...json, source: "fastapi" });
}
