from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator

from app.domain.enums import ApiFormat
from app.schemas.common import ApiModel, DataUrlImageAsset, ImageAsset, UpstreamRequest
from app.schemas.images import (
    GeminiImageOptions,
    OpenAIImageBaseOptions,
    XAIImageOptions,
)


class GeminiTextPart(ApiModel):
    kind: Literal["text"] = "text"
    text: str = Field(min_length=1, max_length=64000)
    thought: bool = False
    thought_signature: str | None = None


class GeminiImagePart(ApiModel):
    kind: Literal["image"] = "image"
    image: ImageAsset
    thought: bool = False
    thought_signature: str | None = None


GeminiConversationPart = Annotated[
    GeminiTextPart | GeminiImagePart,
    Field(discriminator="kind"),
]


class GeminiConversationContent(ApiModel):
    role: Literal["user", "model"]
    parts: list[GeminiConversationPart] = Field(min_length=1, max_length=128)


class OpenAIResponsesMessageHistoryItem(ApiModel):
    kind: Literal["message"] = "message"
    text: str = Field(min_length=1, max_length=32000)
    images: list[ImageAsset] = Field(default_factory=list, max_length=16)


class OpenAIResponsesImageCallHistoryItem(ApiModel):
    kind: Literal["imageGenerationCall"] = "imageGenerationCall"
    call_id: str = Field(min_length=1, max_length=256)
    status: Literal["completed"] = "completed"
    image: DataUrlImageAsset


OpenAIResponsesHistoryItem = Annotated[
    OpenAIResponsesMessageHistoryItem | OpenAIResponsesImageCallHistoryItem,
    Field(discriminator="kind"),
]


class OpenAIResponsesImageOptions(ApiModel):
    size: str = Field(default="auto", min_length=3, max_length=32)
    quality: Literal["auto", "low", "medium", "high"] = "auto"
    output_format: Literal["png", "jpeg", "webp"] = "png"
    output_compression: int = Field(default=100, ge=0, le=100)
    background: Literal["auto", "opaque", "transparent"] = "auto"
    moderation: Literal["auto", "low"] = "auto"
    input_fidelity: Literal["auto", "low", "high"] = "auto"
    partial_images: int = Field(default=2, ge=0, le=3)

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
    def validate_output_options(self) -> "OpenAIResponsesImageOptions":
        if self.background == "transparent" and self.output_format == "jpeg":
            raise ValueError("透明背景不能使用 JPEG 输出格式")
        return self


class OpenAIImageTurnOptions(OpenAIImageBaseOptions):
    moderation: Literal["auto", "low"] = "auto"
    input_fidelity: Literal["auto", "low", "high"] = "auto"
    partial_images: int = Field(default=2, ge=0, le=3)


class OpenAIImageTurnRequest(UpstreamRequest):
    api_format: Literal[ApiFormat.OPENAI_IMAGE]
    prompt: str = Field(min_length=1, max_length=32000)
    source_images: list[ImageAsset] = Field(default_factory=list, max_length=16)
    mask: DataUrlImageAsset | None = None
    options: OpenAIImageTurnOptions = Field(default_factory=OpenAIImageTurnOptions)

    @model_validator(mode="after")
    def validate_mask_inputs(self) -> "OpenAIImageTurnRequest":
        if self.mask is not None and len(self.source_images) != 1:
            raise ValueError("遮罩编辑必须且只能包含一张主编辑图片")
        return self


class OpenAIResponsesImageTurnRequest(UpstreamRequest):
    api_format: Literal[ApiFormat.OPENAI_RESPONSES_IMAGE]
    prompt: str = Field(min_length=1, max_length=32000)
    history: list[OpenAIResponsesHistoryItem] = Field(default_factory=list, max_length=256)
    images: list[ImageAsset] = Field(default_factory=list, max_length=16)
    options: OpenAIResponsesImageOptions = Field(default_factory=OpenAIResponsesImageOptions)


class GeminiImageTurnRequest(UpstreamRequest):
    api_format: Literal[ApiFormat.GOOGLE_GEMINI_IMAGE]
    prompt: str = Field(min_length=1, max_length=32000)
    history: list[GeminiConversationContent] = Field(default_factory=list, max_length=256)
    images: list[ImageAsset] = Field(default_factory=list, max_length=14)
    options: GeminiImageOptions = Field(default_factory=GeminiImageOptions)


class XAIImageTurnRequest(UpstreamRequest):
    api_format: Literal[ApiFormat.XAI_IMAGE]
    prompt: str = Field(min_length=1, max_length=32000)
    source_images: list[ImageAsset] = Field(default_factory=list, max_length=3)
    options: XAIImageOptions = Field(default_factory=XAIImageOptions)


ImageConversationTurnRequest = Annotated[
    OpenAIImageTurnRequest
    | OpenAIResponsesImageTurnRequest
    | GeminiImageTurnRequest
    | XAIImageTurnRequest,
    Field(discriminator="api_format"),
]
