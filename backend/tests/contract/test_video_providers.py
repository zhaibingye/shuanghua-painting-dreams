import pytest
from app.domain.enums import TaskStatus
from app.domain.errors import ApplicationError
from app.infrastructure.config import Settings
from app.infrastructure.safe_http import UpstreamResponse
from app.providers.bytedance_video import ByteDanceVideoAdapter
from app.providers.xai_video import XAIVideoAdapter
from app.schemas.videos import (
    ByteDanceVideoGenerationRequest,
    XAIVideoExtensionRequest,
    XAIVideoGenerationRequest,
)

from tests.conftest import FakeTransport


@pytest.mark.asyncio
async def test_byte_video_payload_and_status(settings: Settings) -> None:
    transport = FakeTransport(
        [
            UpstreamResponse(status=200, data={"id": "cgt-1"}, headers={}),
            UpstreamResponse(
                status=200,
                data={
                    "id": "cgt-1",
                    "model": "doubao-seedance-2-0-260128",
                    "status": "succeeded",
                    "content": {
                        "video_url": "https://example.com/video.mp4",
                        "last_frame_url": "https://example.com/last.png",
                    },
                    "duration": "5",
                    "usage": {"total_tokens": "100"},
                },
                headers={},
            ),
        ]
    )
    adapter = ByteDanceVideoAdapter(transport, settings)
    request = ByteDanceVideoGenerationRequest.model_validate(
        {
            "apiFormat": "byteDanceVideo",
            "baseUrl": "https://shapi.vip",
            "modelId": "doubao-seedance-2-0-260128",
            "mode": "firstLastFrameToVideo",
            "prompt": "move",
            "inputs": {
                "firstFrameUrl": "https://example.com/first.png",
                "lastFrameUrl": "https://example.com/last.png",
            },
            "options": {"returnLastFrame": True, "resolution": "4k"},
        }
    )

    created = await adapter.create(request, "key")
    status = await adapter.get_status(request.base_url, created.task_id, "key")

    create_payload = transport.calls[0].payload
    assert create_payload is not None
    assert create_payload["content"][1]["role"] == "first_frame"
    assert create_payload["return_last_frame"] is True
    assert create_payload["resolution"] == "4k"
    assert "service_tier" not in create_payload
    assert status.status == TaskStatus.SUCCEEDED
    assert status.output is not None
    assert status.output.last_frame_url == "https://example.com/last.png"


@pytest.mark.asyncio
async def test_xai_video_generation_and_extension(settings: Settings) -> None:
    transport = FakeTransport(
        [
            UpstreamResponse(status=200, data={"request_id": "video-1"}, headers={}),
            UpstreamResponse(status=200, data={"request_id": "video-2"}, headers={}),
        ]
    )
    adapter = XAIVideoAdapter(transport, settings)
    generation = XAIVideoGenerationRequest.model_validate(
        {
            "apiFormat": "xaiVideo",
            "baseUrl": "https://shapi.vip",
            "modelId": "grok-imagine-video-1.5",
            "mode": "referenceToVideo",
            "prompt": "speak",
            "inputs": {
                "referenceImages": [{"kind": "url", "url": "https://example.com/ref.png"}],
                "voiceIds": ["eve"],
            },
        }
    )
    extension = XAIVideoExtensionRequest.model_validate(
        {
            "apiFormat": "xaiVideo",
            "baseUrl": "https://shapi.vip",
            "modelId": "grok-imagine-video",
            "prompt": "continue",
            "videoUrl": "https://example.com/source.mp4",
            "duration": 6,
        }
    )

    await adapter.create(generation, "key")
    await adapter.extend(extension, "key")

    generation_payload = transport.calls[0].payload
    extension_payload = transport.calls[1].payload
    assert generation_payload is not None
    assert generation_payload["reference_audios"] == [{"voice_id": "eve"}]
    assert extension_payload is not None
    assert extension_payload["video"]["url"] == "https://example.com/source.mp4"


@pytest.mark.asyncio
async def test_xai_moderated_done_task_becomes_failed(settings: Settings) -> None:
    transport = FakeTransport(
        [
            UpstreamResponse(
                status=200,
                data={
                    "status": "done",
                    "progress": 100,
                    "video": {"url": None, "respect_moderation": False},
                },
                headers={},
            )
        ]
    )
    adapter = XAIVideoAdapter(transport, settings)

    status = await adapter.get_status("https://shapi.vip", "task-1", "key")

    assert status.status == TaskStatus.FAILED
    assert status.error is not None
    assert status.error.code == "moderationBlocked"


@pytest.mark.parametrize("content", [None, [], {}, {"video_url": ""}])
async def test_byte_success_without_video_is_not_terminal(
    settings: Settings, content: object
) -> None:
    transport = FakeTransport(
        [UpstreamResponse(status=200, data={"status": "succeeded", "content": content}, headers={})]
    )
    adapter = ByteDanceVideoAdapter(transport, settings)
    with pytest.raises(ApplicationError) as error:
        await adapter.get_status("https://www.shapi.vip", "task-1", "key")
    assert error.value.code == "invalidUpstreamResponse"


@pytest.mark.parametrize("video", [None, [], {}, {"url": ""}])
async def test_xai_success_without_video_is_not_misreported_as_success_or_moderation(
    settings: Settings, video: object
) -> None:
    transport = FakeTransport(
        [UpstreamResponse(status=200, data={"status": "done", "video": video}, headers={})]
    )
    adapter = XAIVideoAdapter(transport, settings)
    with pytest.raises(ApplicationError) as error:
        await adapter.get_status("https://www.shapi.vip", "task-1", "key")
    assert error.value.code == "invalidUpstreamResponse"


@pytest.mark.asyncio
async def test_seedance_2_5_defaults_and_explicit_options(settings: Settings) -> None:
    transport = FakeTransport(
        [
            UpstreamResponse(status=200, data={"id": "cgt-default"}, headers={}),
            UpstreamResponse(status=200, data={"id": "cgt-explicit"}, headers={}),
        ]
    )
    adapter = ByteDanceVideoAdapter(transport, settings)
    payload = {
        "apiFormat": "byteDanceVideo",
        "baseUrl": "https://shapi.vip",
        "modelId": "doubao-seedance-2-5-260628",
        "mode": "textToVideo",
        "prompt": "snow",
    }
    await adapter.create(ByteDanceVideoGenerationRequest.model_validate(payload), "key")
    await adapter.create(
        ByteDanceVideoGenerationRequest.model_validate(
            {
                **payload,
                "options": {"duration": 30, "resolution": "1080p", "generateAudio": False},
            }
        ),
        "key",
    )
    default_payload = transport.calls[0].payload
    assert default_payload is not None
    assert default_payload["duration"] == -1
    assert default_payload["resolution"] == "720p"
    assert default_payload["ratio"] == "adaptive"
    assert default_payload["generate_audio"] is True
    assert default_payload["watermark"] is False
    assert "service_tier" not in default_payload
    assert "seed" not in default_payload
    explicit_payload = transport.calls[1].payload
    assert explicit_payload is not None
    assert explicit_payload["duration"] == 30
    assert explicit_payload["resolution"] == "1080p"
    assert explicit_payload["generate_audio"] is False
