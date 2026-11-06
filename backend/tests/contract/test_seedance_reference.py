from typing import Any

import pytest
from app.domain.capabilities import validate_byte_dance_video_request
from app.domain.errors import ApplicationError
from app.infrastructure.config import Settings
from app.infrastructure.safe_http import UpstreamResponse
from app.providers.bytedance_video import ByteDanceVideoAdapter
from app.schemas.videos import ByteDanceVideoGenerationRequest
from pydantic import ValidationError

from tests.conftest import FakeTransport

IMAGE = "data:image/png;base64,aGVsbG8="
AUDIO = "data:audio/wav;base64,aGVsbG8="


def request_for(**changes: Any) -> ByteDanceVideoGenerationRequest:
    return ByteDanceVideoGenerationRequest.model_validate(
        {
            "apiFormat": "byteDanceVideo",
            "baseUrl": "https://ark.cn-beijing.volces.com",
            "modelId": "doubao-seedance-2-5-260628",
            "mode": "referenceToVideo",
            "inputs": {"referenceImageUrls": [IMAGE]},
            **changes,
        }
    )


@pytest.mark.parametrize("official", [True, False])
async def test_multimodal_reference_payload(settings: Settings, official: bool) -> None:
    request = request_for(
        baseUrl="https://ark.cn-beijing.volces.com" if official else "https://proxy.example.com",
        prompt="参考素材生成新视频",
        inputs={
            "referenceImageUrls": [IMAGE] + [f"asset://image_{index}" for index in range(29)],
            "referenceVideoUrls": [f"asset://video_{index}" for index in range(10)],
            "referenceAudioUrls": [AUDIO] + [f"asset://audio_{index}" for index in range(9)],
        },
        options={"omniReferenceTaskType": "reference", "outputFormat": "mov", "priority": 5},
    )
    validate_byte_dance_video_request(request)
    transport = FakeTransport(
        [UpstreamResponse(status=200, data={"id": "task_1", "status": "queued"}, headers={})]
    )
    await ByteDanceVideoAdapter(transport, settings).create(request, "test-key")
    payload = transport.calls[0].payload
    assert payload is not None
    native = payload if official else payload["metadata"]
    content = native["content"]
    assert len(content) == 51
    assert content[1] == {
        "type": "image_url",
        "image_url": {"url": IMAGE},
        "role": "reference_image",
    }
    assert content[31]["role"] == "reference_video"
    assert content[41] == {
        "type": "audio_url",
        "audio_url": {"url": AUDIO},
        "role": "reference_audio",
    }
    assert native["omni_reference_task_type"] == "reference"
    assert native["output_format"] == "mov"
    assert native["priority"] == 5
    assert not transport.downloads
    assert len(transport.calls) == 1


async def test_local_first_and_last_frame_payload(settings: Settings) -> None:
    request = request_for(
        mode="firstLastFrameToVideo",
        inputs={"firstFrameUrl": IMAGE, "lastFrameUrl": "asset://last_frame"},
    )
    validate_byte_dance_video_request(request)
    transport = FakeTransport([UpstreamResponse(status=200, data={"id": "task_1"}, headers={})])
    await ByteDanceVideoAdapter(transport, settings).create(request, "test-key")
    payload = transport.calls[0].payload
    assert payload is not None
    assert payload["content"] == [
        {"type": "image_url", "image_url": {"url": IMAGE}, "role": "first_frame"},
        {"type": "image_url", "image_url": {"url": "asset://last_frame"}, "role": "last_frame"},
    ]


@pytest.mark.parametrize(
    ("model", "images", "videos", "audios"),
    [("2-0", 9, 3, 3), ("2-5", 30, 10, 10)],
)
def test_reference_limits(model: str, images: int, videos: int, audios: int) -> None:
    inputs: dict[str, Any] = {
        "referenceImageUrls": [IMAGE] * images,
        "referenceVideoUrls": ["asset://video"] * videos,
        "referenceAudioUrls": [AUDIO] * audios,
    }
    request = request_for(modelId=f"doubao-seedance-{model}-test", inputs=inputs)
    validate_byte_dance_video_request(request)
    for field in inputs:
        excessive = {**inputs, field: [*inputs[field], inputs[field][0]]}
        with pytest.raises((ValidationError, ApplicationError)):
            validate_byte_dance_video_request(
                request_for(modelId=f"doubao-seedance-{model}-test", inputs=excessive)
            )


def test_audio_only_and_optional_reference_prompt() -> None:
    validate_byte_dance_video_request(request_for(inputs={"referenceAudioUrls": [AUDIO]}))
    with pytest.raises(ApplicationError, match="搭配"):
        validate_byte_dance_video_request(
            request_for(
                modelId="doubao-seedance-2-0-260128", inputs={"referenceAudioUrls": [AUDIO]}
            )
        )


@pytest.mark.parametrize("mode", ["textToVideo", "firstFrameToVideo", "firstLastFrameToVideo"])
def test_frame_and_reference_modes_cannot_mix(mode: str) -> None:
    with pytest.raises(ValidationError, match="不能混用"):
        request_for(
            mode=mode,
            prompt="move",
            inputs={"firstFrameUrl": IMAGE, "lastFrameUrl": IMAGE, "referenceImageUrls": [IMAGE]},
        )


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"modelId": "doubao-seedance-1-0-pro-250528"}, "生成模式"),
        ({"modelId": "doubao-seedance-2-0-260128", "options": {"outputFormat": "mov"}}, "输出格式"),
        (
            {"modelId": "doubao-seedance-2-0-260128", "options": {"omniReferenceTaskType": "edit"}},
            "任务类型",
        ),
        ({"options": {"omniReferenceTaskType": "edit"}}, "需要参考视频"),
        (
            {
                "options": {"omniReferenceTaskType": "edit", "duration": 5},
                "inputs": {"referenceVideoUrls": ["asset://video"]},
            },
            "自动时长",
        ),
        (
            {
                "options": {"omniReferenceTaskType": "extend", "aspectRatio": "16:9"},
                "inputs": {"referenceVideoUrls": ["asset://video"]},
            },
            "adaptive",
        ),
    ],
)
def test_reference_model_and_task_constraints(changes: dict[str, Any], message: str) -> None:
    with pytest.raises(ApplicationError, match=message):
        validate_byte_dance_video_request(request_for(**changes))


@pytest.mark.parametrize("task_type", ["edit", "extend"])
def test_edit_and_extend_with_reference_video(task_type: str) -> None:
    validate_byte_dance_video_request(
        request_for(
            inputs={"referenceVideoUrls": ["asset://video"]},
            options={"omniReferenceTaskType": task_type},
        )
    )
