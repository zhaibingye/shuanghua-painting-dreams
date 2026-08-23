from typing import Annotated

from fastapi import APIRouter, Body

from app.api.dependencies import (
    RequestIdDependency,
    UpstreamApiKey,
    VideoServiceDependency,
)
from app.schemas.videos import (
    VideoCreationResponse,
    VideoGenerationRequest,
    VideoTaskStatusRequest,
    VideoTaskStatusResponse,
    XAIVideoExtensionRequest,
)

router = APIRouter(tags=["videos"])


@router.post("/videos/generations", response_model=VideoCreationResponse)
async def create_video(
    request: Annotated[VideoGenerationRequest, Body()],
    api_key: UpstreamApiKey,
    request_id: RequestIdDependency,
    service: VideoServiceDependency,
) -> VideoCreationResponse:
    return await service.create(request, api_key, request_id)


@router.post("/videos/extensions", response_model=VideoCreationResponse)
async def extend_video(
    request: XAIVideoExtensionRequest,
    api_key: UpstreamApiKey,
    request_id: RequestIdDependency,
    service: VideoServiceDependency,
) -> VideoCreationResponse:
    return await service.extend(request, api_key, request_id)


@router.post("/video-tasks/status", response_model=VideoTaskStatusResponse)
async def video_task_status(
    request: VideoTaskStatusRequest,
    api_key: UpstreamApiKey,
    request_id: RequestIdDependency,
    service: VideoServiceDependency,
) -> VideoTaskStatusResponse:
    return await service.status(request, api_key, request_id)
