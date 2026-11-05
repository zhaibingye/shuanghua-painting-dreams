from typing import Annotated, Literal, Self

from pydantic import Field, field_validator, model_validator

from app.domain.enums import ApiFormat
from app.domain.openai_images import validate_image_size
from app.schemas.common import (
    ApiModel,
    DataUrlImageAsset,
    ImageAsset,
    UpstreamRequest,
    UsageResponse,
)


class GeminiImageOptions(ApiModel):
    aspect_ratio: Literal[
        "1:1",
        "1:4",
        "4:1",
        "1:8",
        "8:1",
        "2:3",
        "3:2",
        "3:4",
        "4:3",
        "4:5",
        "5:4",
        "9:16",
        "16:9",
        "21:9",
    ] = Field(default="1:1", title="宽高比")
    image_size: Literal["512", "1K", "2K", "4K"] = Field(default="1K", title="图片大小")
    response_modalities: Literal["IMAGE", "TEXT_AND_IMAGE"] = Field(
        default="IMAGE", title="输出模态"
    )
    thinking_level: Literal["MINIMAL", "LOW", "MEDIUM", "HIGH"] = Field(
        default="HIGH", title="Thinking Level", description="思考等级是否可用取决于模型。"
    )
    include_thoughts: bool = Field(default=False, title="返回思考内容")


class OpenAIImageOutputOptions(ApiModel):
    size: str = Field(
        default="1024x1024",
        min_length=3,
        max_length=32,
        title="尺寸",
        description="auto 或 WIDTHxHEIGHT",
    )
    quality: Literal["auto", "low", "medium", "high", "xhigh", "max"] = Field(
        default="auto", title="质量", description="xhigh / max 需要 GPT Image 2.5 / 2.6。"
    )
    output_format: Literal["png", "jpeg", "webp", "svg", "gif"] = Field(
        default="png", title="输出格式"
    )
    output_compression: int = Field(default=100, ge=0, le=100, title="输出压缩")
    background: Literal["auto", "opaque", "transparent"] = Field(default="auto", title="背景")

    safety_identifier: str | None = Field(
        default=None,
        max_length=128,
        title="安全标识（可选）",
        description="最多 128 字符；请使用用户标识的哈希值。",
    )

    @model_validator(mode="after")
    def validate_output_options(self) -> Self:
        self.size = validate_image_size(self.size, animated=self.output_format == "gif")
        if self.background == "transparent" and self.output_format == "jpeg":
            raise ValueError("透明背景不能使用 JPEG 输出格式")
        return self


class OpenAIImageBaseOptions(OpenAIImageOutputOptions):
    count: int = Field(default=1, ge=1, le=10, title="生成数量")


class OpenAIImageOptions(OpenAIImageBaseOptions):
    output_format: Literal["png", "jpeg", "webp", "svg", "gif"] = Field(
        default="png",
        title="输出格式",
        description="SVG / GIF 仅支持 GPT Image 2.6 文生图，生成期间不提供渐进预览。",
    )
    complexity: Literal["auto", "low", "medium", "high"] = Field(
        default="auto",
        title="复杂度",
        description="GPT Image 2.6 的构图规划量，独立于质量；auto 使用模型默认值 high。",
    )
    svg_model: str = Field(
        default="",
        max_length=256,
        title="SVG 编写模型（可选）",
        description="仅在上游已开通 SVG 模型选择时填写；留空使用上游默认配置。",
    )
    svg_reasoning_effort: Literal[
        "auto", "none", "minimal", "low", "medium", "high", "xhigh", "max"
    ] = Field(
        default="auto",
        title="SVG 编写推理强度",
        description="独立于图像复杂度；可用档位取决于所选编写模型，auto 使用其默认值。",
    )
    frame_count: int = Field(default=9, ge=2, le=64, title="动画帧数")
    frame_duration_ms: int = Field(
        default=200,
        ge=20,
        le=2000,
        title="每帧时长（毫秒）",
        description="仅 GIF 生效；上游按 10 毫秒取整。",
    )
    moderation: Literal["auto", "low"] = Field(default="auto", title="Moderation")
    partial_images: int = Field(default=2, ge=0, le=3, title="渐进预览数量")

    @model_validator(mode="after")
    def validate_generation_format(self) -> Self:
        if self.output_format == "svg" and self.count != 1:
            raise ValueError("SVG 输出只能生成一张图片")
        if (
            self.output_format == "svg"
            and self.svg_reasoning_effort != "auto"
            and not self.svg_model
        ):
            raise ValueError("指定 SVG 编写推理强度时必须填写 SVG 编写模型")
        if self.output_format == "gif" and self.background == "transparent":
            raise ValueError("GIF 输出不支持透明背景，请选择 auto 或 opaque")
        return self


class OpenAIImageEditOptions(OpenAIImageOptions):
    input_fidelity: Literal["auto", "low", "high"] = Field(
        default="auto",
        title="输入保真度",
        description="auto 表示不发送该参数；GPT Image 2 请使用 auto。",
    )


class XAIImageOptions(ApiModel):
    count: int = Field(default=1, ge=1, le=10, title="生成数量")
    aspect_ratio: Literal[
        "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "2:1", "1:2", "auto"
    ] = Field(default="1:1", title="宽高比")
    resolution: Literal["1k", "2k"] = Field(default="1k", title="分辨率")
    quality: Literal["low", "medium"] = Field(default="medium", title="质量")


class ByteDanceImageOptions(ApiModel):
    size: str = Field(
        default="2K",
        min_length=2,
        max_length=32,
        title="尺寸",
        description="分辨率档位或 WIDTHxHEIGHT，取值范围取决于 Seedream 模型。",
    )
    watermark: bool = Field(default=True, title="添加水印")
    sequential_image_generation: Literal["disabled", "auto"] = Field(
        default="disabled", title="组图模式", description="5.0 pro / flash 不支持组图。"
    )
    max_images: int = Field(
        default=15,
        ge=1,
        le=15,
        title="最大生成数量",
        description="组图模式下生效；参考图与输出图合计不超过 15 张。",
    )
    output_format: Literal["jpeg", "png"] = Field(
        default="jpeg", title="输出格式", description="仅 Seedream 5.0 支持选择输出格式。"
    )
    optimize_prompt_mode: Literal["standard", "fast"] = Field(
        default="standard", title="提示词优化", description="fast 仅支持 4.0 / 5.0 pro。"
    )
    web_search: bool = Field(
        default=False, title="联网搜索", description="仅 Seedream 5.0 lite 支持。"
    )

    @field_validator("size")
    @classmethod
    def validate_size(cls, value: str) -> str:
        if value in {"1K", "1.5K", "2K", "3K", "4K"}:
            return value
        parts = value.lower().split("x", maxsplit=1)
        if len(parts) != 2 or not all(part.isdigit() and int(part) > 0 for part in parts):
            raise ValueError("尺寸必须是分辨率档位或 WIDTHxHEIGHT")
        return value.lower()


class ByteDanceImageGenerationRequest(UpstreamRequest):
    api_format: Literal[ApiFormat.BYTE_DANCE_IMAGE]
    prompt: str = Field(min_length=1, max_length=32000)
    options: ByteDanceImageOptions = Field(default_factory=ByteDanceImageOptions)


class ByteDanceImageEditRequest(ByteDanceImageGenerationRequest):
    images: list[ImageAsset] = Field(min_length=1, max_length=14)


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
    GeminiImageGenerationRequest
    | OpenAIImageGenerationRequest
    | XAIImageGenerationRequest
    | ByteDanceImageGenerationRequest,
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
    markup: DataUrlImageAsset | None = Field(
        default=None,
        description="与第一张输入图同尺寸的透明 PNG 标注层；不可与 mask 同时使用。",
    )
    options: OpenAIImageEditOptions = Field(default_factory=OpenAIImageEditOptions)

    @model_validator(mode="after")
    def validate_mask_inputs(self) -> OpenAIImageEditRequest:
        if self.markup is not None and self.mask is not None:
            raise ValueError("标注图不能与遮罩同时使用")
        if self.mask is not None and len(self.images) != 1:
            raise ValueError("遮罩编辑只能包含一张主编辑图片")
        return self


class XAIImageEditRequest(UpstreamRequest):
    api_format: Literal[ApiFormat.XAI_IMAGE]
    prompt: str = Field(min_length=1, max_length=32000)
    images: list[ImageAsset] = Field(min_length=1, max_length=3)
    options: XAIImageOptions = Field(default_factory=XAIImageOptions)


ImageEditRequest = Annotated[
    GeminiImageEditRequest
    | OpenAIImageEditRequest
    | XAIImageEditRequest
    | ByteDanceImageEditRequest,
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
