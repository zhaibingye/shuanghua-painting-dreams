import pytest
from app.domain.capabilities import (
    byte_dance_model_capabilities,
    validate_byte_dance_video_request,
    validate_openai_image_request,
    validate_xai_video_request,
    xai_model_supports_extension,
)
from app.domain.errors import ApplicationError
from app.schemas.images import OpenAIImageGenerationRequest
from app.schemas.videos import ByteDanceVideoGenerationRequest, XAIVideoGenerationRequest


def test_gpt_image_2_transparent_background_is_supported_in_preview() -> None:
    request = OpenAIImageGenerationRequest.model_validate(
        {
            "apiFormat": "openaiImage",
            "baseUrl": "https://shapi.vip",
            "modelId": "gpt-image-2",
            "prompt": "logo",
            "options": {"background": "transparent", "outputFormat": "png"},
        }
    )
    validate_openai_image_request(request)


def test_seedance_2_rejects_camera_fixed() -> None:
    request = _byte_dance_request(
        "doubao-seedance-2-0-260128",
        options={"cameraFixed": True},
    )
    with pytest.raises(ApplicationError, match="固定机位"):
        validate_byte_dance_video_request(request)


def test_seedance_2_supports_4k() -> None:
    request = _byte_dance_request(
        "doubao-seedance-2-0-260128",
        options={"resolution": "4k"},
    )
    validate_byte_dance_video_request(request)
    assert byte_dance_model_capabilities("doubao-seedance-2-0-260128")["resolutions"] == [
        "480p",
        "720p",
        "1080p",
        "4k",
    ]


@pytest.mark.parametrize("resolution", ["1080p", "4k"])
def test_seedance_2_fast_rejects_unsupported_resolutions(resolution: str) -> None:
    with pytest.raises(ApplicationError, match="分辨率"):
        validate_byte_dance_video_request(
            _byte_dance_request(
                "doubao-seedance-2-0-fast-260128",
                options={"resolution": resolution},
            )
        )


@pytest.mark.parametrize(
    ("model_id", "expected"),
    [
        ("doubao-seedance-2-5-260628", ["480p", "720p", "1080p"]),
        ("doubao-seedance-2-0-mini-260615", ["480p", "720p"]),
        ("doubao-seedance-2-0-fast-260128-se", ["480p", "720p"]),
        ("doubao-seedance-1-0-lite-250128-se", ["480p", "720p"]),
        ("custom-seedance-endpoint-se", ["480p", "720p"]),
        ("doubao-seedance-2-0-260128-se", ["480p", "720p", "1080p", "4k"]),
    ],
)
def test_seedance_model_resolution_limits(model_id: str, expected: list[str]) -> None:
    assert byte_dance_model_capabilities(model_id)["resolutions"] == expected
    for resolution in expected:
        validate_byte_dance_video_request(
            _byte_dance_request(model_id, options={"resolution": resolution})
        )


@pytest.mark.parametrize(
    ("model_id", "duration", "resolution", "generate_audio"),
    [
        ("doubao-seedance-2-5-260628", -1, "720p", True),
        ("doubao-seedance-2-0-260128", 5, "720p", True),
        ("doubao-seedance-2-0-mini-260615", 5, "720p", True),
        ("doubao-seedance-1-0-pro-250528", 5, "1080p", False),
        ("doubao-seedance-1-0-pro-fast-251015", 5, "1080p", False),
    ],
)
def test_seedance_model_defaults(
    model_id: str, duration: int, resolution: str, generate_audio: bool
) -> None:
    request = _byte_dance_request(model_id)
    validate_byte_dance_video_request(request)
    assert request.options.duration == duration
    assert request.options.resolution == resolution
    assert request.options.generate_audio is generate_audio


@pytest.mark.parametrize("duration", [-1, 4, 30])
def test_seedance_2_5_duration(duration: int) -> None:
    validate_byte_dance_video_request(
        _byte_dance_request("doubao-seedance-2-5-260628", {"duration": duration})
    )


@pytest.mark.parametrize(
    ("model_id", "options", "message"),
    [
        ("doubao-seedance-2-5-260628", {"resolution": "4k"}, "分辨率"),
        ("doubao-seedance-2-0-mini-260615", {"resolution": "1080p"}, "分辨率"),
        ("doubao-seedance-2-0-fast-260128-se", {"resolution": "1080p"}, "分辨率"),
        ("doubao-seedance-2-0-260128", {"duration": 30}, "4~15"),
        ("doubao-seedance-2-5-260628", {"duration": 3}, "4~30"),
    ],
)
def test_seedance_rejects_invalid_model_options(
    model_id: str, options: dict[str, object], message: str
) -> None:
    with pytest.raises(ApplicationError, match=message):
        validate_byte_dance_video_request(_byte_dance_request(model_id, options))


@pytest.mark.parametrize("mode", ["firstFrameToVideo", "firstLastFrameToVideo"])
def test_seedance_2_5_frames_require_adaptive_ratio(mode: str) -> None:
    request = ByteDanceVideoGenerationRequest.model_validate(
        {
            "apiFormat": "byteDanceVideo",
            "baseUrl": "https://shapi.vip",
            "modelId": "doubao-seedance-2-5-260628",
            "mode": mode,
            "inputs": {
                "firstFrameUrl": "https://example.com/first.png",
                "lastFrameUrl": "https://example.com/last.png",
            },
            "options": {"aspectRatio": "16:9"},
        }
    )
    with pytest.raises(ApplicationError, match="adaptive"):
        validate_byte_dance_video_request(request)


def test_xai_reference_video_rejects_1080p() -> None:
    request = XAIVideoGenerationRequest.model_validate(
        {
            "apiFormat": "xaiVideo",
            "baseUrl": "https://shapi.vip",
            "modelId": "grok-imagine-video-1.5",
            "mode": "referenceToVideo",
            "prompt": "animate",
            "inputs": {"voiceIds": ["eve"]},
            "options": {"resolution": "1080p"},
        }
    )
    with pytest.raises(ApplicationError, match="最高支持 720p"):
        validate_xai_video_request(request)


def test_only_classic_xai_model_supports_extension() -> None:
    assert xai_model_supports_extension("grok-imagine-video")
    assert not xai_model_supports_extension("grok-imagine-video-1.5")
    assert not xai_model_supports_extension("custom-video")


def _byte_dance_request(
    model_id: str, options: dict[str, object] | None = None
) -> ByteDanceVideoGenerationRequest:
    payload: dict[str, object] = {
        "apiFormat": "byteDanceVideo",
        "baseUrl": "https://shapi.vip",
        "modelId": model_id,
        "mode": "textToVideo",
        "prompt": "snow",
    }
    if options is not None:
        payload["options"] = options
    return ByteDanceVideoGenerationRequest.model_validate(payload)
