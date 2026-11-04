from typing import Any

from app.domain.enums import ApiFormat, ErrorCategory
from app.domain.errors import ApplicationError
from app.schemas.common import ApiModel
from app.schemas.image_turns import OpenAIImageTurnOptions, OpenAIResponsesImageOptions
from app.schemas.images import ByteDanceImageOptions, GeminiImageOptions, XAIImageOptions

# 请求校验、默认值与前端表单共用这些 Pydantic 模型。由 export_openapi.py 导出。
IMAGE_OPTION_MODELS: dict[ApiFormat, type[ApiModel]] = {
    ApiFormat.GOOGLE_GEMINI_IMAGE: GeminiImageOptions,
    ApiFormat.OPENAI_IMAGE: OpenAIImageTurnOptions,
    ApiFormat.OPENAI_RESPONSES_IMAGE: OpenAIResponsesImageOptions,
    ApiFormat.XAI_IMAGE: XAIImageOptions,
    ApiFormat.BYTE_DANCE_IMAGE: ByteDanceImageOptions,
}


def image_option_schemas() -> dict[str, Any]:
    return {
        key.value: model.model_json_schema(by_alias=True)
        for key, model in IMAGE_OPTION_MODELS.items()
    }


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

    is_pro = model_id.startswith("doubao-seedream-5-0-pro-")
    is_flash = model_id.startswith("doubao-seedream-5-0-flash-")
    is_lite = model_id.startswith("doubao-seedream-5-0-lite-")
    is_45 = model_id.startswith("doubao-seedream-4-5-")
    is_40 = model_id.startswith("doubao-seedream-4-0-")
    if not any((is_pro, is_flash, is_lite, is_45, is_40)):
        return  # 自定义别名与 Endpoint ID 的模型能力由上游确认。
    if (is_pro or is_flash) and image_count > 10:
        reject("Seedream 5.0 pro / flash 最多支持 10 张参考图。")
    if (is_pro or is_flash) and options.sequential_image_generation != "disabled":
        reject("Seedream 5.0 pro / flash 不支持组图。")
    if options.web_search and not is_lite:
        reject("联网搜索仅支持 Seedream 5.0 lite。")
    if options.optimize_prompt_mode == "fast" and not (is_pro or is_40):
        reject("fast 提示词优化仅支持 Seedream 4.0 / 5.0 pro。")
    if options.output_format != "jpeg" and (is_40 or is_45):
        reject("Seedream 4.0 / 4.5 不支持选择输出格式。")
    sizes = (
        {"1K", "1.5K", "2K"}
        if is_pro or is_flash
        else {"2K", "3K", "4K"}
        if is_lite
        else {"2K", "4K"}
        if is_45
        else {"1K", "2K", "4K"}
    )
    if "x" not in options.size:
        if options.size not in sizes:
            reject("当前 Seedream 模型不支持所选分辨率档位。")
        return
    width, height = (int(value) for value in options.size.split("x"))
    minimum = 921600 if is_pro or is_flash or is_40 else 3686400
    maximum = 4624220 if is_pro or is_flash else 16777216
    if not (minimum <= width * height <= maximum and 1 / 16 <= width / height <= 16):
        reject("尺寸超出当前 Seedream 模型的总像素或宽高比范围。")
