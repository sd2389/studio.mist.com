from typing import Literal

from pydantic import BaseModel, Field, field_validator

FinishSpec = Literal["polished", "brushed", "satin", "hammered", "sandblasted"]
SettingType = Literal["prong", "bezel", "pave", "channel", "tension", "flush", "other"]
ShankProfile = Literal["flat", "comfort-fit", "knife-edge", "rounded", "other"]
HeadStyle = Literal["solitaire", "halo", "three-stone", "cluster", "other"]
StoneCut = Literal[
    "round",
    "oval",
    "cushion",
    "emerald",
    "pear",
    "marquise",
    "princess",
    "radiant",
    "asscher",
    "heart",
    "other",
]
ClarityGrade = Literal[
    "FL",
    "IF",
    "VVS1",
    "VVS2",
    "VS1",
    "VS2",
    "SI1",
    "SI2",
    "I1",
    "I2",
    "I3",
]
ColorGrade = Literal[
    "D",
    "E",
    "F",
    "G",
    "H",
    "I",
    "J",
    "K",
    "L",
    "M",
    "fancy",
]


class StoneSpec(BaseModel):
    id: str
    gem_type: str = ""
    carat: float | None = None
    clarity: ClarityGrade | Literal[""] | None = None
    color: ColorGrade | Literal[""] | None = None
    fancy_color: str = ""
    cut: StoneCut | Literal[""] | None = None
    quantity: int = Field(default=1, ge=1)

    @field_validator("carat")
    @classmethod
    def carat_non_negative(cls, value: float | None) -> float | None:
        if value is not None and value < 0:
            raise ValueError("carat must be >= 0")
        return value


class ProductSpecs(BaseModel):
    metal_type: str = ""
    metal_purity: str = ""
    hallmark: str = ""
    finish: FinishSpec | Literal[""] | None = None
    stone_count: int | None = Field(default=None, ge=1)
    total_carat: float | None = None
    stones: list[StoneSpec] = Field(default_factory=list, max_length=20)
    setting_type: SettingType | Literal[""] | None = None
    setting_type_other: str = ""
    head_style: HeadStyle | Literal[""] | None = None
    head_style_other: str = ""
    shank_profile: ShankProfile | Literal[""] | None = None
    shank_profile_other: str = ""
    ring_size: str = ""
    length_mm: float | None = None
    width_mm: float | None = None
    height_mm: float | None = None
    metal_weight_g: float | None = None

    @field_validator("total_carat", "length_mm", "width_mm", "height_mm", "metal_weight_g")
    @classmethod
    def non_negative_floats(cls, value: float | None) -> float | None:
        if value is not None and value < 0:
            raise ValueError("value must be >= 0")
        return value
