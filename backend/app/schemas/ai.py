from pydantic import BaseModel, Field


class AiBackgroundBody(BaseModel):
    jewelry_b64: str = Field(..., min_length=24, description="PNG data URL or raw base64")
    prompt: str | None = Field(
        default=None,
        max_length=2000,
        description="Override inpaint prompt when mode=sdxl",
    )
