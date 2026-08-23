import pytest
from app.schemas.image_turns import OpenAIImageTurnRequest
from app.schemas.images import OpenAIImageEditRequest
from app.schemas.videos import ByteDanceVideoGenerationRequest, XAIVideoGenerationRequest
from pydantic import ValidationError


def test_openai_mask_requires_single_image() -> None:
    with pytest.raises(ValidationError):
        OpenAIImageEditRequest.model_validate(
            {
                "apiFormat": "openaiImage",
                "baseUrl": "https://shapi.vip",
                "modelId": "gpt-image-2",
                "prompt": "edit",
                "images": [
                    {"kind": "url", "url": "https://example.com/a.png"},
                    {"kind": "url", "url": "https://example.com/b.png"},
                ],
                "mask": {
                    "kind": "dataUrl",
                    "dataUrl": "data:image/png;base64,aGVsbG8=",
                },
            }
        )


def test_openai_non_streaming_edit_rejects_partial_images() -> None:
    with pytest.raises(ValidationError):
        OpenAIImageEditRequest.model_validate(
            {
                "apiFormat": "openaiImage",
                "baseUrl": "https://shapi.vip",
                "modelId": "gpt-image-2",
                "prompt": "edit",
                "images": [{"kind": "url", "url": "https://example.com/a.png"}],
                "options": {"partialImages": 2},
            }
        )


def test_openai_conversation_options_cover_generation_and_editing() -> None:
    request = OpenAIImageTurnRequest.model_validate(
        {
            "apiFormat": "openaiImage",
            "baseUrl": "https://shapi.vip",
            "modelId": "gpt-image-2",
            "prompt": "edit",
            "sourceImages": [{"kind": "url", "url": "https://example.com/a.png"}],
            "options": {"partialImages": 3, "inputFidelity": "high"},
        }
    )

    assert request.options.partial_images == 3
    assert request.options.input_fidelity == "high"


def test_byte_dance_content_limit_includes_prompt() -> None:
    with pytest.raises(ValidationError):
        ByteDanceVideoGenerationRequest.model_validate(
            {
                "apiFormat": "byteDanceVideo",
                "baseUrl": "https://shapi.vip",
                "modelId": "doubao-seedance-2-0-260128",
                "mode": "referenceToVideo",
                "prompt": "reference",
                "inputs": {
                    "referenceImageUrls": [
                        "https://example.com/1.png",
                        "https://example.com/2.png",
                        "https://example.com/3.png",
                        "https://example.com/4.png",
                    ],
                    "referenceVideoUrl": "https://example.com/video.mp4",
                },
            }
        )


@pytest.mark.parametrize(
    "media_url",
    [
        "http://localhost/frame.png",
        "http://127.0.0.1/frame.png",
        "http://[::1]/frame.png",
        "http://169.254.169.254/latest/meta-data",
        "https://user:password@example.com/frame.png",
    ],
)
def test_media_inputs_reject_obviously_non_public_urls(media_url: str) -> None:
    with pytest.raises(ValidationError):
        ByteDanceVideoGenerationRequest.model_validate(
            {
                "apiFormat": "byteDanceVideo",
                "baseUrl": "https://shapi.vip",
                "modelId": "doubao-seedance-2-0-260128",
                "mode": "firstFrameToVideo",
                "prompt": "animate",
                "inputs": {"firstFrameUrl": media_url},
            }
        )


def test_xai_first_frame_and_reference_images_are_mutually_exclusive() -> None:
    with pytest.raises(ValidationError):
        XAIVideoGenerationRequest.model_validate(
            {
                "apiFormat": "xaiVideo",
                "baseUrl": "https://shapi.vip",
                "modelId": "grok-imagine-video-1.5",
                "mode": "referenceToVideo",
                "prompt": "animate",
                "inputs": {
                    "firstFrame": {"kind": "url", "url": "https://example.com/first.png"},
                    "referenceImages": [{"kind": "url", "url": "https://example.com/ref.png"}],
                },
            }
        )
