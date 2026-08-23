from collections.abc import Mapping
from typing import Any

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
    bearer_headers,
    ensure_success,
    image_asset_value,
    invalid_response_error,
)
from app.schemas.videos import XAIVideoExtensionRequest, XAIVideoGenerationRequest


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
        task_id = data.get("request_id")
        if not isinstance(task_id, str) or not task_id:
            raise invalid_response_error(self.api_format, "xAI 视频响应缺少 request_id。")
        return CreatedVideoTask(
            task_id=task_id,
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
        raw_status = data.get("status")
        if not isinstance(raw_status, str):
            raise invalid_response_error(self.api_format, "xAI 视频任务响应缺少状态。")
        status_map = {
            "pending": TaskStatus.PROCESSING,
            "done": TaskStatus.SUCCEEDED,
            "failed": TaskStatus.FAILED,
            "expired": TaskStatus.EXPIRED,
        }
        status = status_map.get(raw_status)
        if status is None:
            raise invalid_response_error(self.api_format, f"未知 xAI 任务状态：{raw_status}")

        progress = _optional_int(data.get("progress"))
        output = None
        task_error = None
        video_data = data.get("video")
        if status == TaskStatus.SUCCEEDED and isinstance(video_data, Mapping):
            respects_moderation = video_data.get("respect_moderation")
            video_url = video_data.get("url")
            if respects_moderation is False or not isinstance(video_url, str) or not video_url:
                status = TaskStatus.FAILED
                task_error = VideoTaskError(
                    code="moderationBlocked",
                    message="生成视频未通过上游安全审核。",
                )
            else:
                output = VideoOutput(
                    video_url=video_url,
                    duration=_optional_float(video_data.get("duration")),
                    respect_moderation=(
                        respects_moderation if isinstance(respects_moderation, bool) else None
                    ),
                )

        error_data = data.get("error")
        if status == TaskStatus.FAILED and task_error is None and isinstance(error_data, Mapping):
            task_error = VideoTaskError(
                code=_optional_str(error_data.get("code")) or "upstreamTaskFailed",
                message=_optional_str(error_data.get("message")) or "xAI 视频任务失败。",
            )

        usage_data = data.get("usage")
        usage = None
        if isinstance(usage_data, Mapping):
            usage = Usage(
                input_tokens=_optional_int(usage_data.get("input_tokens")),
                output_tokens=_optional_int(usage_data.get("output_tokens")),
                total_tokens=_optional_int(usage_data.get("total_tokens")),
                cost_in_usd_ticks=_optional_int(usage_data.get("cost_in_usd_ticks")),
            )

        return VideoTaskResult(
            task_id=task_id,
            api_format=self.api_format,
            status=status,
            progress=progress,
            model_id=_optional_str(data.get("model")),
            output=output,
            usage=usage,
            error=task_error,
        )


def _optional_str(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def _optional_int(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _optional_float(value: object) -> float | None:
    if isinstance(value, int | float) and not isinstance(value, bool):
        return float(value)
    return None
