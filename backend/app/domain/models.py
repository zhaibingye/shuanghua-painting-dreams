from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, ClassVar, Literal, TypedDict

from app.domain.enums import ApiFormat, TaskOperation, TaskStatus

if TYPE_CHECKING:
    from app.schemas.images import SeedreamImageLayer


@dataclass(slots=True, frozen=True)
class GeneratedImage:
    mime_type: str
    base64_data: str
    revised_prompt: str | None = None
    is_thought: bool = False
    thought_signature: str | None = None
    layer: SeedreamImageLayer | None = None


@dataclass(slots=True, frozen=True)
class Usage:
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None
    cost_in_usd_ticks: int | None = None


class GeminiTextState(TypedDict):
    kind: Literal["text"]
    text: str
    thought: bool
    thoughtSignature: str | None


class GeminiImageState(TypedDict):
    kind: Literal["image"]
    imageIndex: int
    thought: bool
    thoughtSignature: str | None


class GeminiProviderState(TypedDict):
    type: Literal["gemini"]
    parts: list[GeminiTextState | GeminiImageState]
    includeThoughts: bool


class ResponsesProviderState(TypedDict):
    type: Literal["openaiResponses"]
    responseId: str | None
    store: Literal[False]


type ImageProviderState = GeminiProviderState | ResponsesProviderState


@dataclass(slots=True, frozen=True)
class ImageResult:
    images: list[GeneratedImage]
    text_outputs: list[str] = field(default_factory=list)
    usage: Usage | None = None
    provider_state: ImageProviderState | None = None

    def stream_chunks(self) -> Iterator[ImageStreamChunk]:
        for text in self.text_outputs:
            if text:
                yield ImageTextDelta(text)
        for index, image in enumerate(self.images):
            yield CompletedImage(image, index)
        yield ImageStreamDone(usage=self.usage, provider_state=self.provider_state)


@dataclass(slots=True, frozen=True)
class PartialImage:
    kind: ClassVar[Literal["partial"]] = "partial"
    image: GeneratedImage
    image_index: int
    partial_image_index: int | None = None
    provider_metadata: dict[str, Any] | None = None


@dataclass(slots=True, frozen=True)
class CompletedImage:
    kind: ClassVar[Literal["completed"]] = "completed"
    image: GeneratedImage
    image_index: int
    provider_metadata: dict[str, Any] | None = None


@dataclass(slots=True, frozen=True)
class ImageTextDelta:
    kind: ClassVar[Literal["text_delta"]] = "text_delta"
    text_delta: str


@dataclass(slots=True, frozen=True)
class ImageStreamDone:
    kind: ClassVar[Literal["done"]] = "done"
    usage: Usage | None = None
    provider_state: ImageProviderState | None = None


type ImageStreamChunk = PartialImage | CompletedImage | ImageTextDelta | ImageStreamDone


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
