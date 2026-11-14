from dataclasses import asdict, dataclass
from typing import Any

from app.domain.enums import ApiFormat, ErrorCategory
from app.domain.errors import ApplicationError
from app.schemas.images import ByteDanceImageOptions, GeminiImageOptions

NANO_BANANA_21_MODEL_ID = "gemini-nano-banana-2.1"
NANO_BANANA_21_SIZES = ("1K", "2K", "4K")
NANO_BANANA_21_THINKING_LEVELS = ("MINIMAL", "MEDIUM", "HIGH")
SEEDREAM_55_PREFIX = "doubao-seedream-5-5-"
SEEDREAM_55_MODEL_ID = f"{SEEDREAM_55_PREFIX}261028"


@dataclass(frozen=True, slots=True)
class SeedreamCapabilities:
    sizes: tuple[str, ...]
    min_pixels: int = 921_600
    max_pixels: int = 16_777_216
    max_reference_images: int = 14
    sequential: bool = True
    web_search: bool = False
    fast_prompt: bool = False
    png_output: bool = True
    layers: bool = False


_SEEDREAM_FAMILIES = (
    (
        SEEDREAM_55_PREFIX,
        SeedreamCapabilities(
            ("1K", "1.5K", "2K"),
            max_pixels=4_624_220,
            max_reference_images=10,
            sequential=False,
            layers=True,
        ),
    ),
    (
        "doubao-seedream-5-0-pro-",
        SeedreamCapabilities(
            ("1K", "1.5K", "2K"),
            max_pixels=4_624_220,
            max_reference_images=10,
            sequential=False,
            fast_prompt=True,
        ),
    ),
    (
        "doubao-seedream-5-0-flash-",
        SeedreamCapabilities(
            ("1K", "1.5K", "2K"), max_pixels=4_624_220, max_reference_images=10, sequential=False
        ),
    ),
    (
        "doubao-seedream-5-0-lite-",
        SeedreamCapabilities(("2K", "3K", "4K"), min_pixels=3_686_400, web_search=True),
    ),
    (
        "doubao-seedream-4-5-",
        SeedreamCapabilities(("2K", "4K"), min_pixels=3_686_400, png_output=False),
    ),
    (
        "doubao-seedream-4-0-",
        SeedreamCapabilities(("1K", "2K", "4K"), fast_prompt=True, png_output=False),
    ),
)


def seedream_capabilities(model_id: str) -> SeedreamCapabilities | None:
    return next(
        (
            capabilities
            for prefix, capabilities in _SEEDREAM_FAMILIES
            if model_id.startswith(prefix)
        ),
        None,
    )


def seedream_model_families() -> list[dict[str, Any]]:
    return [
        {"prefix": prefix, **asdict(capabilities), "sizes": list(capabilities.sizes)}
        for prefix, capabilities in _SEEDREAM_FAMILIES
    ]


def validate_gemini_options(model_id: str, options: GeminiImageOptions) -> None:
    if model_id == NANO_BANANA_21_MODEL_ID and (
        options.image_size not in NANO_BANANA_21_SIZES
        or options.thinking_level not in NANO_BANANA_21_THINKING_LEVELS
    ):
        raise ApplicationError(
            code="capabilityNotSupported",
            category=ErrorCategory.CAPABILITY_NOT_SUPPORTED,
            message="Nano Banana 2.1 支持 1K、2K、4K 和 MINIMAL、MEDIUM、HIGH 思考等级。",
            http_status=422,
            api_format=ApiFormat.GOOGLE_GEMINI_IMAGE,
        )


def validate_seedream_options(
    model_id: str, options: ByteDanceImageOptions, image_count: int
) -> None:
    def reject(message: str) -> None:
        raise ApplicationError(
            code="capabilityNotSupported",
            category=ErrorCategory.CAPABILITY_NOT_SUPPORTED,
            message=message,
            http_status=422,
            api_format=ApiFormat.BYTE_DANCE_IMAGE,
        )

    if options.background == "transparent" and options.output_format == "jpeg":
        reject("透明背景需要 PNG 输出。")
    if options.layer_decomposition:
        if image_count != 1:
            reject("图层拆分需要一张待拆分图片。")
        if options.background != "auto":
            reject("图层拆分时请将背景模式设为 auto。")
        if options.size not in {"auto", "1K", "1.5K", "2K"}:
            reject("图层拆分支持 auto、1K、1.5K、2K 分辨率档位。")
        if options.sequential_image_generation != "disabled" or options.web_search:
            reject("图层拆分时请关闭组图和联网搜索。")
    elif options.size == "auto":
        reject("auto 尺寸用于 Seedream 5.5 图层拆分。")
    capabilities = seedream_capabilities(model_id)
    if capabilities is None:
        return  # 自定义别名与 Endpoint ID 的模型能力由上游确认。
    if options.layer_decomposition and not capabilities.layers:
        reject("图层拆分选项适用于 Seedream 5.5。")
    if image_count > capabilities.max_reference_images:
        reject(f"当前 Seedream 模型最多支持 {capabilities.max_reference_images} 张参考图。")
    if not capabilities.sequential and options.sequential_image_generation != "disabled":
        reject("当前 Seedream 模型不支持组图。")
    if options.web_search and not capabilities.web_search:
        reject("联网搜索仅支持 Seedream 5.0 lite。")
    if options.optimize_prompt_mode == "fast" and not capabilities.fast_prompt:
        reject("fast 提示词优化仅支持 Seedream 4.0 / 5.0 pro。")
    if options.output_format == "png" and not capabilities.png_output:
        reject("Seedream 4.0 / 4.5 不支持选择输出格式。")
    if options.background != "auto" and not capabilities.layers:
        reject("当前 Seedream 模型无法使用所选背景模式。")
    if options.layer_decomposition:
        return
    if "x" not in options.size:
        if options.size not in capabilities.sizes:
            reject("当前 Seedream 模型不支持所选分辨率档位。")
        return
    width, height = (int(value) for value in options.size.split("x"))
    if not (
        capabilities.min_pixels <= width * height <= capabilities.max_pixels
        and height <= width * 16
        and width <= height * 16
    ):
        reject("尺寸超出当前 Seedream 模型的总像素或宽高比范围。")
