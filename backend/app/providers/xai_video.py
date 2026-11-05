from collections.abc import Mapping
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import ApiFormat, TaskOperation, TaskStatus
from app.domain.models import (
    CreatedVideoTask,
    Usage,
    VideoOutput,
    VideoTaskError,
    VideoTaskResult,
)
from app.infrastructure.config import Settings
from app.infrastructure.url_builder import build_upstream_url, encode_path_segment
from app.providers.base import (
    ProviderTransport,
    UpstreamUsage,
    bearer_headers,
    ensure_success,
    image_asset_value,
    invalid_response_error,
    parse_response,
)
from app.schemas.common import PublicHttpUrl
from app.schemas.videos import XAIVideoExtensionRequest, XAIVideoGenerationRequest


class XAIVideoCreation(BaseModel):
    request_id: str = Field(min_length=1)


class XAIVideoContent(BaseModel):
    model_config = ConfigDict(strict=True)
    url: PublicHttpUrl | None = None
    duration: float | None = None
    respect_moderation: bool | None = None


class XAIVideoError(BaseModel):
    code: str = "upstreamTaskFailed"
    message: str = "xAI 视频任务失败。"


class XAIVideoTask(BaseModel):
    model_config = ConfigDict(strict=True)
    status: Literal["pending", "done", "failed", "expired"]
    progress: int | None = Field(default=None, ge=0, le=100)
    model: str | None = None
    video: XAIVideoContent | None = None
    usage: UpstreamUsage | None = None
    error: XAIVideoError | None = None


class XAIVideoAdapter:
    api_format = ApiFormat.XAI_VIDEO

    def __init__(self, transport: ProviderTransport, settings: Settings) -> None:
        self._transport = transport
        self._settings = settings

    async def create(self, request: XAIVideoGenerationRequest, api_key: str) -> CreatedVideoTask:
        payload: dict[str, Any] = {
            "model": request.model_id,
            "duration": request.options.duration,
            "aspect_ratio": request.options.aspect_ratio,
            "resolution": request.options.resolution,
        }
        if request.prompt:
            payload["prompt"] = request.prompt
        if request.inputs.first_frame is not None:
            payload["image"] = {"url": image_asset_value(request.inputs.first_frame)}
        if request.inputs.reference_images:
            payload["reference_images"] = [
                {"url": image_asset_value(image)} for image in request.inputs.reference_images
            ]
        if request.inputs.voice_ids:
            payload["reference_audios"] = [
                {"voice_id": voice_id} for voice_id in request.inputs.voice_ids
            ]
        return await self._create_task(
            request.base_url,
            "/v1/videos/generations",
            api_key,
            payload,
            TaskOperation.GENERATION,
        )

    async def extend(self, request: XAIVideoExtensionRequest, api_key: str) -> CreatedVideoTask:
        payload = {
            "model": request.model_id,
            "prompt": request.prompt,
            "video": {"url": str(request.video_url)},
            "duration": request.duration,
        }
        return await self._create_task(
            request.base_url,
            "/v1/videos/extensions",
            api_key,
            payload,
            TaskOperation.EXTENSION,
        )

    async def _create_task(
        self,
        base_url: str,
        path: str,
        api_key: str,
        payload: dict[str, Any],
        operation: TaskOperation,
    ) -> CreatedVideoTask:
        response = await self._transport.request_json(
            method="POST",
            url=build_upstream_url(base_url, path),
            headers=bearer_headers(api_key),
            payload=payload,
            read_timeout=self._settings.video_create_timeout_seconds,
            api_format=self.api_format,
        )
        data = ensure_success(response, api_format=self.api_format)
        created = parse_response(XAIVideoCreation, data, api_format=self.api_format)
        return CreatedVideoTask(
            task_id=created.request_id,
            api_format=self.api_format,
            operation=operation,
            status=TaskStatus.PROCESSING,
        )

    async def get_status(self, base_url: str, task_id: str, api_key: str) -> VideoTaskResult:
        encoded_id = encode_path_segment(task_id)
        response = await self._transport.request_json(
            method="GET",
            url=build_upstream_url(base_url, f"/v1/videos/{encoded_id}"),
            headers=bearer_headers(api_key),
            payload=None,
            read_timeout=self._settings.video_status_timeout_seconds,
            api_format=self.api_format,
            retryable=True,
        )
        data = ensure_success(response, api_format=self.api_format, retryable=True)
        return self._parse_status(task_id, data)

    def _parse_status(self, task_id: str, data: Mapping[str, Any]) -> VideoTaskResult:
        task = parse_response(XAIVideoTask, data, api_format=self.api_format)
        status_map = {
            "pending": TaskStatus.PROCESSING,
            "done": TaskStatus.SUCCEEDED,
            "failed": TaskStatus.FAILED,
            "expired": TaskStatus.EXPIRED,
        }
        status = status_map[task.status]

        output = None
        task_error = None
        if status == TaskStatus.SUCCEEDED:
            if task.video is None:
                raise invalid_response_error(self.api_format, "成功任务缺少 video 视频结果。")
            if task.video.respect_moderation is False:
                status = TaskStatus.FAILED
                task_error = VideoTaskError(
                    code="moderationBlocked",
                    message="生成视频未通过上游安全审核。",
                )
            else:
                if task.video.url is None:
                    raise invalid_response_error(self.api_format, "成功任务缺少视频 URL。")
                output = VideoOutput(
                    video_url=str(task.video.url),
                    duration=task.video.duration,
                    respect_moderation=task.video.respect_moderation,
                )

        if status == TaskStatus.FAILED and task_error is None and task.error is not None:
            task_error = VideoTaskError(
                code=task.error.code,
                message=task.error.message,
            )

        return VideoTaskResult(
            task_id=task_id,
            api_format=self.api_format,
            status=status,
            progress=task.progress,
            model_id=task.model,
            output=output,
            usage=Usage(**task.usage.model_dump()) if task.usage else None,
            error=task_error,
        )
