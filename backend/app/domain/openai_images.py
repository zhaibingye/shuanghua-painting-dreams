"""OpenAI Image API capabilities, verified against the official docs on 2026-11-05.

https://developers.openai.com/api/docs/guides/image-generation
https://developers.openai.com/api/reference/resources/images/methods/generate
"""

import re
from typing import TypedDict

DEFAULT_IMAGE_MODEL = "gpt-image-2.5-sunburst"
IMAGE_MODELS = (
    DEFAULT_IMAGE_MODEL,
    "gpt-image-2.6-sunburst",
    "gpt-image-2.6-flare",
    "gpt-image-2.5-flare",
    "gpt-image-2",
    "gpt-image-1.5",
    "gpt-image-1",
    "gpt-image-1-mini",
    "chatgpt-image-latest",
)
STANDARD_SIZES = ("auto", "1024x1024", "1536x1024", "1024x1536")
QUALITIES = ("auto", "low", "medium", "high", "xhigh", "max")
MIN_PIXELS = 655_360
MAX_PIXELS = 8_294_400
MAX_EDGE = 3840


class ImageCapabilities(TypedDict):
    qualities: list[str]
    customImageSize: bool
    transparentBackground: bool
    inputFidelities: list[str]
    complexity: bool
    markupEditing: bool
    outputFormats: list[str]


def image_model_family(model_id: str) -> str:
    for family in IMAGE_MODELS:
        if model_id == family or re.fullmatch(
            rf"{re.escape(family)}-\d{{4}}-\d{{2}}-\d{{2}}", model_id
        ):
            return family
    return model_id


def openai_image_capabilities(model_id: str) -> ImageCapabilities:
    family = image_model_family(model_id)
    is_26 = family in {"gpt-image-2.6-sunburst", "gpt-image-2.6-flare"}
    sunburst_or_flare = is_26 or family in {"gpt-image-2.5-sunburst", "gpt-image-2.5-flare"}
    modern = family == "gpt-image-2" or sunburst_or_flare
    qualities = list(QUALITIES if sunburst_or_flare else QUALITIES[:4])
    fidelities = ["auto"]
    if family in {"gpt-image-1", "gpt-image-1.5"}:
        fidelities += ["low", "high"]
    elif family == "gpt-image-1-mini":
        fidelities += ["low"]
    return {
        "qualities": qualities,
        "customImageSize": modern,
        "transparentBackground": True,
        "inputFidelities": fidelities,
        "complexity": is_26,
        "markupEditing": sunburst_or_flare,
        "outputFormats": ["png", "jpeg", "webp", "svg", "gif"]
        if is_26
        else ["png", "jpeg", "webp"],
    }


def validate_image_size(value: str, *, animated: bool = False) -> str:
    if value == "auto":
        return value
    if not re.fullmatch(r"[0-9]+[xX][0-9]+", value):
        raise ValueError("图片尺寸必须是 auto 或 WIDTHxHEIGHT")
    width, height = map(int, value.lower().split("x"))
    if not (0 < width <= MAX_EDGE and 0 < height <= MAX_EDGE):
        raise ValueError("图片尺寸的每条边必须介于 1 和 3840 像素之间")
    if width % 16 or height % 16:
        raise ValueError("图片尺寸的宽和高必须是 16 的倍数")
    if animated:
        # The 2.6 guide allows small frames. Model-specific total GIF pixel budgets
        # are enforced upstream; do not apply the still-image minimum to each frame.
        return f"{width}x{height}"
    if max(width, height) > 3 * min(width, height):
        raise ValueError("图片尺寸的长短边比例不能超过 3:1")
    if not MIN_PIXELS <= width * height <= MAX_PIXELS:
        raise ValueError("图片总像素必须介于 655360 和 8294400 之间")
    return f"{width}x{height}"
