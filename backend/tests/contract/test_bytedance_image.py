import base64

import pytest
from app.application.image_service import ImageService
from app.domain.errors import ApplicationError
from app.domain.image_options import validate_seedream_options
from app.infrastructure.config import Settings
from app.infrastructure.safe_http import DownloadedContent, UpstreamResponse
from app.providers.bytedance_image import ByteDanceImageAdapter
from app.providers.registry import ProviderRegistry
from app.schemas.image_turns import ByteDanceImageTurnRequest
from app.schemas.images import (
    ByteDanceImageEditRequest,
    ByteDanceImageGenerationRequest,
    ByteDanceImageOptions,
)

from tests.conftest import FakeTransport


def response(data: object) -> UpstreamResponse:
    return UpstreamResponse(status=200, data=data, headers={})


@pytest.mark.asyncio
async def test_seedream_generation_uses_ark_contract(settings: Settings) -> None:
    transport = FakeTransport(
        [
            response(
                {
                    "data": [{"b64_json": "aW1hZ2U=", "output_format": "png"}],
                    "usage": {"output_tokens": 20, "total_tokens": 20, "generated_images": 1},
                }
            )
        ]
    )
    service = ImageService(ProviderRegistry.create(transport, settings))
    request = ByteDanceImageGenerationRequest.model_validate(
        {
            "apiFormat": "byteDanceImage",
            "baseUrl": "https://ark.cn-beijing.volces.com",
            "modelId": "doubao-seedream-5-0-pro-260628",
            "prompt": "雪花",
            "options": {"outputFormat": "png"},
        }
    )
    result = await service.generate(request, "test-key", "req_test")
    call = transport.calls[0]
    assert str(call.url) == "https://ark.cn-beijing.volces.com/api/v3/images/generations"
    assert call.headers == {"Authorization": "Bearer test-key"}
    assert call.payload == {
        "model": request.model_id,
        "prompt": "雪花",
        "size": "2K",
        "watermark": True,
        "response_format": "b64_json",
        "stream": False,
        "output_format": "png",
        "optimize_prompt_options": {"mode": "standard"},
    }
    assert result.images[0].mime_type == "image/png"
    assert result.usage is not None and result.usage.total_tokens == 20


@pytest.mark.asyncio
async def test_seedream_edit_and_group_partial_success(settings: Settings) -> None:
    transport = FakeTransport(
        [
            response(
                {
                    "data": [
                        {"b64_json": "b3V0"},
                        {"error": {"code": "Failed", "message": "第二张失败"}},
                    ]
                }
            )
        ]
    )
    request = ByteDanceImageEditRequest.model_validate(
        {
            "apiFormat": "byteDanceImage",
            "baseUrl": "https://shapi.vip/proxy",
            "modelId": "doubao-seedream-4-5-251128",
            "prompt": "生成组图",
            "images": [
                {"kind": "url", "url": "https://example.com/a.png"},
                {"kind": "dataUrl", "dataUrl": "data:image/png;base64,aGVsbG8gd29ybGQ="},
            ],
            "options": {"sequentialImageGeneration": "auto", "maxImages": 4},
        }
    )
    result = await ByteDanceImageAdapter(transport, settings).edit(request, "key")
    call = transport.calls[0]
    assert str(call.url) == "https://shapi.vip/proxy/v1/images/edits"
    assert call.payload is not None
    assert call.payload["image"] == [
        "https://example.com/a.png",
        "data:image/png;base64,aGVsbG8gd29ybGQ=",
    ]
    assert call.payload["sequential_image_generation_options"] == {"max_images": 4}
    assert "output_format" not in call.payload
    assert call.payload["n"] == 1
    assert call.payload["response_format"] == "url"
    assert len(result.images) == 1
    assert result.text_outputs == ["部分图片生成失败：第二张失败"]


@pytest.mark.asyncio
async def test_seedream_conversation_uses_single_reference(settings: Settings) -> None:
    transport = FakeTransport([response({"data": [{"b64_json": "b3V0"}]})])
    request = ByteDanceImageTurnRequest.model_validate(
        {
            "apiFormat": "byteDanceImage",
            "baseUrl": "https://shapi.vip",
            "modelId": "ep-custom-model",
            "prompt": "改成蓝色",
            "sourceImages": [{"kind": "url", "url": "https://example.com/a.png"}],
        }
    )
    chunks = [
        chunk
        async for chunk in ImageService(ProviderRegistry.create(transport, settings)).stream_turn(
            request, "key"
        )
    ]
    assert [chunk.kind for chunk in chunks] == ["completed", "done"]
    assert transport.calls[0].payload is not None
    assert transport.calls[0].payload["image"] == "https://example.com/a.png"
    assert str(transport.calls[0].url) == "https://shapi.vip/v1/images/edits"


@pytest.mark.asyncio
async def test_proxy_generation_downloads_url_into_normal_image_result(settings: Settings) -> None:
    png = b"\x89PNG\r\n\x1a\nimage-data"
    transport = FakeTransport(
        [response({"created": 123, "data": [{"url": "https://cdn.example.com/result.png"}]})],
        downloaded_contents=[
            DownloadedContent(data=png, content_type="image/png", filename="result.png")
        ],
    )
    request = ByteDanceImageGenerationRequest.model_validate(
        {
            "apiFormat": "byteDanceImage",
            "baseUrl": "https://shapi.vip/v1/",
            "modelId": "doubao-seedream-5-0-pro-260628",
            "prompt": "test",
        }
    )
    result = await ByteDanceImageAdapter(transport, settings).generate(request, "test-key")
    assert str(transport.calls[0].url) == "https://shapi.vip/v1/images/generations"
    assert transport.calls[0].payload is not None
    assert transport.calls[0].payload["response_format"] == "url"
    assert transport.calls[0].payload["n"] == 1
    assert len(transport.calls) == 1
    assert str(transport.downloads[0].url) == "https://cdn.example.com/result.png"
    assert transport.downloads[0].max_bytes == settings.max_image_input_bytes
    assert result.images[0].mime_type == "image/png"
    assert base64.b64decode(result.images[0].base64_data) == png


@pytest.mark.asyncio
@pytest.mark.parametrize("url", ["http://127.0.0.1/result.png", "http://localhost/result.png"])
async def test_generated_image_urls_are_validated_before_download(
    settings: Settings, url: str
) -> None:
    transport = FakeTransport([response({"data": [{"url": url}]})])
    request = ByteDanceImageGenerationRequest.model_validate(
        {
            "apiFormat": "byteDanceImage",
            "baseUrl": "https://proxy.example.com",
            "modelId": "ep-custom",
            "prompt": "test",
        }
    )
    with pytest.raises(ApplicationError, match="接口契约"):
        await ByteDanceImageAdapter(transport, settings).generate(request, "key")
    assert not transport.downloads


@pytest.mark.asyncio
async def test_generated_url_cannot_succeed_with_html_instead_of_image(settings: Settings) -> None:
    transport = FakeTransport(
        [response({"data": [{"url": "https://cdn.example.com/result"}]})],
        downloaded_contents=[
            DownloadedContent(data=b"<!doctype html>", content_type="image/png", filename=None)
        ],
    )
    request = ByteDanceImageGenerationRequest.model_validate(
        {
            "apiFormat": "byteDanceImage",
            "baseUrl": "https://proxy.example.com",
            "modelId": "ep-custom",
            "prompt": "test",
        }
    )
    with pytest.raises(ApplicationError, match="不是 PNG"):
        await ByteDanceImageAdapter(transport, settings).generate(request, "key")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "data",
    [
        {"data": [{"unexpected": "invalid"}]},
        {"data": []},
        {"data": [{"error": {"message": "失败"}}]},
    ],
)
async def test_seedream_does_not_report_malformed_or_empty_output_as_success(
    settings: Settings, data: object
) -> None:
    transport = FakeTransport([response(data)])
    request = ByteDanceImageGenerationRequest.model_validate(
        {
            "apiFormat": "byteDanceImage",
            "baseUrl": "https://shapi.vip",
            "modelId": "ep-custom",
            "prompt": "test",
        }
    )
    with pytest.raises(ApplicationError):
        await ByteDanceImageAdapter(transport, settings).generate(request, "key")


@pytest.mark.parametrize(
    ("model", "options", "images"),
    [
        ("doubao-seedream-5-0-pro-260628", {"sequentialImageGeneration": "auto"}, 0),
        ("doubao-seedream-5-0-flash-test", {}, 11),
        ("doubao-seedream-4-5-251128", {"size": "1K"}, 0),
        ("doubao-seedream-4-5-251128", {"size": "1024x1024"}, 0),
        ("doubao-seedream-4-0-test", {"webSearch": True}, 0),
        ("doubao-seedream-4-5-251128", {"outputFormat": "png"}, 0),
    ],
)
def test_seedream_rejects_documented_model_limitations(
    model: str, options: dict[str, object], images: int
) -> None:
    with pytest.raises(ApplicationError):
        validate_seedream_options(model, ByteDanceImageOptions.model_validate(options), images)
