from collections.abc import AsyncIterator
from types import TracebackType
from typing import cast

import aiohttp
import pytest
from app.domain.enums import ApiFormat
from app.domain.errors import ApplicationError, SecurityError
from app.infrastructure.config import Settings
from app.infrastructure.safe_http import SafeHttpTransport
from yarl import URL


class RedirectResponse:
    status = 307

    def __init__(self) -> None:
        self.headers = {"Location": "/same-target"}

    async def __aenter__(self) -> "RedirectResponse":
        return self

    async def __aexit__(
        self,
        _exception_type: type[BaseException] | None,
        _exception: BaseException | None,
        _traceback: TracebackType | None,
    ) -> None:
        return None


class RedirectSession:
    def __init__(self, response: RedirectResponse | None = None) -> None:
        self.requests = 0
        self.response = response or RedirectResponse()

    def request(self, *_args: object, **_kwargs: object) -> RedirectResponse:
        self.requests += 1
        return self.response


class ChunkedContent:
    def __init__(self, *chunks: bytes) -> None:
        self._chunks = chunks

    async def iter_any(self) -> AsyncIterator[bytes]:
        for chunk in self._chunks:
            yield chunk

    async def iter_chunked(self, _size: int) -> AsyncIterator[bytes]:
        async for chunk in self.iter_any():
            yield chunk


class BodyResponse(RedirectResponse):
    status = 200
    content_length = None

    def __init__(self, content_type: str, *chunks: bytes) -> None:
        self.headers = {"Content-Type": content_type}
        self.content = ChunkedContent(*chunks)


def transport_with_session(
    settings: Settings,
    response: RedirectResponse | None = None,
) -> tuple[SafeHttpTransport, RedirectSession]:
    transport = SafeHttpTransport(settings)
    session = RedirectSession(response)
    transport._session = cast(aiohttp.ClientSession, session)
    return transport, session


def test_redirect_to_private_literal_address_is_blocked() -> None:
    transport = SafeHttpTransport(Settings())

    with pytest.raises(SecurityError, match="非公网地址"):
        transport._validate_redirect(URL("https://8.8.8.8/v1/start"), "http://127.0.0.1/internal")


def test_cross_origin_public_redirect_is_blocked_to_protect_api_key() -> None:
    transport = SafeHttpTransport(Settings())

    with pytest.raises(SecurityError) as error:
        transport._validate_redirect(URL("https://8.8.8.8/v1/start"), "https://1.1.1.1/next")

    assert error.value.code == "crossOriginRedirectBlocked"


def test_relative_redirect_preserves_validated_public_origin() -> None:
    transport = SafeHttpTransport(Settings())

    result = transport._validate_redirect(URL("https://8.8.8.8/v1/start"), "../next")

    assert str(result) == "https://8.8.8.8/next"


def test_signed_media_query_and_encoding_are_preserved() -> None:
    transport = SafeHttpTransport(Settings())
    address = "https://cdn.example.com/image.jpg?signature=a%2Fb%2Bc%3D&part=1&part=2"
    result = transport._validate_full_url(URL(address, encoded=True))
    assert str(result) == address


def test_signed_media_redirect_preserves_signature(monkeypatch: pytest.MonkeyPatch) -> None:
    transport = SafeHttpTransport(Settings())
    response = RedirectResponse()
    location = "https://cdn.example.com/image.jpg?signature=a%2Fb%2Bc%3D"
    monkeypatch.setattr(response, "headers", {"Location": location})
    result = transport._download_redirect_target(
        URL("https://proxy.example.com/start"),
        cast(aiohttp.ClientResponse, response),
        0,
        ApiFormat.BYTE_DANCE_IMAGE,
    )
    assert str(result) == location


def test_signed_media_query_does_not_bypass_private_address_check() -> None:
    with pytest.raises(SecurityError):
        SafeHttpTransport(Settings())._validate_full_url(
            URL("http://127.0.0.1/image?signature=abc")
        )


async def test_redirect_limit_is_enforced_without_retrying_creation() -> None:
    transport, session = transport_with_session(Settings(max_redirects=1))
    with pytest.raises(ApplicationError) as error:
        await transport.request_json(
            method="POST",
            url=URL("https://8.8.8.8/v1/start"),
            headers={"Authorization": "Bearer secret"},
            payload={"prompt": "snow"},
            read_timeout=1,
            api_format=ApiFormat.OPENAI_IMAGE,
        )

    assert error.value.code == "tooManyRedirects"
    assert session.requests == 2


@pytest.mark.parametrize("content_type", ["text/event-stream; charset=utf-8", "application/json"])
async def test_stream_response_uses_declared_format_and_handles_large_chunked_images(
    content_type: str,
) -> None:
    encoded = "A" * (1024 * 1024)
    chunks: tuple[bytes, ...]
    if content_type.startswith("text/event-stream"):
        chunks = (
            b": ping\n\n",
            b'event: image_generation.completed\ndata: {"b64_json":"',
            encoded.encode(),
            b'"}\n\n',
        )
    else:
        chunks = (b'{"b64_json":"', encoded.encode(), b'"}')
    transport, _ = transport_with_session(Settings(), BodyResponse(content_type, *chunks))
    events = [
        event
        async for event in transport.stream_sse(
            method="POST",
            url=URL("https://8.8.8.8/v1/start"),
            headers={},
            payload={"prompt": "snow"},
            read_timeout=1,
            api_format=ApiFormat.OPENAI_IMAGE,
        )
    ]
    assert len(events) == 1
    assert events[0].event == (
        "image_generation.completed" if content_type.startswith("text/event-stream") else None
    )
    assert events[0].data["b64_json"] == encoded


@pytest.mark.parametrize(
    ("failure", "code", "http_status"),
    [
        (TimeoutError(), "upstreamTimeout", 504),
        (aiohttp.ClientConnectionError(), "upstreamNetworkError", 502),
    ],
)
async def test_transport_normalizes_network_failures_without_retrying(
    monkeypatch: pytest.MonkeyPatch,
    failure: Exception,
    code: str,
    http_status: int,
) -> None:
    transport, session = transport_with_session(Settings())

    def request(*_args: object, **_kwargs: object) -> RedirectResponse:
        session.requests += 1
        raise failure

    monkeypatch.setattr(session, "request", request)
    with pytest.raises(ApplicationError) as error:
        await transport.request_json(
            method="POST",
            url=URL("https://8.8.8.8/v1/start"),
            headers={},
            payload={},
            read_timeout=1,
            api_format=ApiFormat.OPENAI_IMAGE,
        )
    assert error.value.code == code
    assert error.value.http_status == http_status
    assert error.value.retryable is False
    assert session.requests == 1
