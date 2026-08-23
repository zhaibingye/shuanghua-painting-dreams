from collections.abc import Mapping
from typing import Any

from app.domain.enums import ApiFormat
from app.domain.models import GeneratedImage, ImageResult, Usage
from app.infrastructure.config import Settings
from app.infrastructure.url_builder import build_upstream_url
from app.providers.base import (
    ProviderTransport,
    bearer_headers,
    ensure_success,
    image_asset_value,
    invalid_response_error,
)
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
        raw_images = data.get("data")
        if not isinstance(raw_images, list):
            raise invalid_response_error(self.api_format, "xAI 响应缺少 data 图片列表。")

        images: list[GeneratedImage] = []
        for item in raw_images:
            if not isinstance(item, Mapping):
                continue
            encoded = item.get("b64_json")
            mime_type = item.get("mime_type")
            if isinstance(encoded, str) and encoded:
                images.append(
                    GeneratedImage(
                        mime_type=mime_type if isinstance(mime_type, str) else "image/jpeg",
                        base64_data=encoded,
                    )
                )
        if not images:
            raise invalid_response_error(self.api_format, "xAI 响应中没有 Base64 图片。")

        usage_data = data.get("usage")
        usage = None
        if isinstance(usage_data, Mapping):
            usage = Usage(
                input_tokens=_optional_int(usage_data.get("input_tokens")),
                output_tokens=_optional_int(usage_data.get("output_tokens")),
                total_tokens=_optional_int(usage_data.get("total_tokens")),
                cost_in_usd_ticks=_optional_int(usage_data.get("cost_in_usd_ticks")),
            )
        return ImageResult(images=images, usage=usage)


def _optional_int(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None
