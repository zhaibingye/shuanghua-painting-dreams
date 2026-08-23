from collections.abc import AsyncIterator
from uuid import uuid4

from app.domain.capabilities import validate_openai_image_request
from app.domain.enums import ErrorCategory
from app.domain.errors import ApplicationError
from app.domain.models import ImageResult, ImageStreamChunk, Usage
from app.providers.registry import ProviderRegistry
from app.schemas.common import UsageResponse
from app.schemas.image_turns import (
    GeminiImageTurnRequest,
    ImageConversationTurnRequest,
    OpenAIImageTurnRequest,
    OpenAIResponsesImageTurnRequest,
    XAIImageTurnRequest,
)
from app.schemas.images import (
    GeminiImageEditRequest,
    GeminiImageGenerationRequest,
    GeneratedImageResponse,
    ImageEditRequest,
    ImageGenerationRequest,
    ImageOperationResponse,
    OpenAIImageEditOptions,
    OpenAIImageEditRequest,
    OpenAIImageGenerationRequest,
    XAIImageEditRequest,
    XAIImageGenerationRequest,
)


class ImageService:
    def __init__(self, providers: ProviderRegistry) -> None:
        self._providers = providers

    async def generate(
        self, request: ImageGenerationRequest, api_key: str, request_id: str
    ) -> ImageOperationResponse:
        if isinstance(request, GeminiImageGenerationRequest):
            result = await self._providers.google_gemini_image.generate(request, api_key)
        elif isinstance(request, OpenAIImageGenerationRequest):
            validate_openai_image_request(request)
            result = await self._providers.openai_image.generate(request, api_key)
        elif isinstance(request, XAIImageGenerationRequest):
            result = await self._providers.xai_image.generate(request, api_key)
        else:
            raise _unsupported_request()
        return _to_response(result, request_id)

    async def edit(
        self, request: ImageEditRequest, api_key: str, request_id: str
    ) -> ImageOperationResponse:
        if isinstance(request, GeminiImageEditRequest):
            result = await self._providers.google_gemini_image.edit(request, api_key)
        elif isinstance(request, OpenAIImageEditRequest):
            validate_openai_image_request(request)
            result = await self._providers.openai_image.edit(request, api_key)
        elif isinstance(request, XAIImageEditRequest):
            result = await self._providers.xai_image.edit(request, api_key)
        else:
            raise _unsupported_request()
        return _to_response(result, request_id)

    async def stream_turn(
        self,
        request: ImageConversationTurnRequest,
        api_key: str,
    ) -> AsyncIterator[ImageStreamChunk]:
        if isinstance(request, OpenAIImageTurnRequest):
            validate_openai_image_request(request)
            if request.source_images:
                edit_request = OpenAIImageEditRequest(
                    api_format=request.api_format,
                    base_url=request.base_url,
                    model_id=request.model_id,
                    prompt=request.prompt,
                    images=request.source_images,
                    mask=request.mask,
                    options=OpenAIImageEditOptions.model_validate(
                        request.options.model_dump(exclude={"moderation", "partial_images"})
                    ),
                )
                result = await self._providers.openai_image.edit(edit_request, api_key)
                async for chunk in _result_chunks(result):
                    yield chunk
            else:
                async for chunk in self._providers.openai_image.stream_generate(request, api_key):
                    yield chunk
            return
        if isinstance(request, OpenAIResponsesImageTurnRequest):
            async for chunk in self._providers.openai_responses_image.stream_turn(request, api_key):
                yield chunk
            return
        if isinstance(request, GeminiImageTurnRequest):
            result = await self._providers.google_gemini_image.conversation(request, api_key)
            async for chunk in _result_chunks(result):
                yield chunk
            return
        if isinstance(request, XAIImageTurnRequest):
            if request.source_images:
                xai_edit = XAIImageEditRequest(
                    api_format=request.api_format,
                    base_url=request.base_url,
                    model_id=request.model_id,
                    prompt=request.prompt,
                    images=request.source_images,
                    options=request.options,
                )
                result = await self._providers.xai_image.edit(xai_edit, api_key)
            else:
                xai_generation = XAIImageGenerationRequest(
                    api_format=request.api_format,
                    base_url=request.base_url,
                    model_id=request.model_id,
                    prompt=request.prompt,
                    options=request.options,
                )
                result = await self._providers.xai_image.generate(xai_generation, api_key)
            async for chunk in _result_chunks(result):
                yield chunk
            return
        raise _unsupported_request()


async def _result_chunks(result: ImageResult) -> AsyncIterator[ImageStreamChunk]:
    for text in result.text_outputs:
        yield ImageStreamChunk(kind="text_delta", text_delta=text)
    for index, image in enumerate(result.images):
        yield ImageStreamChunk(kind="completed", image=image, image_index=index)
    yield ImageStreamChunk(
        kind="done",
        usage=result.usage,
        provider_state=result.provider_state,
    )


def _to_response(result: ImageResult, request_id: str) -> ImageOperationResponse:
    return ImageOperationResponse(
        request_id=request_id,
        images=[
            GeneratedImageResponse(
                id=f"img_{uuid4().hex}",
                mime_type=image.mime_type,
                base64_data=image.base64_data,
                revised_prompt=image.revised_prompt,
            )
            for image in result.images
            if not image.is_thought
        ],
        text_outputs=result.text_outputs,
        usage=_usage_response(result.usage),
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


def _unsupported_request() -> ApplicationError:
    return ApplicationError(
        code="unsupportedImageRequest",
        category=ErrorCategory.CAPABILITY_NOT_SUPPORTED,
        message="当前图片请求格式不受支持。",
        http_status=422,
    )
