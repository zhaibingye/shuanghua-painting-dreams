from copy import deepcopy
from typing import Any

from app.domain.enums import ApiFormat, ErrorCategory, MediaKind
from app.domain.errors import ApplicationError
from app.schemas.image_turns import OpenAIImageTurnRequest
from app.schemas.images import OpenAIImageEditRequest, OpenAIImageGenerationRequest
from app.schemas.metadata import ProviderMetadata, ProviderMetadataResponse
from app.schemas.videos import ByteDanceVideoGenerationRequest, XAIVideoGenerationRequest

_DEFAULT_BASE_URL = "https://www.shapi.vip"

_PROVIDER_DATA: tuple[ProviderMetadata, ...] = (
    ProviderMetadata(
        api_format=ApiFormat.GOOGLE_GEMINI_IMAGE,
        media_kind=MediaKind.IMAGE,
        display_name="Google Gemini 图像",
        default_base_url=_DEFAULT_BASE_URL,
        default_model_id="nano-banana-2",
        generic_capabilities={
            "textToImage": True,
            "imageEditing": True,
            "maskEditing": False,
            "maxReferenceImages": 14,
            "nativeBatchCount": False,
            "qualityControl": False,
        },
        known_models={
            "nano-banana-2": {
                "imageSizes": ["512", "1K", "2K", "4K"],
                "maxReferenceImages": 14,
            }
        },
        default_options={
            "aspectRatio": "1:1",
            "imageSize": "1K",
            "responseModalities": "IMAGE",
            "thinkingLevel": "High",
            "includeThoughts": False,
        },
    ),
    ProviderMetadata(
        api_format=ApiFormat.OPENAI_IMAGE,
        media_kind=MediaKind.IMAGE,
        display_name="OpenAI Images",
        default_base_url=_DEFAULT_BASE_URL,
        default_model_id="gpt-image-2.5-sunburst",
        generic_capabilities={
            "textToImage": True,
            "imageEditing": True,
            "maskEditing": True,
            "maxReferenceImages": 16,
            "nativeBatchCount": True,
            "qualityControl": True,
            "generationStreaming": True,
            "generationPartialImages": True,
            "editStreaming": False,
            "editPartialImages": False,
        },
        known_models={
            "gpt-image-2": {
                "maskEditing": True,
                "transparentBackground": False,
                "customImageSize": True,
                "maxReferenceImages": 16,
            }
        },
        default_options={
            "count": 1,
            "size": "1024x1024",
            "quality": "auto",
            "outputFormat": "png",
            "outputCompression": 100,
            "background": "auto",
            "moderation": "auto",
            "partialImages": 2,
        },
    ),
    ProviderMetadata(
        api_format=ApiFormat.OPENAI_RESPONSES_IMAGE,
        media_kind=MediaKind.IMAGE,
        display_name="OpenAI Responses 图像",
        default_base_url=_DEFAULT_BASE_URL,
        default_model_id="gpt-5.6-luna",
        generic_capabilities={
            "textToImage": True,
            "imageEditing": True,
            "nativeConversation": True,
            "statelessConversation": True,
            "streaming": True,
            "partialImages": True,
            "maskEditing": False,
            "maxReferenceImages": 16,
            "nativeBatchCount": False,
            "qualityControl": True,
        },
        known_models={
            "gpt-5.6-luna": {
                "responsesImageTool": True,
                "statelessConversation": True,
            }
        },
        default_options={
            "size": "auto",
            "quality": "auto",
            "outputFormat": "png",
            "outputCompression": 100,
            "background": "auto",
            "moderation": "auto",
            "inputFidelity": "auto",
            "partialImages": 2,
        },
    ),
    ProviderMetadata(
        api_format=ApiFormat.XAI_IMAGE,
        media_kind=MediaKind.IMAGE,
        display_name="xAI 图像",
        default_base_url=_DEFAULT_BASE_URL,
        default_model_id="grok-imagine-image-2.0",
        generic_capabilities={
            "textToImage": True,
            "imageEditing": True,
            "maskEditing": False,
            "maxReferenceImages": 3,
            "nativeBatchCount": True,
            "qualityControl": True,
            "responseFormat": "b64_json",
        },
        known_models={
            "grok-imagine-image-2.0": {
                "resolutions": ["1k", "2k"],
                "qualities": ["low", "medium"],
                "maxReferenceImages": 3,
            }
        },
        default_options={
            "count": 1,
            "aspectRatio": "1:1",
            "resolution": "1k",
            "quality": "medium",
        },
    ),
    ProviderMetadata(
        api_format=ApiFormat.BYTE_DANCE_VIDEO,
        media_kind=MediaKind.VIDEO,
        display_name="字节 Seedance 视频",
        default_base_url=_DEFAULT_BASE_URL,
        default_model_id="doubao-seedance-2-0-260128",
        generic_capabilities={
            "textToVideo": True,
            "firstFrameToVideo": True,
            "firstLastFrameToVideo": True,
            "referenceToVideo": True,
            "localMediaUpload": False,
            "tailFrameContinuation": True,
        },
        known_models={
            "doubao-seedance-2-0-260128": {
                "durationMin": 4,
                "durationMax": 15,
                "automaticDuration": True,
                "resolutions": ["480p", "720p", "1080p", "4k"],
                "aspectRatios": ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"],
                "generateAudio": True,
                "cameraFixed": False,
                "serviceTiers": ["default"],
                "serviceTierParameter": False,
                "webSearch": True,
                "returnLastFrame": True,
            }
        },
        default_options={
            "duration": 5,
            "resolution": "720p",
            "aspectRatio": "adaptive",
            "generateAudio": False,
            "watermark": False,
            "seed": -1,
            "returnLastFrame": False,
            "cameraFixed": False,
            "serviceTier": "default",
            "webSearch": False,
        },
    ),
    ProviderMetadata(
        api_format=ApiFormat.XAI_VIDEO,
        media_kind=MediaKind.VIDEO,
        display_name="xAI Grok 视频",
        default_base_url=_DEFAULT_BASE_URL,
        default_model_id="grok-imagine-video-1.5",
        generic_capabilities={
            "textToVideo": True,
            "firstFrameToVideo": True,
            "referenceToVideo": True,
            "firstLastFrameToVideo": False,
            "voiceIds": True,
            "videoExtension": False,
        },
        known_models={
            "grok-imagine-video-1.5": {
                "resolutions": ["480p", "720p", "1080p"],
                "referenceMaxResolution": "720p",
                "durationMin": 1,
                "durationMax": 15,
                "videoExtension": False,
            },
            "grok-imagine-video": {
                "resolutions": ["480p", "720p"],
                "durationMin": 1,
                "durationMax": 15,
                "videoExtension": True,
                "extensionDurationMin": 2,
                "extensionDurationMax": 10,
            },
        },
        default_options={
            "duration": 8,
            "resolution": "720p",
            "aspectRatio": "16:9",
            "voiceIds": [],
        },
    ),
)


def provider_metadata() -> ProviderMetadataResponse:
    return ProviderMetadataResponse(
        schema_version=3,
        providers=[provider.model_copy(deep=True) for provider in _PROVIDER_DATA],
    )


def _capability_error(message: str, api_format: ApiFormat) -> ApplicationError:
    return ApplicationError(
        code="capabilityNotSupported",
        category=ErrorCategory.CAPABILITY_NOT_SUPPORTED,
        message=message,
        http_status=422,
        retryable=False,
        api_format=api_format,
    )


def validate_openai_image_request(
    request: OpenAIImageGenerationRequest | OpenAIImageEditRequest | OpenAIImageTurnRequest,
) -> None:
    if request.model_id == "gpt-image-2" and request.options.background == "transparent":
        raise _capability_error("gpt-image-2 当前不支持透明背景。", request.api_format)


_SEEDANCE_2_0_MODEL_ID = "doubao-seedance-2-0-260128"
_SEEDANCE_SPECIAL_EDITION_SUFFIX = "-se"
_RESOLUTION_1080P = "1080p"


def byte_dance_model_capabilities(model_id: str) -> dict[str, Any]:
    capabilities = _byte_dance_family_capabilities(model_id)
    if model_id.endswith(_SEEDANCE_SPECIAL_EDITION_SUFFIX):
        _ensure_resolution(capabilities, _RESOLUTION_1080P)
    return capabilities


def _byte_dance_family_capabilities(model_id: str) -> dict[str, Any]:
    if model_id.startswith("doubao-seedance-2-0-fast-"):
        return {
            "durationMin": 4,
            "durationMax": 15,
            "automaticDuration": True,
            "resolutions": ["480p", "720p"],
            "generateAudio": True,
            "cameraFixed": False,
            "serviceTiers": ["default"],
            "serviceTierParameter": False,
            "webSearch": True,
        }
    if model_id.startswith("doubao-seedance-2-0-"):
        provider = next(
            item for item in _PROVIDER_DATA if item.api_format == ApiFormat.BYTE_DANCE_VIDEO
        )
        return deepcopy(provider.known_models[_SEEDANCE_2_0_MODEL_ID])
    if model_id.startswith("doubao-seedance-1-5-pro-"):
        return {
            "durationMin": 4,
            "durationMax": 12,
            "automaticDuration": True,
            "resolutions": ["480p", "720p", "1080p"],
            "generateAudio": True,
            "cameraFixed": True,
            "serviceTiers": ["default", "flex"],
            "serviceTierParameter": True,
            "webSearch": False,
        }
    if model_id.startswith("doubao-seedance-1-0-lite-"):
        return {
            "durationMin": 2,
            "durationMax": 12,
            "automaticDuration": False,
            "resolutions": ["480p", "720p"],
            "generateAudio": False,
            "cameraFixed": True,
            "serviceTiers": ["default", "flex"],
            "serviceTierParameter": True,
            "webSearch": False,
        }
    if model_id.startswith("doubao-seedance-1-0-"):
        return {
            "durationMin": 2,
            "durationMax": 12,
            "automaticDuration": False,
            "resolutions": ["480p", "720p", "1080p"],
            "generateAudio": False,
            "cameraFixed": True,
            "serviceTiers": ["default", "flex"],
            "serviceTierParameter": True,
            "webSearch": False,
        }
    return {
        "durationMin": 2,
        "durationMax": 15,
        "automaticDuration": False,
        "resolutions": ["480p", "720p"],
        "generateAudio": False,
        "cameraFixed": False,
        "serviceTiers": ["default"],
        "serviceTierParameter": False,
        "webSearch": False,
    }


def _ensure_resolution(capabilities: dict[str, Any], resolution: str) -> None:
    resolutions = capabilities["resolutions"]
    if not isinstance(resolutions, list):
        capabilities["resolutions"] = [resolution]
        return
    if resolution not in resolutions:
        capabilities["resolutions"] = [*resolutions, resolution]


def validate_byte_dance_video_request(request: ByteDanceVideoGenerationRequest) -> None:
    capabilities = byte_dance_model_capabilities(request.model_id)
    duration = request.options.duration
    if duration == -1 and not capabilities["automaticDuration"]:
        raise _capability_error("当前字节视频模型不支持自动时长。", request.api_format)
    if duration != -1 and not (
        capabilities["durationMin"] <= duration <= capabilities["durationMax"]
    ):
        raise _capability_error(
            f"当前模型支持 {capabilities['durationMin']}~{capabilities['durationMax']} 秒。",
            request.api_format,
        )
    if request.options.resolution not in capabilities["resolutions"]:
        raise _capability_error("当前模型不支持所选分辨率。", request.api_format)
    if request.options.generate_audio and not capabilities["generateAudio"]:
        raise _capability_error("当前模型不支持音频生成。", request.api_format)
    if request.options.camera_fixed and not capabilities["cameraFixed"]:
        raise _capability_error("当前模型不支持固定机位参数。", request.api_format)
    if request.options.service_tier not in capabilities["serviceTiers"]:
        raise _capability_error("当前模型不支持所选服务等级。", request.api_format)
    if request.options.web_search and not capabilities["webSearch"]:
        raise _capability_error("当前模型不支持 Web Search。", request.api_format)


def validate_xai_video_request(request: XAIVideoGenerationRequest) -> None:
    if request.options.resolution != "1080p":
        return
    if request.model_id != "grok-imagine-video-1.5":
        raise _capability_error("只有已知支持的 xAI 模型才能选择 1080p。", request.api_format)
    if request.mode == "referenceToVideo":
        raise _capability_error("xAI 多参考生视频最高支持 720p。", request.api_format)


def xai_model_supports_extension(model_id: str) -> bool:
    return model_id == "grok-imagine-video"
