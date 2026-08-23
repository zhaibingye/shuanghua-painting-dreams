import pytest
from app.application.image_service import ImageService
from app.infrastructure.config import Settings
from app.infrastructure.safe_http import DownloadedContent, UpstreamResponse, UpstreamSseEvent
from app.providers.google_gemini_image import GoogleGeminiImageAdapter
from app.providers.openai_image import OpenAIImageAdapter
from app.providers.openai_responses_image import OpenAIResponsesImageAdapter
from app.providers.registry import ProviderRegistry
from app.providers.xai_image import XAIImageAdapter
from app.schemas.image_turns import OpenAIImageTurnRequest, OpenAIResponsesImageTurnRequest
from app.schemas.images import (
    GeminiImageEditRequest,
    OpenAIImageEditRequest,
    OpenAIImageGenerationRequest,
    XAIImageEditRequest,
)

from tests.conftest import FakeTransport


@pytest.mark.asyncio
async def test_openai_generation_payload_and_response(settings: Settings) -> None:
    transport = FakeTransport(
        [
            UpstreamResponse(
                status=200,
                data={
                    "data": [{"b64_json": "aW1hZ2U="}],
                    "output_format": "png",
                    "usage": {"input_tokens": 1, "output_tokens": 2, "total_tokens": 3},
                },
                headers={},
            )
        ]
    )
    adapter = OpenAIImageAdapter(transport, settings)
    request = OpenAIImageGenerationRequest.model_validate(
        {
            "apiFormat": "openaiImage",
            "baseUrl": "https://shapi.vip/proxy",
            "modelId": "gpt-image-2",
            "prompt": "snow flower",
            "options": {"count": 2, "quality": "high"},
        }
    )

    result = await adapter.generate(request, "secret")

    call = transport.calls[0]
    assert str(call.url) == "https://shapi.vip/proxy/v1/images/generations"
    assert call.headers["Authorization"] == "Bearer secret"
    assert call.payload is not None
    assert call.payload["response_format"] == "b64_json"
    assert call.payload["n"] == 2
    assert result.images[0].base64_data == "aW1hZ2U="
    assert result.usage is not None and result.usage.total_tokens == 3


@pytest.mark.asyncio
async def test_gemini_edit_maps_data_url_to_inline_data(settings: Settings) -> None:
    transport = FakeTransport(
        [
            UpstreamResponse(
                status=200,
                data={
                    "candidates": [
                        {
                            "content": {
                                "parts": [
                                    {
                                        "inline_data": {
                                            "mime_type": "image/png",
                                            "data": "b3V0",
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                },
                headers={},
            )
        ]
    )
    adapter = GoogleGeminiImageAdapter(transport, settings)
    request = GeminiImageEditRequest.model_validate(
        {
            "apiFormat": "googleGeminiImage",
            "baseUrl": "https://shapi.vip",
            "modelId": "nano-banana-2",
            "prompt": "edit",
            "images": [
                {
                    "kind": "dataUrl",
                    "dataUrl": "data:image/png;base64,aGVsbG8gd29ybGQ=",
                }
            ],
        }
    )

    result = await adapter.edit(request, "key")

    call = transport.calls[0]
    assert call.payload is not None
    parts = call.payload["contents"][0]["parts"]
    assert parts[1] == {"inline_data": {"mime_type": "image/png", "data": "aGVsbG8gd29ybGQ="}}
    assert result.images[0].base64_data == "b3V0"


@pytest.mark.asyncio
async def test_xai_edit_forces_base64_response(settings: Settings) -> None:
    transport = FakeTransport(
        [
            UpstreamResponse(
                status=200,
                data={
                    "data": [{"b64_json": "b3V0", "mime_type": "image/jpeg"}],
                    "usage": {"cost_in_usd_ticks": 400000000},
                },
                headers={},
            )
        ]
    )
    adapter = XAIImageAdapter(transport, settings)
    request = XAIImageEditRequest.model_validate(
        {
            "apiFormat": "xaiImage",
            "baseUrl": "https://shapi.vip",
            "modelId": "grok-imagine-image-2.0",
            "prompt": "blend",
            "images": [
                {"kind": "url", "url": "https://example.com/a.png"},
                {"kind": "url", "url": "https://example.com/b.png"},
            ],
        }
    )

    result = await adapter.edit(request, "key")

    call = transport.calls[0]
    assert call.payload is not None
    assert call.payload["response_format"] == "b64_json"
    assert "images" in call.payload and "image" not in call.payload
    assert result.images[0].mime_type == "image/jpeg"
    assert result.usage is not None
    assert result.usage.cost_in_usd_ticks == 400000000


@pytest.mark.asyncio
async def test_openai_image_stream_emits_partial_and_final(settings: Settings) -> None:
    transport = FakeTransport(
        stream_events=[
            UpstreamSseEvent(
                event="image_generation.partial_image",
                data={
                    "type": "image_generation.partial_image",
                    "b64_json": "cGFydGlhbA==",
                    "partial_image_index": 0,
                    "output_format": "png",
                },
            ),
            UpstreamSseEvent(
                event="image_generation.completed",
                data={
                    "type": "image_generation.completed",
                    "b64_json": "ZmluYWw=",
                    "output_format": "png",
                    "usage": {"total_tokens": 12},
                },
            ),
        ]
    )
    adapter = OpenAIImageAdapter(transport, settings)
    request = OpenAIImageTurnRequest.model_validate(
        {
            "apiFormat": "openaiImage",
            "baseUrl": "https://shapi.vip",
            "modelId": "gpt-image-2",
            "prompt": "snow",
            "options": {"partialImages": 2},
        }
    )

    chunks = [chunk async for chunk in adapter.stream_generate(request, "secret")]

    assert [chunk.kind for chunk in chunks] == ["partial", "completed", "done"]
    assert transport.calls[0].payload is not None
    assert transport.calls[0].payload["stream"] is True
    assert transport.calls[0].payload["partial_images"] == 2
    assert chunks[1].image is not None and chunks[1].image.base64_data == "ZmluYWw="


@pytest.mark.asyncio
async def test_openai_image_turn_with_reference_uses_non_streaming_edit(
    settings: Settings,
) -> None:
    transport = FakeTransport(
        multipart_responses=[
            UpstreamResponse(
                status=200,
                data={
                    "data": [{"b64_json": "ZmluYWw="}],
                    "output_format": "png",
                    "usage": {"total_tokens": 18},
                },
                headers={"Content-Type": "application/json"},
            )
        ]
    )
    service = ImageService(ProviderRegistry.create(transport, settings))
    request = OpenAIImageTurnRequest.model_validate(
        {
            "apiFormat": "openaiImage",
            "baseUrl": "https://shapi.vip",
            "modelId": "gpt-image-2",
            "prompt": "make it blue",
            "sourceImages": [
                {
                    "kind": "dataUrl",
                    "dataUrl": "data:image/png;base64,iVBORw0KGgo=",
                    "filename": "source.png",
                }
            ],
            "options": {"partialImages": 3, "inputFidelity": "auto"},
        }
    )

    chunks = [chunk async for chunk in service.stream_turn(request, "secret")]

    assert [chunk.kind for chunk in chunks] == ["completed", "done"]
    call = transport.multipart_calls[0]
    assert str(call.url) == "https://shapi.vip/v1/images/edits"
    assert call.headers == {"Authorization": "Bearer secret"}
    assert not any(name in {"stream", "partial_images"} for name, _ in call.form.fields)
    assert not any(name == "input_fidelity" for name, _ in call.form.fields)
    assert len(call.form.files) == 1
    assert call.form.files[0].field_name == "image"
    assert call.form.files[0].filename == "source.png"
    assert call.form.files[0].data.startswith(b"\x89PNG")
    assert chunks[0].image is not None and chunks[0].image.base64_data == "ZmluYWw="
    assert chunks[-1].usage is not None and chunks[-1].usage.total_tokens == 18


@pytest.mark.asyncio
async def test_openai_image_stream_accepts_json_success_fallback(settings: Settings) -> None:
    transport = FakeTransport(
        stream_events=[
            UpstreamSseEvent(
                event=None,
                data={
                    "data": [{"b64_json": "ZmluYWw="}],
                    "output_format": "png",
                    "usage": {"total_tokens": 9},
                },
            )
        ]
    )
    adapter = OpenAIImageAdapter(transport, settings)
    request = OpenAIImageTurnRequest.model_validate(
        {
            "apiFormat": "openaiImage",
            "baseUrl": "https://shapi.vip",
            "modelId": "gpt-image-2",
            "prompt": "snow",
        }
    )

    chunks = [chunk async for chunk in adapter.stream_generate(request, "secret")]

    assert [chunk.kind for chunk in chunks] == ["completed", "done"]
    assert chunks[-1].usage is not None and chunks[-1].usage.total_tokens == 9


@pytest.mark.asyncio
async def test_openai_image_edit_non_streaming_uses_multipart(settings: Settings) -> None:
    transport = FakeTransport(
        multipart_responses=[
            UpstreamResponse(
                status=200,
                data={"data": [{"b64_json": "ZmluYWw="}], "output_format": "png"},
                headers={},
            )
        ]
    )
    adapter = OpenAIImageAdapter(transport, settings)
    request = OpenAIImageEditRequest.model_validate(
        {
            "apiFormat": "openaiImage",
            "baseUrl": "https://shapi.vip",
            "modelId": "gpt-image-2",
            "prompt": "combine",
            "images": [
                {"kind": "dataUrl", "dataUrl": "data:image/png;base64,iVBORw0KGgo="},
                {"kind": "dataUrl", "dataUrl": "data:image/png;base64,iVBORw0KGgo="},
            ],
            "options": {"inputFidelity": "high"},
        }
    )

    result = await adapter.edit(request, "secret")

    call = transport.multipart_calls[0]
    assert len(call.form.files) == 2
    assert all(file.field_name == "image[]" for file in call.form.files)
    assert ("input_fidelity", "high") in call.form.fields
    assert not any(name == "stream" for name, _ in call.form.fields)
    assert result.images[0].base64_data == "ZmluYWw="


@pytest.mark.asyncio
async def test_openai_image_edit_downloads_url_inputs(settings: Settings) -> None:
    transport = FakeTransport(
        multipart_responses=[
            UpstreamResponse(
                status=200,
                data={"data": [{"b64_json": "ZmluYWw="}], "output_format": "png"},
                headers={},
            )
        ],
        downloaded_contents=[
            DownloadedContent(
                data=b"\x89PNG\r\n\x1a\n",
                content_type="image/png",
                filename="remote.png",
            )
        ],
    )
    adapter = OpenAIImageAdapter(transport, settings)
    request = OpenAIImageEditRequest.model_validate(
        {
            "apiFormat": "openaiImage",
            "baseUrl": "https://shapi.vip",
            "modelId": "gpt-image-2",
            "prompt": "edit",
            "images": [{"kind": "url", "url": "https://example.com/remote.png"}],
        }
    )

    await adapter.edit(request, "secret")

    file = transport.multipart_calls[0].form.files[0]
    assert file.filename == "remote.png"
    assert file.content_type == "image/png"
    assert file.data.startswith(b"\x89PNG")


@pytest.mark.asyncio
async def test_openai_responses_is_stateless_and_replays_image_calls(
    settings: Settings,
) -> None:
    transport = FakeTransport(
        stream_events=[
            UpstreamSseEvent(
                event="response.output_item.done",
                data={
                    "type": "response.output_item.done",
                    "output_index": 0,
                    "item": {
                        "id": "ig_new",
                        "type": "image_generation_call",
                        "status": "completed",
                        "result": "bmV3",
                        "revised_prompt": "new prompt",
                    },
                },
            ),
            UpstreamSseEvent(
                event="response.completed",
                data={
                    "type": "response.completed",
                    "response": {
                        "id": "resp_new",
                        "usage": {"total_tokens": 42},
                        "output": [],
                    },
                },
            ),
        ]
    )
    adapter = OpenAIResponsesImageAdapter(transport, settings)
    request = OpenAIResponsesImageTurnRequest.model_validate(
        {
            "apiFormat": "openaiResponsesImage",
            "baseUrl": "https://shapi.vip",
            "modelId": "gpt-5.6-luna",
            "prompt": "make it blue",
            "history": [
                {"kind": "message", "text": "draw a flower"},
                {
                    "kind": "imageGenerationCall",
                    "callId": "ig_old",
                    "image": {
                        "kind": "dataUrl",
                        "dataUrl": "data:image/png;base64,b2xkLWltYWdl",
                    },
                },
            ],
            "options": {"partialImages": 3},
        }
    )

    chunks = [chunk async for chunk in adapter.stream_turn(request, "secret")]

    payload = transport.calls[0].payload
    assert payload is not None
    assert payload["store"] is False
    assert "previous_response_id" not in payload
    assert payload["tools"][0]["partial_images"] == 3
    assert payload["input"][1] == {
        "type": "image_generation_call",
        "id": "ig_old",
        "status": "completed",
        "result": "b2xkLWltYWdl",
    }
    assert chunks[-1].provider_state == {
        "type": "openaiResponses",
        "responseId": "resp_new",
        "store": False,
    }
