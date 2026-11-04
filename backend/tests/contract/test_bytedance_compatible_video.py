import pytest
from app.domain.enums import TaskStatus
from app.domain.errors import ApplicationError
from app.infrastructure.config import Settings
from app.infrastructure.safe_http import UpstreamResponse
from app.providers.bytedance_video import ByteDanceVideoAdapter
from app.schemas.videos import ByteDanceVideoGenerationRequest

from tests.conftest import FakeTransport


@pytest.mark.asyncio
async def test_compatible_video_maps_inputs_and_completed_url(settings: Settings) -> None:
    transport = FakeTransport(
        [
            UpstreamResponse(status=200, data={"id": "task_1", "status": "queued"}, headers={}),
            UpstreamResponse(
                status=200,
                data={
                    "id": "task_1",
                    "status": "completed",
                    "progress": 100,
                    "model": "doubao-seedance-2-0-260128-se",
                    "seconds": "4",
                    "metadata": {
                        "url": "https://cdn.example.com/video.mp4",
                        "last_frame_url": "https://cdn.example.com/last.png",
                    },
                },
                headers={},
            ),
        ]
    )
    request = ByteDanceVideoGenerationRequest.model_validate(
        {
            "apiFormat": "byteDanceVideo",
            "baseUrl": "https://proxy.example.com/gateway/v1/",
            "modelId": "doubao-seedance-2-0-260128-se",
            "mode": "firstLastFrameToVideo",
            "prompt": "move",
            "inputs": {
                "firstFrameUrl": "https://cdn.example.com/first.png",
                "lastFrameUrl": "https://cdn.example.com/last.png",
            },
            "options": {
                "duration": 4,
                "resolution": "480p",
                "generateAudio": False,
                "returnLastFrame": True,
            },
        }
    )
    adapter = ByteDanceVideoAdapter(transport, settings)
    created = await adapter.create(request, "test-key")
    assert created.status == TaskStatus.QUEUED
    assert str(transport.calls[0].url) == "https://proxy.example.com/gateway/v1/videos"
    payload = transport.calls[0].payload
    assert payload is not None
    assert payload["model"] == request.model_id
    assert payload["prompt"] == "move"
    assert payload["seconds"] == "4"
    assert payload["metadata"]["content"][1]["role"] == "first_frame"
    assert payload["metadata"]["content"][2]["role"] == "last_frame"
    assert payload["metadata"]["resolution"] == "480p"
    assert payload["metadata"]["generate_audio"] is False
    assert payload["metadata"]["return_last_frame"] is True
    assert "service_tier" not in payload["metadata"]
    assert "model" not in payload["metadata"]
    assert "duration" not in payload["metadata"]
    result = await adapter.get_status(request.base_url, created.task_id, "test-key")
    assert str(transport.calls[1].url) == "https://proxy.example.com/gateway/v1/videos/task_1"
    assert result.status == TaskStatus.SUCCEEDED
    assert result.progress == 100
    assert result.output is not None
    assert result.output.video_url == "https://cdn.example.com/video.mp4"
    assert result.output.last_frame_url == "https://cdn.example.com/last.png"
    assert result.output.duration == 4


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("upstream", "expected"),
    [
        ("queued", TaskStatus.QUEUED),
        ("in_progress", TaskStatus.PROCESSING),
        ("failed", TaskStatus.FAILED),
        ("expired", TaskStatus.EXPIRED),
        ("cancelled", TaskStatus.CANCELLED),
    ],
)
async def test_compatible_video_statuses(
    settings: Settings, upstream: str, expected: TaskStatus
) -> None:
    transport = FakeTransport(
        [
            UpstreamResponse(
                status=200,
                data={
                    "id": "task_1",
                    "status": upstream,
                    "progress": 30,
                    "error": {"code": "TestError", "message": "test failure"}
                    if upstream == "failed"
                    else None,
                },
                headers={},
            )
        ]
    )
    result = await ByteDanceVideoAdapter(transport, settings).get_status(
        "https://proxy.example.com", "task_1", "key"
    )
    assert result.status == expected
    if upstream == "failed":
        assert result.error is not None and result.error.code == "TestError"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "data",
    [
        {"id": "task_1", "status": "unknown"},
        {"id": "task_1", "status": "completed"},
        {"id": "task_1", "status": "completed", "metadata": {"url": "http://127.0.0.1/private"}},
    ],
)
async def test_compatible_video_rejects_invalid_completion(
    settings: Settings, data: dict[str, object]
) -> None:
    transport = FakeTransport([UpstreamResponse(status=200, data=data, headers={})])
    with pytest.raises(ApplicationError):
        await ByteDanceVideoAdapter(transport, settings).get_status(
            "https://proxy.example.com", "task_1", "key"
        )


@pytest.mark.asyncio
async def test_compatible_video_does_not_retry_another_protocol(settings: Settings) -> None:
    transport = FakeTransport(
        [UpstreamResponse(status=404, data={"error": {"message": "not found"}}, headers={})]
    )
    request = ByteDanceVideoGenerationRequest.model_validate(
        {
            "apiFormat": "byteDanceVideo",
            "baseUrl": "https://proxy.example.com",
            "modelId": "doubao-seedance-2-0-260128-se",
            "mode": "textToVideo",
            "prompt": "test",
        }
    )
    with pytest.raises(ApplicationError):
        await ByteDanceVideoAdapter(transport, settings).create(request, "key")
    assert len(transport.calls) == 1
    assert str(transport.calls[0].url) == "https://proxy.example.com/v1/videos"
