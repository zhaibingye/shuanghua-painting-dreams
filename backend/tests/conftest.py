from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

import pytest
from app.domain.enums import ApiFormat
from app.infrastructure.config import Settings
from app.infrastructure.safe_http import (
    DownloadedContent,
    MultipartForm,
    UpstreamResponse,
    UpstreamSseEvent,
)
from yarl import URL


@dataclass(slots=True)
class RecordedCall:
    method: str
    url: URL
    headers: dict[str, str]
    payload: dict[str, Any] | None
    read_timeout: float
    api_format: ApiFormat
    retryable: bool


@dataclass(slots=True, frozen=True)
class RecordedMultipartCall:
    method: str
    url: URL
    headers: dict[str, str]
    form: MultipartForm
    read_timeout: float
    api_format: ApiFormat
    retryable: bool


@dataclass(slots=True)
class FakeTransport:
    responses: list[UpstreamResponse] = field(default_factory=list)
    stream_events: list[UpstreamSseEvent] = field(default_factory=list)
    calls: list[RecordedCall] = field(default_factory=list)
    multipart_responses: list[UpstreamResponse] = field(default_factory=list)
    multipart_stream_events: list[UpstreamSseEvent] = field(default_factory=list)
    multipart_calls: list[RecordedMultipartCall] = field(default_factory=list)
    downloaded_contents: list[DownloadedContent] = field(default_factory=list)

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
        self._record(
            method,
            url,
            headers,
            payload,
            read_timeout,
            api_format,
            retryable,
        )
        if not self.responses:
            raise AssertionError("FakeTransport 没有更多 JSON 响应")
        return self.responses.pop(0)

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
        self._record(
            method,
            url,
            headers,
            payload,
            read_timeout,
            api_format,
            retryable,
        )
        while self.stream_events:
            yield self.stream_events.pop(0)

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
        self._record_multipart(
            method,
            url,
            headers,
            form,
            read_timeout,
            api_format,
            retryable,
        )
        if not self.multipart_responses:
            raise AssertionError("FakeTransport 没有更多 Multipart JSON 响应")
        return self.multipart_responses.pop(0)

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
        self._record_multipart(
            method,
            url,
            headers,
            form,
            read_timeout,
            api_format,
            retryable,
        )
        while self.multipart_stream_events:
            yield self.multipart_stream_events.pop(0)

    async def download(
        self,
        *,
        url: URL,
        read_timeout: float,
        max_bytes: int,
        api_format: ApiFormat,
    ) -> DownloadedContent:
        del url, read_timeout, max_bytes, api_format
        if not self.downloaded_contents:
            raise AssertionError("FakeTransport 没有更多下载响应")
        return self.downloaded_contents.pop(0)

    def _record_multipart(
        self,
        method: str,
        url: URL,
        headers: dict[str, str],
        form: MultipartForm,
        read_timeout: float,
        api_format: ApiFormat,
        retryable: bool,
    ) -> None:
        self.multipart_calls.append(
            RecordedMultipartCall(
                method=method,
                url=url,
                headers=headers,
                form=form,
                read_timeout=read_timeout,
                api_format=api_format,
                retryable=retryable,
            )
        )

    def _record(
        self,
        method: str,
        url: URL,
        headers: dict[str, str],
        payload: dict[str, Any] | None,
        read_timeout: float,
        api_format: ApiFormat,
        retryable: bool,
    ) -> None:
        self.calls.append(
            RecordedCall(
                method=method,
                url=url,
                headers=headers,
                payload=payload,
                read_timeout=read_timeout,
                api_format=api_format,
                retryable=retryable,
            )
        )


@pytest.fixture
def settings() -> Settings:
    return Settings(
        image_read_timeout_seconds=600,
        video_create_timeout_seconds=120,
        video_status_timeout_seconds=60,
    )
