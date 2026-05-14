from pydantic import BaseModel, Field


class RenderSaveRequest(BaseModel):
    image: str = Field(..., min_length=32)
    scene_id: int | None = Field(default=None)
    model_id: str | None = Field(default=None, max_length=128)
    material: str | None = Field(default=None, max_length=64)
    lighting: str | None = Field(default=None, max_length=64)
    kind: str = Field(default="still", max_length=32)
    width: int | None = Field(default=None, ge=0)
    height: int | None = Field(default=None, ge=0)
