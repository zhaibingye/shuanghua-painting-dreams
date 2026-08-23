from collections.abc import AsyncIterator, Mapping
from typing import Any, Protocol

from yarl import URL

from app.domain.enums import ApiFormat, ErrorCategory
from app.domain.errors import ApplicationError
from app.infrastructure.safe_http import (
    DownloadedContent,
    MultipartForm,
    UpstreamResponse,
    UpstreamSseEvent,
)
from app.infrastructure.upstream_errors import raise_for_upstream_status
from app.schemas.common import DataUrlImageAsset, ImageAsset, UrlImageAsset


class ProviderTransport(Protocol):
    async def request_json(
        self,
        *,
        method: str,
        url: URL,
        headers: dict[str, str],
        payload: dict[str, Any] | None,
        read_timeout: float,
        api_format: ApiFormat,
        retryable: bool = False,
    ) -> UpstreamResponse: ...

    def stream_sse(
        self,
        *,
        method: str,
        url: URL,
        headers: dict[str, str],
        payload: dict[str, Any] | None,
        read_timeout: float,
        api_format: ApiFormat,
        retryable: bool = False,
    ) -> AsyncIterator[UpstreamSseEvent]: ...

    async def request_multipart_json(
        self,
        *,
        method: str,
        url: URL,
        headers: dict[str, str],
        form: MultipartForm,
        read_timeout: float,
        api_format: ApiFormat,
        retryable: bool = False,
    ) -> UpstreamResponse: ...

    def stream_multipart_sse(
        self,
        *,
        method: str,
        url: URL,
        headers: dict[str, str],
        form: MultipartForm,
        read_timeout: float,
        api_format: ApiFormat,
        retryable: bool = False,
    ) -> AsyncIterator[UpstreamSseEvent]: ...

    async def download(
        self,
        *,
        url: URL,
        read_timeout: float,
        max_bytes: int,
        api_format: ApiFormat,
    ) -> DownloadedContent: ...


def bearer_headers(api_key: str, *, stream: bool = False) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {api_key}"}
    if stream:
        headers["Accept"] = "text/event-stream"
    return headers


def gemini_headers(api_key: str) -> dict[str, str]:
    return {"x-goog-api-key": api_key, "Content-Type": "application/json"}


def image_asset_value(asset: ImageAsset) -> str:
    if isinstance(asset, DataUrlImageAsset):
        return asset.data_url
    if isinstance(asset, UrlImageAsset):
        return str(asset.url)
    raise TypeError(f"未知图片输入类型: {type(asset)!r}")


def split_data_url(data_url: str) -> tuple[str, str]:
    header, encoded = data_url.split(",", maxsplit=1)
    mime_type = header.removeprefix("data:").split(";", maxsplit=1)[0].lower()
    return mime_type, encoded.replace("\r", "").replace("\n", "")


def ensure_success(
    response: UpstreamResponse,
    *,
    api_format: ApiFormat,
    retryable: bool = False,
) -> Mapping[str, Any]:
    raise_for_upstream_status(
        status=response.status,
        data=response.data,
        api_format=api_format,
        retryable=retryable,
    )
    if not isinstance(response.data, Mapping):
        raise invalid_response_error(api_format, "上游成功响应不是 JSON 对象。")
    return response.data


def invalid_response_error(api_format: ApiFormat, message: str) -> ApplicationError:
    return ApplicationError(
        code="invalidUpstreamResponse",
        category=ErrorCategory.UPSTREAM_ERROR,
        message=message,
        http_status=502,
        retryable=False,
        api_format=api_format,
    )
