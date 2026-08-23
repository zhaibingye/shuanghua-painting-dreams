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


def test_gpt_image_2_transparent_background_is_blocked() -> None:
    request = OpenAIImageGenerationRequest.model_validate(
        {
            "apiFormat": "openaiImage",
            "baseUrl": "https://shapi.vip",
            "modelId": "gpt-image-2",
            "prompt": "logo",
            "options": {"background": "transparent", "outputFormat": "png"},
        }
    )
    with pytest.raises(ApplicationError, match="透明背景"):
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
        ("doubao-seedance-2-0-fast-260128-se", ["480p", "720p", "1080p"]),
        ("doubao-seedance-1-0-lite-250128-se", ["480p", "720p", "1080p"]),
        ("custom-seedance-endpoint-se", ["480p", "720p", "1080p"]),
        ("doubao-seedance-2-0-260128-se", ["480p", "720p", "1080p", "4k"]),
    ],
)
def test_seedance_special_edition_unlocks_1080p(model_id: str, expected: list[str]) -> None:
    assert byte_dance_model_capabilities(model_id)["resolutions"] == expected
    validate_byte_dance_video_request(
        _byte_dance_request(model_id, options={"resolution": "1080p"})
    )


def test_seedance_special_edition_does_not_unlock_4k() -> None:
    with pytest.raises(ApplicationError, match="分辨率"):
        validate_byte_dance_video_request(
            _byte_dance_request(
                "doubao-seedance-2-0-fast-260128-se",
                options={"resolution": "4k"},
            )
        )


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
