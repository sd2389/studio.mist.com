import boto3
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse

from app.config import get_settings

router = APIRouter()


def _reject_traversal(path: str) -> None:
    if ".." in path or path.startswith("/") or not path.strip():
        raise HTTPException(status_code=400, detail="Invalid path")


@router.get("/{full_path:path}", response_model=None)
async def serve_uploaded_file(full_path: str) -> FileResponse | StreamingResponse:
    _reject_traversal(full_path)
    settings = get_settings()
    local = settings.upload_dir / full_path

    if local.is_file():
        return FileResponse(local)

    if settings.aws_bucket:
        try:
            client = boto3.client("s3", region_name=settings.aws_region or "us-east-1")
            obj = client.get_object(Bucket=settings.aws_bucket, Key=full_path)
            body = obj["Body"]
            ct = obj.get("ContentType") or "application/octet-stream"
            return StreamingResponse(body, media_type=ct)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in ("NoSuchKey", "404", "NotFound"):
                raise HTTPException(status_code=404, detail="Not found") from exc
            raise HTTPException(status_code=502, detail=f"S3 read failed: {exc}") from exc
        except BotoCoreError as exc:
            raise HTTPException(status_code=502, detail=f"S3 error: {exc}") from exc

    raise HTTPException(status_code=404, detail="Not found")
