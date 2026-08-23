from app.domain.capabilities import (
    validate_byte_dance_video_request,
    validate_xai_video_request,
    xai_model_supports_extension,
)
from app.domain.enums import ErrorCategory
from app.domain.errors import ApplicationError
from app.domain.models import Usage, VideoTaskResult
from app.providers.registry import ProviderRegistry
from app.schemas.common import UsageResponse
from app.schemas.videos import (
    ByteDanceVideoGenerationRequest,
    CreatedVideoTaskResponse,
    VideoCreationResponse,
    VideoGenerationRequest,
    VideoOutputResponse,
    VideoTaskErrorResponse,
    VideoTaskResponse,
    VideoTaskStatusRequest,
    VideoTaskStatusResponse,
    XAIVideoExtensionRequest,
    XAIVideoGenerationRequest,
)


class VideoService:
    def __init__(self, providers: ProviderRegistry) -> None:
        self._providers = providers

    async def create(
        self, request: VideoGenerationRequest, api_key: str, request_id: str
    ) -> VideoCreationResponse:
        if isinstance(request, ByteDanceVideoGenerationRequest):
            validate_byte_dance_video_request(request)
            task = await self._providers.byte_dance_video.create(request, api_key)
        elif isinstance(request, XAIVideoGenerationRequest):
            validate_xai_video_request(request)
            task = await self._providers.xai_video.create(request, api_key)
        else:
            raise _unsupported_video_request()
        return VideoCreationResponse(
            request_id=request_id,
            task=CreatedVideoTaskResponse(
                task_id=task.task_id,
                api_format=task.api_format,
                operation=task.operation,
                status=task.status,
            ),
        )

    async def extend(
        self, request: XAIVideoExtensionRequest, api_key: str, request_id: str
    ) -> VideoCreationResponse:
        if not xai_model_supports_extension(request.model_id):
            raise ApplicationError(
                code="videoExtensionNotSupported",
                category=ErrorCategory.CAPABILITY_NOT_SUPPORTED,
                message="当前 xAI 视频模型不支持视频续写，请切换为 grok-imagine-video。",
                http_status=422,
                retryable=False,
                api_format=request.api_format,
            )
        task = await self._providers.xai_video.extend(request, api_key)
        return VideoCreationResponse(
            request_id=request_id,
            task=CreatedVideoTaskResponse(
                task_id=task.task_id,
                api_format=task.api_format,
                operation=task.operation,
                status=task.status,
            ),
        )

    async def status(
        self, request: VideoTaskStatusRequest, api_key: str, request_id: str
    ) -> VideoTaskStatusResponse:
        if request.api_format.value == "byteDanceVideo":
            result = await self._providers.byte_dance_video.get_status(
                request.base_url, request.task_id, api_key
            )
        elif request.api_format.value == "xaiVideo":
            result = await self._providers.xai_video.get_status(
                request.base_url, request.task_id, api_key
            )
        else:
            raise _unsupported_video_request()
        return VideoTaskStatusResponse(request_id=request_id, task=_task_response(result))


def _task_response(result: VideoTaskResult) -> VideoTaskResponse:
    output = None
    if result.output is not None:
        output = VideoOutputResponse(
            video_url=result.output.video_url,
            last_frame_url=result.output.last_frame_url,
            duration=result.output.duration,
            respect_moderation=result.output.respect_moderation,
        )
    error = None
    if result.error is not None:
        error = VideoTaskErrorResponse(code=result.error.code, message=result.error.message)
    return VideoTaskResponse(
        task_id=result.task_id,
        api_format=result.api_format,
        status=result.status,
        progress=result.progress,
        model_id=result.model_id,
        output=output,
        usage=_usage_response(result.usage),
        error=error,
    )


def _usage_response(usage: Usage | None) -> UsageResponse | None:
    if usage is None:
        return None
    return UsageResponse(
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        total_tokens=usage.total_tokens,
        cost_in_usd_ticks=usage.cost_in_usd_ticks,
    )


def _unsupported_video_request() -> ApplicationError:
    return ApplicationError(
        code="unsupportedVideoRequest",
        category=ErrorCategory.CAPABILITY_NOT_SUPPORTED,
        message="当前视频请求格式不受支持。",
        http_status=422,
    )
