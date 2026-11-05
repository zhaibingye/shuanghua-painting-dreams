from typing import Any

from app.domain.enums import ApiFormat
from app.schemas.common import ApiModel
from app.schemas.image_turns import OpenAIImageTurnOptions, OpenAIResponsesImageOptions
from app.schemas.images import ByteDanceImageOptions, GeminiImageOptions, XAIImageOptions
from app.schemas.videos import ByteDanceVideoOptions, XAIVideoExtensionOptions, XAIVideoOptions

# 请求校验、默认值与前端表单共用这些 Pydantic 模型。
OPTION_MODELS: dict[ApiFormat, type[ApiModel]] = {
    ApiFormat.GOOGLE_GEMINI_IMAGE: GeminiImageOptions,
    ApiFormat.OPENAI_IMAGE: OpenAIImageTurnOptions,
    ApiFormat.OPENAI_RESPONSES_IMAGE: OpenAIResponsesImageOptions,
    ApiFormat.XAI_IMAGE: XAIImageOptions,
    ApiFormat.BYTE_DANCE_IMAGE: ByteDanceImageOptions,
    ApiFormat.BYTE_DANCE_VIDEO: ByteDanceVideoOptions,
    ApiFormat.XAI_VIDEO: XAIVideoOptions,
}


def option_schemas() -> dict[str, Any]:
    return {
        **{
            key.value: model.model_json_schema(by_alias=True)
            for key, model in OPTION_MODELS.items()
        },
        "xaiVideoExtension": XAIVideoExtensionOptions.model_json_schema(by_alias=True),
    }
