import pytest
from app.domain.capabilities import validate_openai_image_request
from app.domain.errors import ApplicationError
from app.domain.openai_images import openai_image_capabilities
from app.schemas.image_turns import OpenAIResponsesImageOptions, OpenAIResponsesImageTurnRequest
from app.schemas.images import (
    OpenAIImageEditRequest,
    OpenAIImageGenerationRequest,
    OpenAIImageOptions,
)
from pydantic import ValidationError


@pytest.mark.parametrize("quality", ["auto", "low", "medium", "high", "xhigh", "max"])
@pytest.mark.parametrize("model", ["gpt-image-2.5-sunburst", "gpt-image-2.5-flare-2026-09-08"])
def test_image_2_5_quality(model: str, quality: str) -> None:
    request = OpenAIImageGenerationRequest.model_validate(
        {
            "apiFormat": "openaiImage",
            "baseUrl": "https://example.com",
            "modelId": model,
            "prompt": "flower",
            "options": {"quality": quality},
        }
    )
    validate_openai_image_request(request)


@pytest.mark.parametrize(
    "size", ["auto", "1024X1024", "2048x1152", "3840x2160", "2160x3840", "2880x2880"]
)
def test_valid_sizes_shared_by_images_and_responses(size: str) -> None:
    assert OpenAIImageOptions(size=size).size == size.lower()
    assert OpenAIResponsesImageOptions(size=size).size == size.lower()


@pytest.mark.parametrize(
    "size",
    [
        "0x1024",
        "-16x1024",
        "1025x1024",
        "4096x1024",
        "4096x4096",
        "3840x3840",
        "512x512",
        "3072x512",
        "1024 x1024",
        "1024x1024x1024",
        "１２８０x７２０",
    ],
)
def test_invalid_size_rejected_by_both_schemas(size: str) -> None:
    for schema in (OpenAIImageOptions, OpenAIResponsesImageOptions):
        with pytest.raises(ValidationError):
            schema(size=size)


@pytest.mark.parametrize(
    "model,options,message",
    [
        ("gpt-image-2", {"quality": "max"}, "质量"),
        ("gpt-image-1.5", {"size": "2048x2048"}, "尺寸"),
        ("gpt-image-2.5-flare", {"inputFidelity": "high"}, "保真度"),
        ("gpt-image-2", {"inputFidelity": "high"}, "保真度"),
        ("gpt-image-1-mini", {"inputFidelity": "high"}, "保真度"),
    ],
)
def test_model_dependent_options(model: str, options: dict[str, object], message: str) -> None:
    request = OpenAIImageEditRequest.model_validate(
        {
            "apiFormat": "openaiImage",
            "baseUrl": "https://example.com",
            "modelId": model,
            "prompt": "edit",
            "images": [{"kind": "url", "url": "https://example.com/a.png"}],
            "options": options,
        }
    )
    with pytest.raises(ApplicationError, match=message):
        validate_openai_image_request(request)


def test_responses_validates_image_model_instead_of_mainline_model() -> None:
    request = OpenAIResponsesImageTurnRequest.model_validate(
        {
            "apiFormat": "openaiResponsesImage",
            "baseUrl": "https://example.com",
            "modelId": "gpt-5.6-luna",
            "prompt": "flower",
            "options": {"imageModel": "gpt-image-2", "quality": "max"},
        }
    )
    with pytest.raises(ApplicationError, match="质量"):
        validate_openai_image_request(request)


@pytest.mark.parametrize("schema", [OpenAIImageOptions, OpenAIResponsesImageOptions])
def test_output_constraints(
    schema: type[OpenAIImageOptions] | type[OpenAIResponsesImageOptions],
) -> None:
    with pytest.raises(ValidationError, match="透明背景"):
        schema(background="transparent", output_format="jpeg")
    with pytest.raises(ValidationError):
        schema(safety_identifier="x" * 129)
    with pytest.raises(ValidationError):
        schema(output_compression=101)


def test_snapshot_model_capabilities_match_alias() -> None:
    assert openai_image_capabilities(
        "gpt-image-2.5-sunburst-2026-09-08"
    ) == openai_image_capabilities("gpt-image-2.5-sunburst")
