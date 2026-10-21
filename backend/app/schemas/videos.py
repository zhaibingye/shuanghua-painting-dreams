from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator

from app.domain.enums import ApiFormat, TaskOperation, TaskStatus
from app.domain.seedance import byte_dance_model_capabilities
from app.schemas.common import ApiModel, ImageAsset, PublicHttpUrl, UpstreamRequest, UsageResponse

ByteDanceVideoMode = Literal[
    "textToVideo",
    "firstFrameToVideo",
    "firstLastFrameToVideo",
    "referenceToVideo",
]
XAIVideoMode = Literal["textToVideo", "firstFrameToVideo", "referenceToVideo"]
ByteDanceVideoResolution = Literal["480p", "720p", "1080p", "4k"]
XAIVideoResolution = Literal["480p", "720p", "1080p"]


class ByteDanceVideoInputs(ApiModel):
    first_frame_url: PublicHttpUrl | None = None
    last_frame_url: PublicHttpUrl | None = None
    reference_image_urls: list[PublicHttpUrl] = Field(default_factory=list, max_length=4)
    reference_video_url: PublicHttpUrl | None = None
    reference_audio_url: PublicHttpUrl | None = None


class ByteDanceVideoOptions(ApiModel):
    duration: int = Field(default=-1, ge=-1, le=30)
    resolution: ByteDanceVideoResolution = "720p"
    aspect_ratio: Literal["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"] = "adaptive"
    generate_audio: bool = True
    watermark: bool = False
    seed: int = Field(default=-1, ge=-1, le=4294967295)
    return_last_frame: bool = False
    camera_fixed: bool = False
    service_tier: Literal["default", "flex"] = "default"
    web_search: bool = False

    @field_validator("duration")
    @classmethod
    def validate_duration(cls, value: int) -> int:
        if value not in {-1} and value < 2:
            raise ValueError("字节视频时长必须为 -1 或至少 2 秒")
        return value


class ByteDanceVideoGenerationRequest(UpstreamRequest):
    api_format: Literal[ApiFormat.BYTE_DANCE_VIDEO]
    mode: ByteDanceVideoMode
    prompt: str = Field(default="", max_length=32000)
    inputs: ByteDanceVideoInputs = Field(default_factory=ByteDanceVideoInputs)
    options: ByteDanceVideoOptions = Field(default_factory=ByteDanceVideoOptions)

    @model_validator(mode="after")
    def validate_mode(self) -> "ByteDanceVideoGenerationRequest":
        capabilities = byte_dance_model_capabilities(self.model_id)
        defaults = {
            "duration": capabilities["defaultDuration"],
            "resolution": capabilities["defaultResolution"],
            "generate_audio": capabilities["defaultGenerateAudio"],
            "aspect_ratio": (
                "16:9"
                if self.model_id.startswith("doubao-seedance-1-0-") and self.mode == "textToVideo"
                else "adaptive"
            ),
        }
        for field, value in defaults.items():
            if field not in self.options.model_fields_set:
                setattr(self.options, field, value)
        inputs = self.inputs
        if self.mode == "textToVideo" and not self.prompt:
            raise ValueError("文生视频必须填写提示词")
        if self.mode == "firstFrameToVideo" and inputs.first_frame_url is None:
            raise ValueError("首帧生视频必须填写首帧 URL")
        if self.mode == "firstLastFrameToVideo" and (
            inputs.first_frame_url is None or inputs.last_frame_url is None
        ):
            raise ValueError("首尾帧生视频必须同时填写首帧和尾帧 URL")
        if self.mode == "referenceToVideo":
            has_reference = bool(
                inputs.reference_image_urls
                or inputs.reference_video_url
                or inputs.reference_audio_url
            )
            if not self.prompt or not has_reference:
                raise ValueError("参考生视频必须填写提示词和至少一个参考素材 URL")

        content_count = int(bool(self.prompt))
        content_count += int(inputs.first_frame_url is not None)
        content_count += int(inputs.last_frame_url is not None)
        content_count += len(inputs.reference_image_urls)
        content_count += int(inputs.reference_video_url is not None)
        content_count += int(inputs.reference_audio_url is not None)
        if content_count > 5:
            raise ValueError("字节视频 content 最多包含 5 个元素，文本也占一个元素")
        return self


class XAIVideoInputs(ApiModel):
    first_frame: ImageAsset | None = None
    reference_images: list[ImageAsset] = Field(default_factory=list, max_length=8)
    voice_ids: list[str] = Field(default_factory=list, max_length=3)

    @field_validator("voice_ids")
    @classmethod
    def validate_voice_ids(cls, value: list[str]) -> list[str]:
        normalized = [voice_id.strip() for voice_id in value if voice_id.strip()]
        if len(normalized) != len(set(normalized)):
            raise ValueError("voice ID 不能重复")
        if any(len(voice_id) > 64 for voice_id in normalized):
            raise ValueError("voice ID 最长为 64 个字符")
        return normalized


class XAIVideoOptions(ApiModel):
    duration: int = Field(default=8, ge=1, le=15)
    resolution: XAIVideoResolution = "720p"
    aspect_ratio: Literal["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"] = "16:9"


class XAIVideoGenerationRequest(UpstreamRequest):
    api_format: Literal[ApiFormat.XAI_VIDEO]
    mode: XAIVideoMode
    prompt: str = Field(default="", max_length=32000)
    inputs: XAIVideoInputs = Field(default_factory=XAIVideoInputs)
    options: XAIVideoOptions = Field(default_factory=XAIVideoOptions)

    @model_validator(mode="after")
    def validate_mode(self) -> "XAIVideoGenerationRequest":
        if self.inputs.first_frame is not None and self.inputs.reference_images:
            raise ValueError("xAI 首帧图片与参考图片严格互斥")
        if self.mode == "textToVideo" and not self.prompt:
            raise ValueError("文生视频必须填写提示词")
        if self.mode == "firstFrameToVideo" and self.inputs.first_frame is None:
            raise ValueError("首帧生视频必须提供首帧图片")
        if self.mode == "referenceToVideo" and (
            not self.prompt or not (self.inputs.reference_images or self.inputs.voice_ids)
        ):
            raise ValueError("参考生视频必须填写提示词和至少一个参考图片或音色")
        return self


VideoGenerationRequest = Annotated[
    ByteDanceVideoGenerationRequest | XAIVideoGenerationRequest,
    Field(discriminator="api_format"),
]


class XAIVideoExtensionRequest(UpstreamRequest):
    api_format: Literal[ApiFormat.XAI_VIDEO]
    prompt: str = Field(min_length=1, max_length=32000)
    video_url: PublicHttpUrl
    duration: int = Field(default=6, ge=2, le=10)


class VideoTaskStatusRequest(ApiModel):
    api_format: Literal[ApiFormat.BYTE_DANCE_VIDEO, ApiFormat.XAI_VIDEO]
    base_url: str = Field(min_length=8, max_length=2048)
    task_id: str = Field(min_length=1, max_length=512)

    @field_validator("task_id")
    @classmethod
    def validate_task_id(cls, value: str) -> str:
        if any(character in value for character in "/?#\\"):
            raise ValueError("任务 ID 不能包含路径控制字符")
        return value


class CreatedVideoTaskResponse(ApiModel):
    task_id: str
    api_format: ApiFormat
    operation: TaskOperation
    status: TaskStatus


class VideoCreationResponse(ApiModel):
    request_id: str
    task: CreatedVideoTaskResponse


class VideoOutputResponse(ApiModel):
    video_url: str
    last_frame_url: str | None = None
    duration: float | None = None
    respect_moderation: bool | None = None


class VideoTaskErrorResponse(ApiModel):
    code: str
    message: str


class VideoTaskResponse(ApiModel):
    task_id: str
    api_format: ApiFormat
    status: TaskStatus
    progress: int | None = None
    model_id: str | None = None
    output: VideoOutputResponse | None = None
    usage: UsageResponse | None = None
    error: VideoTaskErrorResponse | None = None


class VideoTaskStatusResponse(ApiModel):
    request_id: str
    task: VideoTaskResponse
