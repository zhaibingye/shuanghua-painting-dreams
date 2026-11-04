from collections.abc import Mapping
from typing import Any

from pydantic import AliasChoices, BaseModel, Field, ValidationError

from app.domain.capabilities import byte_dance_model_capabilities
from app.domain.enums import ApiFormat, TaskOperation, TaskStatus
from app.domain.models import (
    CreatedVideoTask,
    Usage,
    VideoOutput,
    VideoTaskError,
    VideoTaskResult,
)
from app.infrastructure.config import Settings
from app.providers.base import (
    ProviderTransport,
    bearer_headers,
    ensure_success,
    invalid_response_error,
)
from app.providers.bytedance_endpoints import byte_dance_endpoints
from app.schemas.common import PublicHttpUrl
from app.schemas.videos import ByteDanceVideoGenerationRequest

_COMPATIBLE_STATUSES = {
    "queued": TaskStatus.QUEUED,
    "in_progress": TaskStatus.PROCESSING,
    "completed": TaskStatus.SUCCEEDED,
    "failed": TaskStatus.FAILED,
    "expired": TaskStatus.EXPIRED,
    "cancelled": TaskStatus.CANCELLED,
}


class CompatibleVideoMetadata(BaseModel):
    url: PublicHttpUrl | None = None
    last_frame_url: PublicHttpUrl | None = None


class CompatibleVideoError(BaseModel):
    code: str = "upstreamTaskFailed"
    message: str = "字节视频任务失败。"


class CompatibleVideoTask(BaseModel):
    id: str = Field(min_length=1)
    status: str
    model: str | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    duration: float | None = Field(
        default=None, validation_alias=AliasChoices("seconds", "duration")
    )
    metadata: CompatibleVideoMetadata = Field(default_factory=CompatibleVideoMetadata)
    error: CompatibleVideoError | None = None


class ByteDanceVideoAdapter:
    api_format = ApiFormat.BYTE_DANCE_VIDEO

    def __init__(self, transport: ProviderTransport, settings: Settings) -> None:
        self._transport = transport
        self._settings = settings

    async def create(
        self, request: ByteDanceVideoGenerationRequest, api_key: str
    ) -> CreatedVideoTask:
        payload = self._payload(request)
        endpoints = byte_dance_endpoints(request.base_url)
        if not endpoints.official:
            payload = {
                "model": request.model_id,
                "prompt": request.prompt,
                "seconds": str(request.options.duration),
                "metadata": {
                    key: value for key, value in payload.items() if key not in {"model", "duration"}
                },
            }
        response = await self._transport.request_json(
            method="POST",
            url=endpoints.video(),
            headers=bearer_headers(api_key),
            payload=payload,
            read_timeout=self._settings.video_create_timeout_seconds,
            api_format=self.api_format,
        )
        data = ensure_success(response, api_format=self.api_format)
        if not endpoints.official:
            compatible = self._compatible_task(data)
            return CreatedVideoTask(
                task_id=compatible.id,
                api_format=self.api_format,
                operation=TaskOperation.GENERATION,
                status=_COMPATIBLE_STATUSES[compatible.status],
            )
        task_id = data.get("id")
        if not isinstance(task_id, str) or not task_id:
            raise invalid_response_error(self.api_format, "字节视频响应缺少任务 ID。")
        return CreatedVideoTask(
            task_id=task_id,
            api_format=self.api_format,
            operation=TaskOperation.GENERATION,
            status=TaskStatus.QUEUED,
        )

    async def get_status(self, base_url: str, task_id: str, api_key: str) -> VideoTaskResult:
        endpoints = byte_dance_endpoints(base_url)
        response = await self._transport.request_json(
            method="GET",
            url=endpoints.video(task_id),
            headers=bearer_headers(api_key),
            payload=None,
            read_timeout=self._settings.video_status_timeout_seconds,
            api_format=self.api_format,
            retryable=True,
        )
        data = ensure_success(response, api_format=self.api_format, retryable=True)
        if not endpoints.official:
            return self._parse_compatible_status(task_id, data)
        return self._parse_status(task_id, data)

    def _compatible_task(self, data: Mapping[str, Any]) -> CompatibleVideoTask:
        try:
            task = CompatibleVideoTask.model_validate(data)
        except ValidationError as exc:
            raise invalid_response_error(self.api_format, "兼容视频响应不符合接口契约。") from exc
        if task.status not in _COMPATIBLE_STATUSES:
            raise invalid_response_error(self.api_format, f"未知兼容视频状态：{task.status}")
        return task

    def _parse_compatible_status(self, task_id: str, data: Mapping[str, Any]) -> VideoTaskResult:
        task = self._compatible_task(data)
        status = _COMPATIBLE_STATUSES[task.status]
        output = None
        if status == TaskStatus.SUCCEEDED:
            if task.metadata.url is None:
                raise invalid_response_error(self.api_format, "兼容视频完成响应缺少 metadata.url。")
            output = VideoOutput(
                video_url=str(task.metadata.url),
                last_frame_url=str(task.metadata.last_frame_url)
                if task.metadata.last_frame_url
                else None,
                duration=task.duration,
            )
        error = task.error or CompatibleVideoError()
        return VideoTaskResult(
            task_id=task_id,
            api_format=self.api_format,
            status=status,
            progress=task.progress,
            model_id=task.model,
            output=output,
            error=VideoTaskError(code=error.code, message=error.message)
            if status == TaskStatus.FAILED
            else None,
        )

    @staticmethod
    def _payload(request: ByteDanceVideoGenerationRequest) -> dict[str, Any]:
        content: list[dict[str, Any]] = []
        if request.prompt:
            content.append({"type": "text", "text": request.prompt})

        inputs = request.inputs
        if inputs.first_frame_url is not None:
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": str(inputs.first_frame_url)},
                    "role": "first_frame",
                }
            )
        if inputs.last_frame_url is not None:
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": str(inputs.last_frame_url)},
                    "role": "last_frame",
                }
            )
        for url in inputs.reference_image_urls:
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": str(url)},
                    "role": "reference_image",
                }
            )
        if inputs.reference_video_url is not None:
            content.append(
                {
                    "type": "video_url",
                    "video_url": {"url": str(inputs.reference_video_url)},
                    "role": "reference_video",
                }
            )
        if inputs.reference_audio_url is not None:
            content.append(
                {
                    "type": "audio_url",
                    "audio_url": {"url": str(inputs.reference_audio_url)},
                    "role": "reference_audio",
                }
            )

        options = request.options
        payload: dict[str, Any] = {
            "model": request.model_id,
            "content": content,
            "duration": options.duration,
            "resolution": options.resolution,
            "ratio": options.aspect_ratio,
            "generate_audio": options.generate_audio,
            "watermark": options.watermark,
            "seed": options.seed,
            "return_last_frame": options.return_last_frame,
        }
        capabilities = byte_dance_model_capabilities(request.model_id)
        if capabilities.get("serviceTierParameter") is True:
            payload["service_tier"] = options.service_tier
        if options.camera_fixed:
            payload["camera_fixed"] = True
        if options.web_search:
            payload["tools"] = [{"type": "web_search"}]
        return payload

    def _parse_status(self, task_id: str, data: Mapping[str, Any]) -> VideoTaskResult:
        raw_status = data.get("status")
        if not isinstance(raw_status, str):
            raise invalid_response_error(self.api_format, "字节视频任务响应缺少状态。")
        status_map = {
            "queued": TaskStatus.QUEUED,
            "running": TaskStatus.PROCESSING,
            "succeeded": TaskStatus.SUCCEEDED,
            "failed": TaskStatus.FAILED,
            "expired": TaskStatus.EXPIRED,
            "cancelled": TaskStatus.CANCELLED,
        }
        status = status_map.get(raw_status)
        if status is None:
            raise invalid_response_error(self.api_format, f"未知字节任务状态：{raw_status}")

        output = None
        content = data.get("content")
        if status == TaskStatus.SUCCEEDED and isinstance(content, Mapping):
            video_url = content.get("video_url")
            if not isinstance(video_url, str) or not video_url:
                raise invalid_response_error(self.api_format, "成功任务缺少 video_url。")
            output = VideoOutput(
                video_url=video_url,
                last_frame_url=_optional_str(content.get("last_frame_url")),
                duration=_optional_float(data.get("duration")),
            )

        task_error = None
        error_data = data.get("error")
        if status == TaskStatus.FAILED and isinstance(error_data, Mapping):
            task_error = VideoTaskError(
                code=_optional_str(error_data.get("code")) or "upstreamTaskFailed",
                message=_optional_str(error_data.get("message")) or "字节视频任务失败。",
            )

        usage_data = data.get("usage")
        usage = None
        if isinstance(usage_data, Mapping):
            usage = Usage(
                output_tokens=_optional_int(usage_data.get("completion_tokens")),
                total_tokens=_optional_int(usage_data.get("total_tokens")),
            )

        return VideoTaskResult(
            task_id=task_id,
            api_format=self.api_format,
            status=status,
            model_id=_optional_str(data.get("model")),
            output=output,
            usage=usage,
            error=task_error,
        )


def _optional_str(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def _optional_int(value: object) -> int | None:
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None


def _optional_float(value: object) -> float | None:
    if isinstance(value, int | float) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None
