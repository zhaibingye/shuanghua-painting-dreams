from typing import Annotated, cast

from fastapi import Depends, Request
from fastapi.security import APIKeyHeader

from app.application.image_service import ImageService
from app.application.video_service import VideoService
from app.domain.enums import ErrorCategory
from app.domain.errors import ApplicationError

_api_key_header = APIKeyHeader(name="X-Upstream-API-Key", auto_error=False)


async def require_upstream_api_key(
    value: Annotated[str | None, Depends(_api_key_header)],
) -> str:
    if value is None or not value.strip():
        raise ApplicationError(
            code="apiKeyRequired",
            category=ErrorCategory.AUTHENTICATION,
            message="当前 API 格式没有可用的 API Key。",
            http_status=401,
            retryable=False,
        )
    return value.strip()


def get_image_service(request: Request) -> ImageService:
    return cast(ImageService, request.app.state.image_service)


def get_video_service(request: Request) -> VideoService:
    return cast(VideoService, request.app.state.video_service)


def get_request_id(request: Request) -> str:
    return cast(str, request.state.request_id)


UpstreamApiKey = Annotated[str, Depends(require_upstream_api_key)]
ImageServiceDependency = Annotated[ImageService, Depends(get_image_service)]
VideoServiceDependency = Annotated[VideoService, Depends(get_video_service)]
RequestIdDependency = Annotated[str, Depends(get_request_id)]
