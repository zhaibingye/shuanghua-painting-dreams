from typing import Any

from app.domain.enums import ApiFormat, ErrorCategory
from app.domain.errors import ApplicationError
from app.domain.image_options import seedream_capabilities, validate_seedream_options
from app.domain.models import ImageResult
from app.infrastructure.config import Settings
from app.providers.base import (
    ProviderTransport,
    bearer_headers,
    ensure_success,
    image_asset_value,
    split_data_url,
)
from app.providers.bytedance_endpoints import byte_dance_endpoints
from app.providers.image_response import parse_generated_images
from app.schemas.common import DataUrlImageAsset, ImageAsset
from app.schemas.image_turns import ByteDanceImageTurnRequest
from app.schemas.images import ByteDanceImageEditRequest, ByteDanceImageGenerationRequest


class ByteDanceImageAdapter:
    api_format = ApiFormat.BYTE_DANCE_IMAGE

    def __init__(self, transport: ProviderTransport, settings: Settings) -> None:
        self._transport = transport
        self._settings = settings

    async def generate(self, request: ByteDanceImageGenerationRequest, api_key: str) -> ImageResult:
        return await self._request(request, [], api_key)

    async def edit(self, request: ByteDanceImageEditRequest, api_key: str) -> ImageResult:
        return await self._request(request, request.images, api_key)

    async def conversation(self, request: ByteDanceImageTurnRequest, api_key: str) -> ImageResult:
        return await self._request(request, request.source_images, api_key)

    async def _request(
        self, request: ByteDanceImageGenerationRequest, images: list[ImageAsset], api_key: str
    ) -> ImageResult:
        options = request.options
        validate_seedream_options(request.model_id, options, len(images))
        if options.layer_decomposition and isinstance(images[0], DataUrlImageAsset):
            mime_type, _ = split_data_url(images[0].data_url)
            if mime_type not in {"image/png", "image/jpeg"}:
                raise ApplicationError(
                    code="capabilityNotSupported",
                    category=ErrorCategory.CAPABILITY_NOT_SUPPORTED,
                    message="图层拆分支持 PNG 和 JPEG 输入图片。",
                    http_status=422,
                    api_format=self.api_format,
                )
        endpoints = byte_dance_endpoints(request.base_url)
        capabilities = seedream_capabilities(request.model_id)
        supports_layers = capabilities is not None and capabilities.layers
        size = options.size
        if options.layer_decomposition and "size" not in options.model_fields_set:
            size = "auto"
        output_format = options.output_format
        if output_format == "auto":
            output_format = (
                "png"
                if supports_layers
                or options.layer_decomposition
                or options.background == "transparent"
                else "jpeg"
            )
        payload: dict[str, Any] = {
            "model": request.model_id,
            "prompt": request.prompt,
            "size": size,
            "watermark": options.watermark,
            "response_format": "b64_json" if endpoints.official else "url",
            "optimize_prompt_options": {"mode": options.optimize_prompt_mode},
        }
        if not supports_layers and not options.layer_decomposition:
            payload["stream"] = False
        if not endpoints.official:
            # Seedream batches use sequential generation options; n stays at 1.
            payload["n"] = 1
        if options.sequential_image_generation == "auto":
            payload["sequential_image_generation"] = "auto"
            payload["sequential_image_generation_options"] = {"max_images": options.max_images}
        if (
            request.model_id.startswith("doubao-seedream-5-")
            or output_format == "png"
            or options.layer_decomposition
        ):
            payload["output_format"] = output_format
        if options.background != "auto":
            payload["background"] = options.background
        if options.layer_decomposition:
            payload["layer_decomposition"] = True
            payload["layer_decomposition_options"] = {
                "max_images": options.layer_max_images,
                "text_recognition": options.layer_text_recognition,
            }
            if not request.prompt:
                del payload["prompt"]
        if options.web_search:
            payload["tools"] = [{"type": "web_search"}]
        if images:
            values = [image_asset_value(image) for image in images]
            payload["image"] = values[0] if len(values) == 1 else values
        response = await self._transport.request_json(
            method="POST",
            url=endpoints.image(editing=bool(images)),
            headers=bearer_headers(api_key),
            payload=payload,
            read_timeout=self._settings.image_read_timeout_seconds,
            api_format=self.api_format,
        )
        return await parse_generated_images(
            ensure_success(response, api_format=self.api_format),
            api_format=self.api_format,
            default_mime_type=f"image/{output_format}",
            transport=self._transport,
            settings=self._settings,
            layer_decomposition=options.layer_decomposition,
        )
