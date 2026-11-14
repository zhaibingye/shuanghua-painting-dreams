import json

import httpx
import pytest
from app.application.image_service import ImageService
from app.infrastructure.config import Settings
from app.infrastructure.safe_http import UpstreamResponse
from app.main import create_app
from app.providers.registry import ProviderRegistry

from tests.conftest import FakeTransport


@pytest.mark.asyncio
async def test_health_and_metadata() -> None:
    app = create_app()
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
        ) as client,
    ):
        live = await client.get("/api/v1/health/live")
        metadata = await client.get("/api/v1/metadata/providers")

    assert live.status_code == 200
    assert live.json() == {"status": "ok"}
    assert metadata.status_code == 200
    payload = metadata.json()
    assert payload["schemaVersion"] == 4
    assert len(payload["providers"]) == 7
    assert {p["apiFormat"]: p["defaultModelId"] for p in payload["providers"]} == {
        "googleGeminiImage": "gemini-nano-banana-2.1",
        "openaiImage": "gpt-image-2.6-sunburst",
        "openaiResponsesImage": "gpt-6.1-terra",
        "xaiImage": "grok-imagine-image-2.0",
        "byteDanceImage": "doubao-seedream-5-5-261028",
        "byteDanceVideo": "doubao-seedance-2-5-260628",
        "xaiVideo": "grok-imagine-video-1.5",
    }
    openai_images = next(
        provider for provider in payload["providers"] if provider["apiFormat"] == "openaiImage"
    )
    assert all(p["defaultBaseUrl"] == "https://www.shapi.vip" for p in payload["providers"])
    assert openai_images["genericCapabilities"] == {
        "textToImage": True,
        "imageEditing": True,
        "maskEditing": True,
        "maxReferenceImages": 16,
        "nativeBatchCount": True,
        "qualityControl": True,
        "generationStreaming": True,
        "generationPartialImages": True,
        "editStreaming": True,
        "editPartialImages": True,
    }
    responses = next(
        provider
        for provider in payload["providers"]
        if provider["apiFormat"] == "openaiResponsesImage"
    )
    assert responses["defaultOptions"]["imageModel"] == "gpt-image-2.6-sunburst"
    byte_dance = next(
        provider for provider in payload["providers"] if provider["apiFormat"] == "byteDanceVideo"
    )
    assert byte_dance["defaultOptions"]["duration"] == -1
    assert byte_dance["defaultOptions"]["generateAudio"] is True
    assert byte_dance["knownModels"]["doubao-seedance-2-5-260628"]["resolutions"] == [
        "480p",
        "720p",
        "1080p",
    ]
    assert byte_dance["knownModels"]["doubao-seedance-2-0-260128"]["resolutions"] == [
        "480p",
        "720p",
        "1080p",
        "4k",
    ]


@pytest.mark.asyncio
async def test_generation_requires_api_key() -> None:
    app = create_app()
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
        ) as client,
    ):
        response = await client.post(
            "/api/v1/images/generations",
            json={
                "apiFormat": "openaiImage",
                "baseUrl": "https://shapi.vip",
                "modelId": "gpt-image-2",
                "prompt": "snow",
            },
        )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "apiKeyRequired"


async def test_gemini_stream_preserves_image_ids_in_conversation_state(
    settings: Settings,
) -> None:
    transport = FakeTransport(
        responses=[
            UpstreamResponse(
                status=200,
                headers={},
                data={
                    "candidates": [
                        {
                            "content": {
                                "parts": [
                                    {"text": "snow"},
                                    {
                                        "inlineData": {"mimeType": "image/png", "data": "aW1n"},
                                        "thoughtSignature": "signature",
                                    },
                                ]
                            }
                        },
                    ],
                    "usageMetadata": {"totalTokenCount": 42},
                },
            ),
        ],
    )
    app = create_app()
    app.state.image_service = ImageService(ProviderRegistry.create(transport, settings))
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        response = await client.post(
            "/api/v1/images/conversation-turns/stream",
            headers={"X-Upstream-API-Key": "secret"},
            json={
                "apiFormat": "googleGeminiImage",
                "baseUrl": "https://example.com",
                "modelId": "gemini-nano-banana-2.1",
                "prompt": "draw snow",
            },
        )

    assert response.status_code == 200
    events = {}
    for block in response.text.strip().split("\n\n"):
        event, data = block.split("\n", maxsplit=1)
        events[event.removeprefix("event: ")] = json.loads(data.removeprefix("data: "))
    image = events["image.completed"]["image"]
    completed = events["turn.completed"]
    assert completed["usage"]["totalTokens"] == 42
    assert completed["providerState"]["parts"] == [
        {"kind": "text", "text": "snow", "thought": False, "thoughtSignature": None},
        {
            "kind": "image",
            "imageId": image["id"],
            "thought": False,
            "thoughtSignature": "signature",
        },
    ]


@pytest.mark.asyncio
async def test_validation_error_does_not_echo_large_input() -> None:
    secret_image = "data:image/png;base64," + "A" * 10000
    app = create_app()
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
        ) as client,
    ):
        response = await client.post(
            "/api/v1/images/edits",
            headers={"X-Upstream-API-Key": "secret"},
            json={
                "apiFormat": "openaiImage",
                "baseUrl": "https://shapi.vip",
                "modelId": "invalid?model",
                "prompt": "edit",
                "images": [{"kind": "dataUrl", "dataUrl": secret_image}],
            },
        )

    assert response.status_code == 422
    body = response.text
    assert "AAAAAA" not in body
    assert "secret" not in body
    assert response.json()["error"]["code"] == "requestValidationFailed"
