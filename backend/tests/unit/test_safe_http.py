from collections.abc import AsyncIterator
from types import TracebackType
from typing import ClassVar, cast

import aiohttp
import pytest
from app.domain.enums import ApiFormat
from app.domain.errors import ApplicationError, SecurityError
from app.infrastructure.config import Settings
from app.infrastructure.safe_http import SafeHttpTransport, _parse_sse_block
from yarl import URL


class RedirectResponse:
    status = 307
    headers: ClassVar[dict[str, str]] = {"Location": "/same-target"}

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
    def __init__(self) -> None:
        self.requests = 0

    def request(self, *_args: object, **_kwargs: object) -> RedirectResponse:
        self.requests += 1
        return RedirectResponse()


class ChunkedContent:
    def __init__(self, *chunks: bytes) -> None:
        self._chunks = chunks

    async def iter_any(self) -> AsyncIterator[bytes]:
        for chunk in self._chunks:
            yield chunk


class EventStreamResponse:
    status = 200

    def __init__(self, *chunks: bytes) -> None:
        self.content = ChunkedContent(*chunks)


def transport_with_session(settings: Settings) -> tuple[SafeHttpTransport, RedirectSession]:
    transport = SafeHttpTransport(settings)
    session = RedirectSession()
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


@pytest.mark.asyncio
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


def test_sse_parser_accepts_large_single_line_image_events() -> None:
    encoded = "A" * (1024 * 1024)
    event = _parse_sse_block(
        "event: image_generation.partial_image\n"
        f'data: {{"type":"image_generation.partial_image","b64_json":"{encoded}"}}'
    )

    assert event is not None
    assert event.event == "image_generation.partial_image"
    assert event.data["b64_json"] == encoded


@pytest.mark.asyncio
async def test_declared_event_stream_falls_back_to_plain_json() -> None:
    transport = SafeHttpTransport(Settings())
    response = cast(
        aiohttp.ClientResponse,
        EventStreamResponse(
            b": ping\n\n",
            b'{"data":[{"b64_json":"final"}],',
            b'"output_format":"png"}',
        ),
    )

    events = [event async for event in transport._iter_sse(response, ApiFormat.OPENAI_IMAGE)]

    assert len(events) == 1
    assert events[0].event is None
    assert events[0].data == {
        "data": [{"b64_json": "final"}],
        "output_format": "png",
    }


@pytest.mark.asyncio
async def test_valid_event_stream_does_not_emit_json_fallback() -> None:
    transport = SafeHttpTransport(Settings())
    response = cast(
        aiohttp.ClientResponse,
        EventStreamResponse(
            b": ping\n\n",
            b"event: image_generation.completed\n",
            b'data: {"type":"image_generation.completed","b64_json":"final"}\n\n',
        ),
    )

    events = [event async for event in transport._iter_sse(response, ApiFormat.OPENAI_IMAGE)]

    assert len(events) == 1
    assert events[0].event == "image_generation.completed"
    assert events[0].data["b64_json"] == "final"


@pytest.mark.asyncio
async def test_invalid_declared_event_stream_is_rejected() -> None:
    transport = SafeHttpTransport(Settings())
    response = cast(
        aiohttp.ClientResponse,
        EventStreamResponse(b"this is neither SSE nor JSON"),
    )

    with pytest.raises(ApplicationError) as error:
        _ = [event async for event in transport._iter_sse(response, ApiFormat.OPENAI_IMAGE)]

    assert error.value.code == "invalidUpstreamEventStream"
