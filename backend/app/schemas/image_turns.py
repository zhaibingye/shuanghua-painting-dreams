from typing import Annotated, Literal

from pydantic import Field, model_validator

from app.domain.enums import ApiFormat
from app.domain.openai_images import DEFAULT_IMAGE_MODEL
from app.schemas.common import ApiModel, DataUrlImageAsset, ImageAsset, UpstreamRequest
from app.schemas.images import (
    GeminiImageOptions,
    OpenAIImageBaseOptions,
    OpenAIImageOutputOptions,
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


class OpenAIResponsesImageOptions(OpenAIImageOutputOptions):
    image_model: str = Field(default=DEFAULT_IMAGE_MODEL, min_length=1, max_length=256)
    size: str = Field(default="auto", min_length=3, max_length=32)
    moderation: Literal["auto", "low"] = "auto"
    input_fidelity: Literal["auto", "low", "high"] = "auto"
    partial_images: int = Field(default=2, ge=0, le=3)


class OpenAIImageTurnOptions(OpenAIImageBaseOptions):
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
