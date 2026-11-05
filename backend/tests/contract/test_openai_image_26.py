import base64
from typing import Any

import pytest
from app.application.image_service import ImageService
from app.domain.capabilities import validate_openai_image_request
from app.domain.errors import ApplicationError
from app.infrastructure.config import Settings
from app.infrastructure.safe_http import UpstreamResponse, UpstreamSseEvent
from app.providers.registry import ProviderRegistry
from app.schemas.image_turns import OpenAIImageTurnRequest, OpenAIResponsesImageOptions
from app.schemas.images import (
    OpenAIImageEditRequest,
    OpenAIImageGenerationRequest,
    OpenAIImageOptions,
)
from pydantic import ValidationError

from tests.conftest import FakeTransport

MODEL = "gpt-image-2.6-sunburst"
PNG = {"kind": "dataUrl", "dataUrl": "data:image/png;base64,iVBORw0KGgo="}


def turn(**overrides: Any) -> OpenAIImageTurnRequest:
    return OpenAIImageTurnRequest.model_validate(
        {
            "apiFormat": "openaiImage",
            "baseUrl": "https://example.com/proxy",
            "modelId": MODEL,
            "prompt": "a lantern sways in the snow",
            **overrides,
        }
    )


@pytest.mark.parametrize(
    "output_format,mime_type,content",
    [
        ("svg", "image/svg+xml", b'<svg xmlns="http://www.w3.org/2000/svg"/>'),
        ("gif", "image/gif", b"GIF89a-animation"),
    ],
)
async def test_vector_and_animation_use_json_upstream_and_complete_app_stream(
    settings: Settings, output_format: str, mime_type: str, content: bytes
) -> None:
    encoded = base64.b64encode(content).decode()
    # Exercise both the requested-format fallback and per-item format metadata.
    item = {"b64_json": encoded}
    if output_format == "svg":
        item["output_format"] = output_format
    transport = FakeTransport(
        responses=[
            UpstreamResponse(
                status=200,
                data={"data": [item], "usage": {"total_tokens": 42}},
                headers={},
            )
        ]
    )
    service = ImageService(ProviderRegistry.create(transport, settings))
    request = turn(
        options={
            "outputFormat": output_format,
            "size": "auto",
            "complexity": "medium",
            "quality": "max",
            "frameCount": 64,
            "frameDurationMs": 120,
        }
    )

    chunks = [chunk async for chunk in service.stream_turn(request, "key")]

    assert [chunk.kind for chunk in chunks] == ["completed", "done"]
    assert chunks[0].image is not None
    assert chunks[0].image.mime_type == mime_type
    assert base64.b64decode(chunks[0].image.base64_data) == content
    assert chunks[-1].usage is not None and chunks[-1].usage.total_tokens == 42
    assert len(transport.calls) == 1
    call = transport.calls[0]
    assert str(call.url) == "https://example.com/proxy/v1/images/generations"
    assert call.headers.get("Accept") != "text/event-stream"
    payload = call.payload
    assert payload is not None
    assert payload["model"] == MODEL
    assert payload["complexity"] == "medium"
    assert payload["quality"] == "max"
    assert not {"stream", "partial_images", "output_compression"} & payload.keys()
    if output_format == "gif":
        assert payload["frame_count"] == 64
        assert payload["frame_duration_ms"] == 120
    else:
        assert "frame_count" not in payload and "frame_duration_ms" not in payload
    assert "svg" not in payload


@pytest.mark.parametrize("effort", ["auto", "high"])
async def test_optional_svg_author_is_independent_of_image_complexity(
    settings: Settings, effort: str
) -> None:
    transport = FakeTransport(
        responses=[
            UpstreamResponse(
                status=200,
                data={"data": [{"b64_json": "PHN2Zy8+"}]},
                headers={},
            )
        ]
    )
    service = ImageService(ProviderRegistry.create(transport, settings))
    request = OpenAIImageGenerationRequest.model_validate(
        {
            "apiFormat": "openaiImage",
            "baseUrl": "https://example.com",
            "modelId": MODEL,
            "prompt": "a vector icon",
            "options": {
                "outputFormat": "svg",
                "complexity": "low",
                "svgModel": "custom-svg-author",
                "svgReasoningEffort": effort,
            },
        }
    )
    response = await service.generate(request, "key", "req_svg")
    assert response.images[0].mime_type == "image/svg+xml"
    payload = transport.calls[0].payload
    assert payload is not None and payload["complexity"] == "low"
    expected: dict[str, object] = {"model": "custom-svg-author"}
    if effort != "auto":
        expected["reasoning"] = {"effort": effort}
    assert payload["svg"] == expected


async def test_complexity_and_markup_are_sent_as_separate_multipart_fields(
    settings: Settings,
) -> None:
    transport = FakeTransport(
        multipart_stream_events=[
            UpstreamSseEvent(
                event="image_edit.completed",
                data={"b64_json": "ZmluYWw=", "output_format": "png"},
            )
        ]
    )
    service = ImageService(ProviderRegistry.create(transport, settings))
    request = turn(
        sourceImages=[PNG, PNG],
        markup={**PNG, "filename": "markup.png"},
        options={"complexity": "low", "quality": "xhigh"},
    )
    chunks = [chunk async for chunk in service.stream_turn(request, "key")]
    assert [chunk.kind for chunk in chunks] == ["completed", "done"]
    call = transport.multipart_calls[0]
    assert str(call.url).endswith("/v1/images/edits")
    assert [file.field_name for file in call.form.files] == ["image[]", "image[]", "markup"]
    assert call.form.files[-1].content_type == "image/png"
    assert call.form.files[-1].filename == "markup.png"
    assert ("complexity", "low") in call.form.fields
    assert ("stream", "true") in call.form.fields
    assert not {"mask", "frame_count", "output_compression"} & dict(call.form.fields).keys()


async def test_still_generation_streams_complexity_without_animation_options(
    settings: Settings,
) -> None:
    transport = FakeTransport(
        stream_events=[
            UpstreamSseEvent(event="image_generation.completed", data={"b64_json": "ZmluYWw="})
        ]
    )
    service = ImageService(ProviderRegistry.create(transport, settings))
    chunks = [
        chunk
        async for chunk in service.stream_turn(
            turn(options={"complexity": "high", "svgModel": "unused-author"}), "key"
        )
    ]
    assert chunks[0].kind == "completed"
    payload = transport.calls[0].payload
    assert payload is not None and payload["stream"] is True
    assert payload["complexity"] == "high"
    assert "frame_count" not in payload and "frame_duration_ms" not in payload
    assert "svg" not in payload


@pytest.mark.parametrize("output_format", ["svg", "gif"])
async def test_edit_formats_are_rejected_before_any_upstream_call(
    settings: Settings, output_format: str
) -> None:
    transport = FakeTransport()
    service = ImageService(ProviderRegistry.create(transport, settings))
    with pytest.raises(ApplicationError, match="仅支持文生图"):
        _ = [
            chunk
            async for chunk in service.stream_turn(
                turn(sourceImages=[PNG], options={"outputFormat": output_format}), "key"
            )
        ]
    assert not transport.calls and not transport.multipart_calls


@pytest.mark.parametrize("model", ["gpt-image-2.5-sunburst", "gpt-image-2", "custom-alias"])
@pytest.mark.parametrize("options", [{"complexity": "low"}, {"outputFormat": "svg"}])
def test_new_options_do_not_leak_to_older_models(model: str, options: dict[str, str]) -> None:
    with pytest.raises(ApplicationError):
        validate_openai_image_request(turn(modelId=model, options=options))


def test_gif_size_and_frame_limits_follow_26_guide() -> None:
    options = OpenAIImageOptions(
        output_format="gif", size="256X256", frame_count=64, frame_duration_ms=2000
    )
    assert options.size == "256x256"
    for invalid in (
        {"frame_count": 1},
        {"frame_count": 65},
        {"frame_duration_ms": 19},
        {"frame_duration_ms": 2001},
        {"size": "255x256"},
    ):
        with pytest.raises(ValidationError):
            OpenAIImageOptions.model_validate({"outputFormat": "gif", **invalid})
    with pytest.raises(ValidationError, match="只能生成一张"):
        OpenAIImageOptions(output_format="svg", count=2)
    with pytest.raises(ValidationError, match="必须填写"):
        OpenAIImageOptions(output_format="svg", svg_reasoning_effort="high")


def test_markup_requires_a_base_and_excludes_masks_on_both_endpoints() -> None:
    with pytest.raises(ValidationError, match="至少需要"):
        turn(markup=PNG)
    with pytest.raises(ValidationError, match="不能与遮罩"):
        turn(sourceImages=[PNG], markup=PNG, mask=PNG)
    with pytest.raises(ValidationError, match="不能与遮罩"):
        OpenAIImageEditRequest.model_validate(
            {
                "apiFormat": "openaiImage",
                "baseUrl": "https://example.com",
                "modelId": MODEL,
                "prompt": "edit",
                "images": [PNG],
                "markup": PNG,
                "mask": PNG,
            }
        )


@pytest.mark.parametrize(
    "options", [{"outputFormat": "gif"}, {"outputFormat": "svg"}, {"complexity": "low"}]
)
def test_responses_schema_keeps_images_only_options_out(options: dict[str, str]) -> None:
    with pytest.raises(ValidationError):
        OpenAIResponsesImageOptions.model_validate(options)
