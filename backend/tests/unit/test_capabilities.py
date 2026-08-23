import pytest
from app.domain.capabilities import (
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
    request = ByteDanceVideoGenerationRequest.model_validate(
        {
            "apiFormat": "byteDanceVideo",
            "baseUrl": "https://shapi.vip",
            "modelId": "doubao-seedance-2-0-260128",
            "mode": "textToVideo",
            "prompt": "snow",
            "options": {"cameraFixed": True},
        }
    )
    with pytest.raises(ApplicationError, match="固定机位"):
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
