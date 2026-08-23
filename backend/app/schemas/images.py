from typing import Annotated, Literal, Self

from pydantic import Field, field_validator, model_validator

from app.domain.enums import ApiFormat
from app.schemas.common import (
    ApiModel,
    DataUrlImageAsset,
    ImageAsset,
    UpstreamRequest,
    UsageResponse,
)


class GeminiImageOptions(ApiModel):
    aspect_ratio: str = "1:1"
    image_size: Literal["512", "1K", "2K", "4K"] = "1K"
    response_modalities: Literal["IMAGE", "TEXT_AND_IMAGE"] = "IMAGE"
    thinking_level: Literal["High", "Low", "Off"] = "High"
    include_thoughts: bool = False


class OpenAIImageBaseOptions(ApiModel):
    count: int = Field(default=1, ge=1, le=10)
    size: str = Field(default="1024x1024", min_length=3, max_length=32)
    quality: Literal["auto", "low", "medium", "high"] = "auto"
    output_format: Literal["png", "jpeg", "webp"] = "png"
    output_compression: int = Field(default=100, ge=0, le=100)
    background: Literal["auto", "opaque", "transparent"] = "auto"

    @field_validator("size")
    @classmethod
    def validate_size(cls, value: str) -> str:
        if value == "auto":
            return value
        parts = value.lower().split("x", maxsplit=1)
        if len(parts) != 2 or not all(part.isdigit() for part in parts):
            raise ValueError("图片尺寸必须是 auto 或 WIDTHxHEIGHT")
        return value.lower()

    @model_validator(mode="after")
    def validate_output_options(self) -> Self:
        if self.background == "transparent" and self.output_format == "jpeg":
            raise ValueError("透明背景不能使用 JPEG 输出格式")
        return self


class OpenAIImageOptions(OpenAIImageBaseOptions):
    moderation: Literal["auto", "low"] = "auto"
    partial_images: int = Field(default=2, ge=0, le=3)


class OpenAIImageEditOptions(OpenAIImageBaseOptions):
    input_fidelity: Literal["auto", "low", "high"] = "auto"


class XAIImageOptions(ApiModel):
    count: int = Field(default=1, ge=1, le=10)
    aspect_ratio: str = Field(default="1:1", min_length=3, max_length=16)
    resolution: Literal["1k", "2k"] = "1k"
    quality: Literal["low", "medium"] = "medium"


class GeminiImageGenerationRequest(UpstreamRequest):
    api_format: Literal[ApiFormat.GOOGLE_GEMINI_IMAGE]
    prompt: str = Field(min_length=1, max_length=32000)
    options: GeminiImageOptions = Field(default_factory=GeminiImageOptions)


class OpenAIImageGenerationRequest(UpstreamRequest):
    api_format: Literal[ApiFormat.OPENAI_IMAGE]
    prompt: str = Field(min_length=1, max_length=32000)
    options: OpenAIImageOptions = Field(default_factory=OpenAIImageOptions)


class XAIImageGenerationRequest(UpstreamRequest):
    api_format: Literal[ApiFormat.XAI_IMAGE]
    prompt: str = Field(min_length=1, max_length=32000)
    options: XAIImageOptions = Field(default_factory=XAIImageOptions)


ImageGenerationRequest = Annotated[
    GeminiImageGenerationRequest | OpenAIImageGenerationRequest | XAIImageGenerationRequest,
    Field(discriminator="api_format"),
]


class GeminiImageEditRequest(UpstreamRequest):
    api_format: Literal[ApiFormat.GOOGLE_GEMINI_IMAGE]
    prompt: str = Field(min_length=1, max_length=32000)
    images: list[ImageAsset] = Field(min_length=1, max_length=14)
    options: GeminiImageOptions = Field(default_factory=GeminiImageOptions)


class OpenAIImageEditRequest(UpstreamRequest):
    api_format: Literal[ApiFormat.OPENAI_IMAGE]
    prompt: str = Field(min_length=1, max_length=32000)
    images: list[ImageAsset] = Field(min_length=1, max_length=16)
    mask: DataUrlImageAsset | None = None
    options: OpenAIImageEditOptions = Field(default_factory=OpenAIImageEditOptions)

    @model_validator(mode="after")
    def validate_mask_inputs(self) -> "OpenAIImageEditRequest":
        if self.mask is not None and len(self.images) != 1:
            raise ValueError("遮罩编辑只能包含一张主编辑图片")
        return self


class XAIImageEditRequest(UpstreamRequest):
    api_format: Literal[ApiFormat.XAI_IMAGE]
    prompt: str = Field(min_length=1, max_length=32000)
    images: list[ImageAsset] = Field(min_length=1, max_length=3)
    options: XAIImageOptions = Field(default_factory=XAIImageOptions)


ImageEditRequest = Annotated[
    GeminiImageEditRequest | OpenAIImageEditRequest | XAIImageEditRequest,
    Field(discriminator="api_format"),
]


class GeneratedImageResponse(ApiModel):
    id: str
    mime_type: str
    base64_data: str
    revised_prompt: str | None = None


class ImageOperationResponse(ApiModel):
    request_id: str
    images: list[GeneratedImageResponse]
    text_outputs: list[str] = Field(default_factory=list)
    usage: UsageResponse | None = None
