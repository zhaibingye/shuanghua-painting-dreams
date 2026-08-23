from dataclasses import dataclass, field
from typing import Any

from app.domain.enums import ApiFormat, TaskOperation, TaskStatus


@dataclass(slots=True, frozen=True)
class GeneratedImage:
    mime_type: str
    base64_data: str
    revised_prompt: str | None = None
    is_thought: bool = False
    thought_signature: str | None = None


@dataclass(slots=True, frozen=True)
class Usage:
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None
    cost_in_usd_ticks: int | None = None


@dataclass(slots=True, frozen=True)
class ImageResult:
    images: list[GeneratedImage]
    text_outputs: list[str] = field(default_factory=list)
    usage: Usage | None = None
    provider_state: dict[str, Any] | None = None


@dataclass(slots=True, frozen=True)
class ImageStreamChunk:
    kind: str
    image: GeneratedImage | None = None
    image_index: int = 0
    partial_image_index: int | None = None
    text_delta: str | None = None
    usage: Usage | None = None
    provider_state: dict[str, Any] | None = None
    provider_metadata: dict[str, Any] | None = None


@dataclass(slots=True, frozen=True)
class CreatedVideoTask:
    task_id: str
    api_format: ApiFormat
    operation: TaskOperation
    status: TaskStatus


@dataclass(slots=True, frozen=True)
class VideoOutput:
    video_url: str
    last_frame_url: str | None = None
    duration: float | None = None
    respect_moderation: bool | None = None


@dataclass(slots=True, frozen=True)
class VideoTaskError:
    code: str
    message: str


@dataclass(slots=True, frozen=True)
class VideoTaskResult:
    task_id: str
    api_format: ApiFormat
    status: TaskStatus
    progress: int | None = None
    model_id: str | None = None
    output: VideoOutput | None = None
    usage: Usage | None = None
    error: VideoTaskError | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
