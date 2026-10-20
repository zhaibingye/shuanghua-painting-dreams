import httpx
import pytest
from app.main import create_app


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
    assert payload["schemaVersion"] == 3
    assert len(payload["providers"]) == 6
    openai_images = next(
        provider for provider in payload["providers"] if provider["apiFormat"] == "openaiImage"
    )
    assert all(p["defaultBaseUrl"] == "https://www.shapi.vip" for p in payload["providers"])
    assert openai_images["defaultModelId"] == "gpt-image-2.5-sunburst"
    assert openai_images["genericCapabilities"] == {
        "textToImage": True,
        "imageEditing": True,
        "maskEditing": True,
        "maxReferenceImages": 16,
        "nativeBatchCount": True,
        "qualityControl": True,
        "generationStreaming": True,
        "generationPartialImages": True,
        "editStreaming": False,
        "editPartialImages": False,
    }
    responses = next(
        provider
        for provider in payload["providers"]
        if provider["apiFormat"] == "openaiResponsesImage"
    )
    assert responses["defaultModelId"] == "gpt-5.6-luna"
    byte_dance = next(
        provider for provider in payload["providers"] if provider["apiFormat"] == "byteDanceVideo"
    )
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
                "modelId": "invalid/model",
                "prompt": "edit",
                "images": [{"kind": "dataUrl", "dataUrl": secret_image}],
            },
        )

    assert response.status_code == 422
    body = response.text
    assert "AAAAAA" not in body
    assert "secret" not in body
    assert response.json()["error"]["code"] == "requestValidationFailed"
