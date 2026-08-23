import base64
import binascii
from collections.abc import AsyncIterator, Mapping
from pathlib import PurePath
from typing import Any

from yarl import URL

from app.domain.enums import ApiFormat, ErrorCategory
from app.domain.errors import ApplicationError
from app.domain.models import GeneratedImage, ImageResult, ImageStreamChunk, Usage
from app.infrastructure.config import Settings
from app.infrastructure.safe_http import MultipartFile, MultipartForm
from app.infrastructure.upstream_errors import build_upstream_error
from app.infrastructure.url_builder import build_upstream_url
from app.providers.base import (
    ProviderTransport,
    bearer_headers,
    ensure_success,
    invalid_response_error,
    split_data_url,
)
from app.schemas.common import DataUrlImageAsset, ImageAsset, UrlImageAsset
from app.schemas.image_turns import OpenAIImageTurnRequest
from app.schemas.images import (
    OpenAIImageBaseOptions,
    OpenAIImageEditOptions,
    OpenAIImageEditRequest,
    OpenAIImageGenerationRequest,
)

_PARTIAL_EVENTS = {"image_generation.partial_image"}
_COMPLETED_EVENTS = {"image_generation.completed"}
_FAILED_EVENTS = {
    "error",
    "upstream_error",
    "image_generation.failed",
}
_SUPPORTED_IMAGE_MIME_TYPES = {"image/png", "image/jpeg", "image/webp"}


class OpenAIImageAdapter:
    api_format = ApiFormat.OPENAI_IMAGE

    def __init__(self, transport: ProviderTransport, settings: Settings) -> None:
        self._transport = transport
        self._settings = settings

    async def generate(self, request: OpenAIImageGenerationRequest, api_key: str) -> ImageResult:
        payload: dict[str, Any] = {
            "model": request.model_id,
            "prompt": request.prompt,
            "response_format": "b64_json",
            "moderation": request.options.moderation,
            **self._generation_options(request.options),
        }
        return await self._request_json(
            request.base_url,
            "/v1/images/generations",
            api_key,
            payload,
            request.options.output_format,
        )

    async def edit(self, request: OpenAIImageEditRequest, api_key: str) -> ImageResult:
        form = await self._edit_form(
            model_id=request.model_id,
            prompt=request.prompt,
            images=request.images,
            mask=request.mask,
            options=request.options,
        )
        response = await self._transport.request_multipart_json(
            method="POST",
            url=build_upstream_url(request.base_url, "/v1/images/edits"),
            headers=bearer_headers(api_key),
            form=form,
            read_timeout=self._settings.image_read_timeout_seconds,
            api_format=self.api_format,
        )
        data = ensure_success(response, api_format=self.api_format)
        return self._parse_response(data, request.options.output_format)

    async def stream_generate(
        self,
        request: OpenAIImageTurnRequest,
        api_key: str,
    ) -> AsyncIterator[ImageStreamChunk]:
        if request.source_images or request.mask is not None:
            raise ValueError("OpenAI 流式生成请求不能包含参考图或遮罩。")

        payload: dict[str, Any] = {
            "model": request.model_id,
            "prompt": request.prompt,
            "response_format": "b64_json",
            "stream": True,
            "partial_images": request.options.partial_images,
            "moderation": request.options.moderation,
            **self._generation_options(request.options),
        }
        events = self._transport.stream_sse(
            method="POST",
            url=build_upstream_url(request.base_url, "/v1/images/generations"),
            headers=bearer_headers(api_key, stream=True),
            payload=payload,
            read_timeout=self._settings.image_read_timeout_seconds,
            api_format=self.api_format,
        )

        completed_count = 0
        final_usage: Usage | None = None
        async for event in events:
            if event.data == "[DONE]":
                continue
            data = event.data if isinstance(event.data, Mapping) else {}
            event_type = _event_type(event.event, data)

            if event_type in _FAILED_EVENTS or (not event_type and "error" in data):
                raise build_upstream_error(
                    status=400,
                    data=data,
                    api_format=self.api_format,
                )

            if not event_type and isinstance(data.get("data"), list):
                result = self._parse_response(data, request.options.output_format)
                final_usage = result.usage or final_usage
                for image in result.images:
                    yield ImageStreamChunk(
                        kind="completed",
                        image=image,
                        image_index=completed_count,
                    )
                    completed_count += 1
                continue

            if event_type in _PARTIAL_EVENTS:
                encoded = data.get("b64_json") or data.get("partial_image_b64")
                if isinstance(encoded, str) and encoded:
                    image_index = _integer(data.get("image_index"))
                    yield ImageStreamChunk(
                        kind="partial",
                        image=GeneratedImage(
                            mime_type=_mime_type(
                                _string(data.get("output_format")) or request.options.output_format
                            ),
                            base64_data=encoded,
                        ),
                        image_index=image_index if image_index is not None else 0,
                        partial_image_index=_integer(data.get("partial_image_index")),
                        provider_metadata={"upstreamEventType": event_type},
                    )
                continue

            if event_type in _COMPLETED_EVENTS:
                encoded = data.get("b64_json") or data.get("result")
                if not isinstance(encoded, str) or not encoded:
                    continue
                image_index = _integer(data.get("image_index"))
                if image_index is None:
                    image_index = completed_count
                completed_count += 1
                usage = _usage(data.get("usage"))
                final_usage = usage or final_usage
                yield ImageStreamChunk(
                    kind="completed",
                    image=GeneratedImage(
                        mime_type=_mime_type(
                            _string(data.get("output_format")) or request.options.output_format
                        ),
                        base64_data=encoded,
                        revised_prompt=_string(data.get("revised_prompt")),
                    ),
                    image_index=image_index,
                    usage=usage,
                    provider_metadata={"upstreamEventType": event_type},
                )

        if completed_count == 0:
            raise invalid_response_error(
                self.api_format,
                "OpenAI 图片生成流中没有最终图片。",
            )
        yield ImageStreamChunk(kind="done", usage=final_usage)

    @staticmethod
    def _generation_options(options: OpenAIImageBaseOptions) -> dict[str, Any]:
        return {
            "n": options.count,
            "size": options.size,
            "quality": options.quality,
            "output_format": options.output_format,
            "output_compression": options.output_compression,
            "background": options.background,
        }

    async def _edit_form(
        self,
        *,
        model_id: str,
        prompt: str,
        images: list[ImageAsset],
        mask: DataUrlImageAsset | None,
        options: OpenAIImageEditOptions,
    ) -> MultipartForm:
        prepared_images = [
            await self._prepare_image(image, index=index) for index, image in enumerate(images)
        ]
        image_field = "image" if len(prepared_images) == 1 else "image[]"
        files = [
            MultipartFile(
                field_name=image_field,
                filename=filename,
                content_type=mime_type,
                data=data,
            )
            for filename, mime_type, data in prepared_images
        ]
        if mask is not None:
            filename, mime_type, data = await self._prepare_image(mask, index=0, mask=True)
            files.append(
                MultipartFile(
                    field_name="mask",
                    filename=filename,
                    content_type=mime_type,
                    data=data,
                )
            )

        fields: list[tuple[str, str]] = [
            ("model", model_id),
            ("prompt", prompt),
            ("n", str(options.count)),
            ("size", options.size),
            ("quality", options.quality),
            ("output_format", options.output_format),
            ("output_compression", str(options.output_compression)),
            ("background", options.background),
            ("response_format", "b64_json"),
        ]
        if options.input_fidelity != "auto":
            fields.append(("input_fidelity", options.input_fidelity))
        return MultipartForm(fields=tuple(fields), files=tuple(files))

    async def _prepare_image(
        self,
        image: ImageAsset,
        *,
        index: int,
        mask: bool = False,
    ) -> tuple[str, str, bytes]:
        declared_mime_type: str | None = None
        suggested_filename: str | None = None
        if isinstance(image, DataUrlImageAsset):
            declared_mime_type, encoded = split_data_url(image.data_url)
            try:
                data = base64.b64decode(encoded, validate=True)
            except (binascii.Error, ValueError) as exc:
                raise _invalid_image_input("参考图片包含无效 Base64 数据。") from exc
            suggested_filename = image.filename
        elif isinstance(image, UrlImageAsset):
            downloaded = await self._transport.download(
                url=URL(str(image.url)),
                read_timeout=self._settings.image_read_timeout_seconds,
                max_bytes=self._settings.max_image_input_bytes,
                api_format=self.api_format,
            )
            data = downloaded.data
            declared_mime_type = downloaded.content_type
            suggested_filename = downloaded.filename
        else:
            raise TypeError(f"未知图片输入类型: {type(image)!r}")

        if not data:
            raise _invalid_image_input("参考图片内容为空。")
        if len(data) > self._settings.max_image_input_bytes:
            raise _invalid_image_input("参考图片超过 50MB 大小限制。")

        detected_mime_type = _detect_image_mime_type(data)
        if detected_mime_type is None:
            raise _invalid_image_input("参考图片不是有效的 PNG、JPEG 或 WebP 文件。")
        if (
            declared_mime_type in _SUPPORTED_IMAGE_MIME_TYPES
            and declared_mime_type != detected_mime_type
        ):
            raise _invalid_image_input("参考图片声明的格式与实际文件格式不一致。")
        if mask and detected_mime_type != "image/png":
            raise _invalid_image_input("OpenAI 遮罩必须是 PNG 图片。")

        fallback_name = (
            "mask.png" if mask else f"reference-{index + 1}{_extension(detected_mime_type)}"
        )
        filename = _safe_filename(suggested_filename, fallback_name, detected_mime_type)
        return filename, detected_mime_type, data

    async def _request_json(
        self,
        base_url: str,
        path: str,
        api_key: str,
        payload: dict[str, Any],
        requested_format: str,
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
        return self._parse_response(data, requested_format)

    def _parse_response(self, data: Mapping[str, Any], requested_format: str) -> ImageResult:
        raw_images = data.get("data")
        if not isinstance(raw_images, list):
            raise invalid_response_error(self.api_format, "OpenAI 响应缺少 data 图片列表。")

        actual_format = data.get("output_format")
        output_format = actual_format if isinstance(actual_format, str) else requested_format
        mime_type = _mime_type(output_format)
        images: list[GeneratedImage] = []
        for item in raw_images:
            if not isinstance(item, Mapping):
                continue
            encoded = item.get("b64_json")
            revised_prompt = item.get("revised_prompt")
            if isinstance(encoded, str) and encoded:
                images.append(
                    GeneratedImage(
                        mime_type=mime_type,
                        base64_data=encoded,
                        revised_prompt=revised_prompt if isinstance(revised_prompt, str) else None,
                    )
                )
        if not images:
            raise invalid_response_error(self.api_format, "OpenAI 响应中没有 Base64 图片。")

        return ImageResult(images=images, usage=_usage(data.get("usage")))


def _event_type(event_name: str | None, data: Mapping[str, Any]) -> str:
    value = data.get("type")
    if isinstance(value, str):
        return value
    return event_name or ""


def _mime_type(output_format: str) -> str:
    if output_format == "jpeg":
        return "image/jpeg"
    if output_format == "webp":
        return "image/webp"
    return "image/png"


def _detect_image_mime_type(data: bytes) -> str | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def _safe_filename(value: str | None, fallback: str, mime_type: str) -> str:
    if not value:
        return fallback
    filename = PurePath(value.replace("\\", "/")).name.strip()
    if not filename or filename in {".", ".."}:
        return fallback
    expected_extension = _extension(mime_type)
    if not filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
        filename = f"{filename}{expected_extension}"
    return filename[:255]


def _extension(mime_type: str) -> str:
    if mime_type == "image/jpeg":
        return ".jpg"
    if mime_type == "image/webp":
        return ".webp"
    return ".png"


def _invalid_image_input(message: str) -> ApplicationError:
    return ApplicationError(
        code="invalidImageInput",
        category=ErrorCategory.VALIDATION,
        message=message,
        http_status=422,
        retryable=False,
        api_format=ApiFormat.OPENAI_IMAGE,
    )


def _usage(value: object) -> Usage | None:
    if not isinstance(value, Mapping):
        return None
    return Usage(
        input_tokens=_integer(value.get("input_tokens")),
        output_tokens=_integer(value.get("output_tokens")),
        total_tokens=_integer(value.get("total_tokens")),
    )


def _integer(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _string(value: object) -> str | None:
    return value if isinstance(value, str) and value else None
