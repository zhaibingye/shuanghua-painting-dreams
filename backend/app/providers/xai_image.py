from collections.abc import Mapping
from typing import Any

from app.domain.enums import ApiFormat
from app.domain.models import ImageResult
from app.infrastructure.config import Settings
from app.infrastructure.url_builder import build_upstream_url
from app.providers.base import (
    ProviderTransport,
    bearer_headers,
    ensure_success,
    image_asset_value,
)
from app.providers.image_response import parse_base64_images
from app.schemas.images import XAIImageEditRequest, XAIImageGenerationRequest, XAIImageOptions


class XAIImageAdapter:
    api_format = ApiFormat.XAI_IMAGE

    def __init__(self, transport: ProviderTransport, settings: Settings) -> None:
        self._transport = transport
        self._settings = settings

    async def generate(self, request: XAIImageGenerationRequest, api_key: str) -> ImageResult:
        payload: dict[str, Any] = {
            "model": request.model_id,
            "prompt": request.prompt,
            "response_format": "b64_json",
            **self._options(request.options),
        }
        return await self._request(request.base_url, "/v1/images/generations", api_key, payload)

    async def edit(self, request: XAIImageEditRequest, api_key: str) -> ImageResult:
        payload: dict[str, Any] = {
            "model": request.model_id,
            "prompt": request.prompt,
            "response_format": "b64_json",
            **self._options(request.options),
        }
        if len(request.images) == 1:
            payload["image"] = {"url": image_asset_value(request.images[0])}
        else:
            payload["images"] = [{"url": image_asset_value(image)} for image in request.images]
        return await self._request(request.base_url, "/v1/images/edits", api_key, payload)

    @staticmethod
    def _options(options: XAIImageOptions) -> dict[str, Any]:
        return {
            "n": options.count,
            "aspect_ratio": options.aspect_ratio,
            "resolution": options.resolution,
            "quality": options.quality,
        }

    async def _request(
        self,
        base_url: str,
        path: str,
        api_key: str,
        payload: dict[str, Any],
    ) -> ImageResult:
        response = await self._transport.request_json(
            method="POST",
            url=build_upstream_url(base_url, path),
            headers=bearer_headers(api_key),
            payload=payload,
            read_timeout=self._settings.image_read_timeout_seconds,
            api_format=self.api_format,
        )
        data = ensure_success(response, api_format=self.api_format)
        return self._parse_response(data)

    def _parse_response(self, data: Mapping[str, Any]) -> ImageResult:
        return parse_base64_images(data, api_format=self.api_format, default_mime_type="image/jpeg")
