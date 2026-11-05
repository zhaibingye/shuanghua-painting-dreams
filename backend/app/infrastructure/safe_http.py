import codecs
import logging
import re
import socket
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from http import HTTPStatus
from typing import Any

import aiohttp
import orjson
from yarl import URL

from app.domain.enums import ApiFormat, ErrorCategory
from app.domain.errors import ApplicationError, SecurityError
from app.infrastructure.config import Settings
from app.infrastructure.safe_resolver import PublicNetworkResolver, validate_literal_host
from app.infrastructure.upstream_errors import raise_for_upstream_status
from app.infrastructure.url_builder import validate_http_url

logger = logging.getLogger(__name__)


@dataclass(slots=True, frozen=True)
class UpstreamResponse:
    status: int
    data: Any
    headers: dict[str, str]


@dataclass(slots=True, frozen=True)
class UpstreamSseEvent:
    event: str | None
    data: Any
    event_id: str | None = None


@dataclass(slots=True, frozen=True)
class MultipartFile:
    field_name: str
    filename: str
    content_type: str
    data: bytes


@dataclass(slots=True, frozen=True)
class MultipartForm:
    fields: tuple[tuple[str, str], ...]
    files: tuple[MultipartFile, ...]


@dataclass(slots=True, frozen=True)
class DownloadedContent:
    data: bytes
    content_type: str | None
    filename: str | None


class SafeHttpTransport:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._session: aiohttp.ClientSession | None = None

    async def start(self) -> None:
        if self._session is not None:
            return
        connector = aiohttp.TCPConnector(
            resolver=PublicNetworkResolver(),
            use_dns_cache=False,
            ttl_dns_cache=0,
            family=socket.AF_UNSPEC,
            limit=self._settings.max_connections,
            limit_per_host=0,
        )
        self._session = aiohttp.ClientSession(
            connector=connector,
            trust_env=False,
            auto_decompress=True,
            json_serialize=lambda value: orjson.dumps(value).decode(),
        )

    async def close(self) -> None:
        if self._session is not None:
            await self._session.close()
            self._session = None

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
    ) -> UpstreamResponse:
        body = orjson.dumps(payload) if payload is not None else None
        request_headers = dict(headers)
        if body is not None:
            request_headers.setdefault("Content-Type", "application/json")
        async with self._request(
            method=method,
            url=url,
            headers=request_headers,
            body=body,
            read_timeout=read_timeout,
            api_format=api_format,
            retryable=retryable,
        ) as response:
            return UpstreamResponse(
                status=response.status,
                data=await self._read_json(response, api_format, retryable),
                headers=dict(response.headers.items()),
            )

    async def stream_sse(
        self,
        *,
        method: str,
        url: URL,
        headers: dict[str, str],
        payload: dict[str, Any] | None,
        read_timeout: float,
        api_format: ApiFormat,
        retryable: bool = False,
    ) -> AsyncIterator[UpstreamSseEvent]:
        body = orjson.dumps(payload) if payload is not None else None
        request_headers = dict(headers)
        request_headers.setdefault("Accept", "text/event-stream")
        if body is not None:
            request_headers.setdefault("Content-Type", "application/json")
        async with self._request(
            method=method,
            url=url,
            headers=request_headers,
            body=body,
            read_timeout=read_timeout,
            api_format=api_format,
            retryable=retryable,
        ) as response:
            async for event in self._stream_response(response, api_format, retryable):
                yield event

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
    ) -> UpstreamResponse:
        async with self._request(
            method=method,
            url=url,
            headers=headers,
            body=form,
            read_timeout=read_timeout,
            api_format=api_format,
            retryable=retryable,
        ) as response:
            return UpstreamResponse(
                status=response.status,
                data=await self._read_json(response, api_format, retryable),
                headers=dict(response.headers.items()),
            )

    async def stream_multipart_sse(
        self,
        *,
        method: str,
        url: URL,
        headers: dict[str, str],
        form: MultipartForm,
        read_timeout: float,
        api_format: ApiFormat,
        retryable: bool = False,
    ) -> AsyncIterator[UpstreamSseEvent]:
        request_headers = {"Accept": "text/event-stream", **headers}
        async with self._request(
            method=method,
            url=url,
            headers=request_headers,
            body=form,
            read_timeout=read_timeout,
            api_format=api_format,
            retryable=retryable,
        ) as response:
            async for event in self._stream_response(response, api_format, retryable):
                yield event

    async def download(
        self,
        *,
        url: URL,
        read_timeout: float,
        max_bytes: int,
        api_format: ApiFormat,
    ) -> DownloadedContent:
        async with self._request(
            method="GET",
            url=url,
            headers={"Accept": "image/png,image/jpeg,image/webp"},
            body=None,
            read_timeout=read_timeout,
            api_format=api_format,
            media_download=True,
        ) as response:
            if not 200 <= response.status < 300:
                data = await self._read_json(response, api_format, False)
                raise_for_upstream_status(
                    status=response.status,
                    data=data,
                    api_format=api_format,
                )
            if response.content_length is not None and response.content_length > max_bytes:
                raise _image_download_too_large(api_format)
            body = bytearray()
            async for chunk in response.content.iter_chunked(1024 * 1024):
                body.extend(chunk)
                if len(body) > max_bytes:
                    raise _image_download_too_large(api_format)
            content_type = response.headers.get("Content-Type")
            return DownloadedContent(
                data=bytes(body),
                content_type=content_type.split(";", maxsplit=1)[0].strip().lower()
                if content_type
                else None,
                filename=response.url.name or None,
            )

    @asynccontextmanager
    async def _request(
        self,
        *,
        method: str,
        url: URL,
        headers: dict[str, str],
        body: bytes | MultipartForm | None,
        read_timeout: float,
        api_format: ApiFormat,
        retryable: bool = False,
        media_download: bool = False,
    ) -> AsyncIterator[aiohttp.ClientResponse]:
        if self._session is None:
            raise RuntimeError("SafeHttpTransport 尚未启动")
        current_url = self._validate_full_url(url)
        started = time.perf_counter()
        redirect_count = 0
        try:
            while True:
                async with self._session.request(
                    method.upper(),
                    current_url,
                    headers=headers,
                    data=_aiohttp_form(body) if isinstance(body, MultipartForm) else body,
                    timeout=self._timeout(read_timeout),
                    allow_redirects=False,
                ) as response:
                    redirected = (
                        self._download_redirect_target(
                            current_url,
                            response,
                            redirect_count,
                            api_format,
                        )
                        if media_download
                        else self._redirect_target(
                            current_url,
                            response,
                            redirect_count,
                            api_format,
                            retryable,
                        )
                    )
                    if redirected is not None:
                        current_url = redirected
                        redirect_count += 1
                        continue
                    yield response
                    self._log_completion(started, api_format, current_url, response.status)
                    return
        except TimeoutError as exc:
            raise self._timeout_error(api_format, retryable) from exc
        except (aiohttp.ClientError, OSError) as exc:
            raise self._connection_error(exc, api_format, retryable) from exc

    async def _stream_response(
        self,
        response: aiohttp.ClientResponse,
        api_format: ApiFormat,
        retryable: bool,
    ) -> AsyncIterator[UpstreamSseEvent]:
        if not 200 <= response.status < 300:
            data = await self._read_json(response, api_format, retryable)
            raise_for_upstream_status(
                status=response.status,
                data=data,
                api_format=api_format,
                retryable=retryable,
            )
        if _is_event_stream(response.headers.get("Content-Type")):
            async for event in self._iter_sse(response, api_format):
                yield event
        else:
            yield UpstreamSseEvent(
                event=None,
                data=await self._read_json(response, api_format, retryable),
            )

    def _timeout(self, read_timeout: float) -> aiohttp.ClientTimeout:
        return aiohttp.ClientTimeout(
            total=None,
            connect=self._settings.pool_timeout_seconds,
            sock_connect=self._settings.connect_timeout_seconds,
            sock_read=read_timeout,
        )

    def _download_redirect_target(
        self,
        current_url: URL,
        response: aiohttp.ClientResponse,
        redirect_count: int,
        api_format: ApiFormat,
    ) -> URL | None:
        if response.status not in {301, 302, 303, 307, 308} or "Location" not in response.headers:
            return None
        if redirect_count >= self._settings.max_redirects:
            raise ApplicationError(
                code="tooManyRedirects",
                category=ErrorCategory.UPSTREAM_ERROR,
                message="参考图片重定向次数过多。",
                http_status=502,
                retryable=False,
                api_format=api_format,
                upstream_status=response.status,
            )
        try:
            return self._validate_full_url(
                current_url.join(URL(response.headers["Location"], encoded=True))
            )
        except ValueError as exc:
            raise SecurityError("参考图片返回了无效重定向地址。") from exc

    def _redirect_target(
        self,
        current_url: URL,
        response: aiohttp.ClientResponse,
        redirect_count: int,
        api_format: ApiFormat,
        retryable: bool,
    ) -> URL | None:
        if response.status in {307, 308} and "Location" in response.headers:
            if redirect_count >= self._settings.max_redirects:
                raise ApplicationError(
                    code="tooManyRedirects",
                    category=ErrorCategory.UPSTREAM_ERROR,
                    message="上游 API 重定向次数过多。",
                    http_status=502,
                    retryable=retryable,
                    api_format=api_format,
                    upstream_status=response.status,
                )
            return self._validate_redirect(current_url, response.headers["Location"])
        if response.status in {301, 302, 303} and "Location" in response.headers:
            raise ApplicationError(
                code="unsafeUpstreamRedirect",
                category=ErrorCategory.UPSTREAM_ERROR,
                message="上游 API 返回了会改变请求语义的重定向。",
                http_status=502,
                retryable=retryable,
                api_format=api_format,
                upstream_status=response.status,
            )
        return None

    async def _iter_sse(
        self,
        response: aiohttp.ClientResponse,
        api_format: ApiFormat,
    ) -> AsyncIterator[UpstreamSseEvent]:
        decoder = codecs.getincrementaldecoder("utf-8")()
        buffer = ""
        total_bytes = 0

        async for chunk in response.content.iter_any():
            total_bytes += len(chunk)
            if total_bytes > self._settings.max_json_response_bytes:
                raise ApplicationError(
                    code="upstreamResponseTooLarge",
                    category=ErrorCategory.UPSTREAM_ERROR,
                    message="上游流式响应超过服务器允许的大小。",
                    http_status=502,
                    retryable=False,
                    api_format=api_format,
                    upstream_status=response.status,
                )
            buffer += decoder.decode(chunk)
            match = re.search(r"\r?\n\r?\n", buffer)
            while match is not None:
                block = buffer[: match.start()]
                buffer = buffer[match.end() :]
                event = _parse_sse_block(block)
                if event is not None:
                    yield event
                match = re.search(r"\r?\n\r?\n", buffer)

        buffer += decoder.decode(b"", final=True)
        event = _parse_sse_block(buffer)
        if event is not None:
            yield event

    def _validate_full_url(self, url: URL) -> URL:
        validated = validate_http_url(url)
        if validated.host is not None:
            validate_literal_host(validated.host)
        return validated

    def _validate_redirect(self, current_url: URL, location: str) -> URL:
        try:
            redirect_url = current_url.join(URL(location, encoded=True))
        except ValueError as exc:
            raise SecurityError("上游返回了无效重定向地址。") from exc
        validated = self._validate_full_url(redirect_url)
        if validated.origin() != current_url.origin():
            raise SecurityError(
                "上游重定向不能改变协议、主机或端口。",
                code="crossOriginRedirectBlocked",
            )
        return validated

    async def _read_json(
        self,
        response: aiohttp.ClientResponse,
        api_format: ApiFormat,
        retryable: bool,
    ) -> Any:
        content_length = response.content_length
        if content_length is not None and content_length > self._settings.max_json_response_bytes:
            raise ApplicationError(
                code="upstreamResponseTooLarge",
                category=ErrorCategory.UPSTREAM_ERROR,
                message="上游 API 响应超过服务器允许的大小。",
                http_status=502,
                retryable=False,
                api_format=api_format,
                upstream_status=response.status,
            )

        body = bytearray()
        async for chunk in response.content.iter_chunked(1024 * 1024):
            body.extend(chunk)
            if len(body) > self._settings.max_json_response_bytes:
                raise ApplicationError(
                    code="upstreamResponseTooLarge",
                    category=ErrorCategory.UPSTREAM_ERROR,
                    message="上游 API 响应超过服务器允许的大小。",
                    http_status=502,
                    retryable=False,
                    api_format=api_format,
                    upstream_status=response.status,
                )

        if not body:
            return {}
        try:
            return orjson.loads(body)
        except orjson.JSONDecodeError as exc:
            try:
                reason = HTTPStatus(response.status).phrase
            except ValueError:
                reason = "Unknown"
            raise ApplicationError(
                code="invalidUpstreamJson",
                category=ErrorCategory.UPSTREAM_ERROR,
                message=f"上游 API 返回了非 JSON 响应（{response.status} {reason}）。",
                http_status=502,
                retryable=retryable,
                api_format=api_format,
                upstream_status=response.status,
            ) from exc

    @staticmethod
    def _timeout_error(api_format: ApiFormat, retryable: bool) -> ApplicationError:
        return ApplicationError(
            code="upstreamTimeout",
            category=ErrorCategory.UPSTREAM_TIMEOUT,
            message="等待上游 API 响应超时。",
            http_status=504,
            retryable=retryable,
            api_format=api_format,
        )

    @staticmethod
    def _connection_error(
        error: BaseException,
        api_format: ApiFormat,
        retryable: bool,
    ) -> ApplicationError | SecurityError:
        security_error = _find_security_error(error)
        if security_error is not None:
            return security_error
        return ApplicationError(
            code="upstreamNetworkError",
            category=ErrorCategory.NETWORK,
            message="无法连接到上游 API。",
            http_status=502,
            retryable=retryable,
            api_format=api_format,
        )

    @staticmethod
    def _log_completion(
        started: float,
        api_format: ApiFormat,
        url: URL,
        status: int,
    ) -> None:
        logger.info(
            "upstream request completed",
            extra={
                "api_format": api_format.value,
                "upstream_host": url.host,
                "status": status,
                "duration_ms": round((time.perf_counter() - started) * 1000, 2),
            },
        )


def _aiohttp_form(form: MultipartForm) -> aiohttp.FormData:
    payload = aiohttp.FormData(quote_fields=False)
    for name, value in form.fields:
        payload.add_field(name, value)
    for file in form.files:
        payload.add_field(
            file.field_name,
            file.data,
            filename=file.filename,
            content_type=file.content_type,
        )
    return payload


def _is_event_stream(content_type: str | None) -> bool:
    return (
        content_type is not None
        and content_type.split(";", maxsplit=1)[0].strip().lower() == "text/event-stream"
    )


def _image_download_too_large(api_format: ApiFormat) -> ApplicationError:
    return ApplicationError(
        code="imageInputTooLarge",
        category=ErrorCategory.VALIDATION,
        message="参考图片超过允许的大小。",
        http_status=422,
        retryable=False,
        api_format=api_format,
    )


def _parse_sse_block(block: str) -> UpstreamSseEvent | None:
    event_name: str | None = None
    event_id: str | None = None
    data_lines: list[str] = []
    for line in block.splitlines():
        if not line or line.startswith(":"):
            continue
        field, separator, value = line.partition(":")
        if not separator:
            value = ""
        elif value.startswith(" "):
            value = value[1:]
        if field == "event":
            event_name = value
        elif field == "id":
            event_id = value
        elif field == "data":
            data_lines.append(value)
    if not data_lines:
        return None
    return UpstreamSseEvent(
        event=event_name,
        data=_parse_sse_data("\n".join(data_lines)),
        event_id=event_id,
    )


def _parse_sse_data(value: str) -> Any:
    if value == "[DONE]":
        return value
    try:
        return orjson.loads(value)
    except orjson.JSONDecodeError:
        return value


def _find_security_error(error: BaseException) -> SecurityError | None:
    current: BaseException | None = error
    visited: set[int] = set()
    while current is not None and id(current) not in visited:
        if isinstance(current, SecurityError):
            return current
        visited.add(id(current))
        current = current.__cause__ or current.__context__
    return None
