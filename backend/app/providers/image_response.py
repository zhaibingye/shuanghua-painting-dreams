import base64
from collections.abc import Mapping
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from yarl import URL

from app.domain.enums import ApiFormat
from app.domain.models import GeneratedImage, ImageResult, Usage
from app.infrastructure.config import Settings
from app.infrastructure.upstream_errors import build_upstream_error
from app.providers.base import ProviderTransport, invalid_response_error
from app.providers.image_content import detect_image_mime_type
from app.schemas.common import PublicHttpUrl


class ImageMetadata(BaseModel):
    mime_type: str | None = None
    output_format: str | None = None
    revised_prompt: str | None = None


class ImageData(ImageMetadata):
    b64_json: str = Field(min_length=1)


class UrlImageData(ImageMetadata):
    url: PublicHttpUrl


class ImageFailureDetail(BaseModel):
    message: str = "图片生成失败"


class ImageFailure(BaseModel):
    error: ImageFailureDetail


class ImageUsage(BaseModel):
    model_config = ConfigDict(strict=True)
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None
    cost_in_usd_ticks: int | None = None


class ImageResponse(BaseModel):
    data: list[ImageData | UrlImageData | ImageFailure] = Field(min_length=1)
    usage: ImageUsage | None = None


def parse_base64_images(
    data: Mapping[str, Any], *, api_format: ApiFormat, default_mime_type: str
) -> ImageResult:
    response = _parse_response(data, api_format)
    images: list[GeneratedImage] = []
    for item in response.data:
        if isinstance(item, ImageData):
            images.append(_base64_image(item, default_mime_type))
        elif isinstance(item, UrlImageData):
            raise invalid_response_error(api_format, "上游未按请求返回 Base64 图片。")
    return _result(response, images, api_format)


async def parse_generated_images(
    data: Mapping[str, Any],
    *,
    api_format: ApiFormat,
    default_mime_type: str,
    transport: ProviderTransport,
    settings: Settings,
) -> ImageResult:
    response = _parse_response(data, api_format)
    images: list[GeneratedImage] = []
    for item in response.data:
        if isinstance(item, ImageData):
            images.append(_base64_image(item, default_mime_type))
        elif isinstance(item, UrlImageData):
            downloaded = await transport.download(
                url=URL(str(item.url), encoded=True),
                read_timeout=settings.image_read_timeout_seconds,
                max_bytes=settings.max_image_input_bytes,
                api_format=api_format,
            )
            mime_type = detect_image_mime_type(downloaded.data)
            if mime_type is None:
                raise invalid_response_error(api_format, "下载的图片不是 PNG、JPEG 或 WebP 文件。")
            images.append(
                GeneratedImage(
                    mime_type=mime_type,
                    base64_data=base64.b64encode(downloaded.data).decode("ascii"),
                    revised_prompt=item.revised_prompt,
                )
            )
    return _result(response, images, api_format)


def _parse_response(data: Mapping[str, Any], api_format: ApiFormat) -> ImageResponse:
    if data.get("error"):
        raise build_upstream_error(status=400, data=data, api_format=api_format)
    try:
        return ImageResponse.model_validate(data)
    except ValidationError as exc:
        raise invalid_response_error(api_format, "上游图片响应不符合接口契约。") from exc


def _base64_image(item: ImageData, default_mime_type: str) -> GeneratedImage:
    return GeneratedImage(
        mime_type=item.mime_type
        or (
            "image/svg+xml"
            if item.output_format == "svg"
            else f"image/{item.output_format}"
            if item.output_format
            else default_mime_type
        ),
        base64_data=item.b64_json,
        revised_prompt=item.revised_prompt,
    )


def _result(
    response: ImageResponse, images: list[GeneratedImage], api_format: ApiFormat
) -> ImageResult:
    errors = [item.error.message for item in response.data if isinstance(item, ImageFailure)]
    if not images:
        raise invalid_response_error(api_format, "；".join(errors) or "上游没有返回可用图片。")
    return ImageResult(
        images=images,
        text_outputs=[f"部分图片生成失败：{message}" for message in errors],
        usage=Usage(**response.usage.model_dump()) if response.usage else None,
    )
