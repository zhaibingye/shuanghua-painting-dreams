import asyncio
import logging
from collections.abc import AsyncIterator
from copy import deepcopy
from typing import Annotated, Any
from uuid import uuid4

import orjson
from fastapi import APIRouter, Body
from fastapi.responses import StreamingResponse

from app.api.dependencies import (
    ImageServiceDependency,
    RequestIdDependency,
    UpstreamApiKey,
)
from app.application.image_service import ImageService
from app.domain.enums import ErrorCategory
from app.domain.errors import ApplicationError
from app.domain.models import Usage
from app.schemas.image_turns import ImageConversationTurnRequest
from app.schemas.images import ImageEditRequest, ImageGenerationRequest, ImageOperationResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/images", tags=["images"])


@router.post("/generations", response_model=ImageOperationResponse)
async def generate_image(
    request: Annotated[ImageGenerationRequest, Body()],
    api_key: UpstreamApiKey,
    request_id: RequestIdDependency,
    service: ImageServiceDependency,
) -> ImageOperationResponse:
    return await service.generate(request, api_key, request_id)


@router.post("/edits", response_model=ImageOperationResponse)
async def edit_image(
    request: Annotated[ImageEditRequest, Body()],
    api_key: UpstreamApiKey,
    request_id: RequestIdDependency,
    service: ImageServiceDependency,
) -> ImageOperationResponse:
    return await service.edit(request, api_key, request_id)


@router.post("/conversation-turns/stream")
async def stream_image_conversation_turn(
    request: Annotated[ImageConversationTurnRequest, Body()],
    api_key: UpstreamApiKey,
    request_id: RequestIdDependency,
    service: ImageServiceDependency,
) -> StreamingResponse:
    return StreamingResponse(
        _stream_turn(service, request, api_key, request_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


async def _stream_turn(
    service: ImageService,
    request: ImageConversationTurnRequest,
    api_key: str,
    request_id: str,
) -> AsyncIterator[bytes]:
    image_ids: dict[int, str] = {}
    final_usage: Usage | None = None
    yield _sse(
        "turn.started",
        {
            "requestId": request_id,
            "apiFormat": request.api_format.value,
        },
    )
    try:
        async for chunk in service.stream_turn(request, api_key):
            if chunk.kind == "partial" and chunk.image is not None:
                yield _sse(
                    "image.partial",
                    {
                        "index": chunk.image_index,
                        "partialImageIndex": chunk.partial_image_index,
                        "mimeType": chunk.image.mime_type,
                        "base64Data": chunk.image.base64_data,
                        "providerMetadata": chunk.provider_metadata,
                    },
                )
            elif chunk.kind == "completed" and chunk.image is not None:
                image_id = f"img_{uuid4().hex}"
                image_ids[chunk.image_index] = image_id
                final_usage = chunk.usage or final_usage
                yield _sse(
                    "image.completed",
                    {
                        "index": chunk.image_index,
                        "image": {
                            "id": image_id,
                            "mimeType": chunk.image.mime_type,
                            "base64Data": chunk.image.base64_data,
                            "revisedPrompt": chunk.image.revised_prompt,
                            "thought": chunk.image.is_thought,
                            "thoughtSignature": chunk.image.thought_signature,
                        },
                        "providerMetadata": chunk.provider_metadata,
                    },
                )
            elif chunk.kind == "text_delta" and chunk.text_delta:
                yield _sse("text.delta", {"delta": chunk.text_delta})
            elif chunk.kind == "done":
                final_usage = chunk.usage or final_usage
                yield _sse(
                    "turn.completed",
                    {
                        "requestId": request_id,
                        "usage": _usage_payload(final_usage),
                        "providerState": _resolve_provider_state(
                            chunk.provider_state,
                            image_ids,
                        ),
                    },
                )
    except asyncio.CancelledError:
        raise
    except ApplicationError as error:
        yield _sse(
            "turn.failed",
            {
                "error": {
                    "code": error.code,
                    "category": error.category.value,
                    "message": error.message,
                    "retryable": error.retryable,
                    "apiFormat": error.api_format.value if error.api_format else None,
                    "upstreamStatus": error.upstream_status,
                    "requestId": request_id,
                    "details": error.details or None,
                }
            },
        )
    except Exception:
        logger.exception("image conversation stream failed", extra={"request_id": request_id})
        yield _sse(
            "turn.failed",
            {
                "error": {
                    "code": "internalError",
                    "category": ErrorCategory.INTERNAL.value,
                    "message": "服务器处理流式图片请求时发生内部错误。",
                    "retryable": False,
                    "requestId": request_id,
                }
            },
        )


def _resolve_provider_state(
    provider_state: dict[str, Any] | None,
    image_ids: dict[int, str],
) -> dict[str, Any] | None:
    if provider_state is None:
        return None
    resolved = deepcopy(provider_state)
    if resolved.get("type") != "gemini":
        return resolved
    parts = resolved.get("parts")
    if not isinstance(parts, list):
        return resolved
    for part in parts:
        if not isinstance(part, dict) or part.get("kind") != "image":
            continue
        image_index = part.pop("imageIndex", None)
        if isinstance(image_index, int):
            part["imageId"] = image_ids.get(image_index)
    return resolved


def _usage_payload(usage: Usage | None) -> dict[str, int | None] | None:
    if usage is None:
        return None
    return {
        "inputTokens": usage.input_tokens,
        "outputTokens": usage.output_tokens,
        "totalTokens": usage.total_tokens,
        "costInUsdTicks": usage.cost_in_usd_ticks,
    }


def _sse(event: str, data: dict[str, Any]) -> bytes:
    serialized = orjson.dumps(data).decode()
    return f"event: {event}\ndata: {serialized}\n\n".encode()
