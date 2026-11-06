from app.domain.enums import ApiFormat, ErrorCategory, MediaKind
from app.domain.errors import ApplicationError
from app.domain.openai_images import IMAGE_MODELS, STANDARD_SIZES, openai_image_capabilities
from app.domain.options import OPTION_MODELS
from app.domain.seedance import DEFAULT_BYTE_DANCE_MODEL_ID
from app.domain.seedance import byte_dance_model_capabilities as byte_dance_model_capabilities
from app.schemas.image_turns import OpenAIImageTurnRequest, OpenAIResponsesImageTurnRequest
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
        default_options={},
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
            "editStreaming": True,
            "editPartialImages": True,
        },
        known_models={
            model_id: dict(openai_image_capabilities(model_id)) for model_id in IMAGE_MODELS
        },
        default_options={},
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
        default_options={},
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
        default_options={},
    ),
    ProviderMetadata(
        api_format=ApiFormat.BYTE_DANCE_IMAGE,
        media_kind=MediaKind.IMAGE,
        display_name="字节 Seedream 图像",
        default_base_url=_DEFAULT_BASE_URL,
        default_model_id="doubao-seedream-5-0-pro-260628",
        generic_capabilities={
            "textToImage": True,
            "imageEditing": True,
            "maskEditing": False,
            "maxReferenceImages": 14,
            "nativeBatchCount": True,
            "responseFormat": "b64_json",
        },
        known_models={
            "doubao-seedream-5-0-pro-260628": {
                "maxReferenceImages": 10,
                "imageSizes": ["1K", "1.5K", "2K"],
                "sequentialImageGeneration": False,
            },
        },
        default_options={},
    ),
    ProviderMetadata(
        api_format=ApiFormat.BYTE_DANCE_VIDEO,
        media_kind=MediaKind.VIDEO,
        display_name="字节 Seedance 视频",
        default_base_url=_DEFAULT_BASE_URL,
        default_model_id=DEFAULT_BYTE_DANCE_MODEL_ID,
        generic_capabilities={
            "textToVideo": True,
            "firstFrameToVideo": True,
            "firstLastFrameToVideo": True,
            "referenceToVideo": True,
            "localMediaUpload": True,
            "tailFrameContinuation": True,
        },
        known_models={
            model_id: byte_dance_model_capabilities(model_id)
            for model_id in (
                DEFAULT_BYTE_DANCE_MODEL_ID,
                "doubao-seedance-2-0-260128",
                "doubao-seedance-2-0-fast-260128",
                "doubao-seedance-2-0-mini-260615",
            )
        },
        default_options={},
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
            "resolutions": ["480p", "720p"],
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
        default_options={},
    ),
)


def provider_metadata() -> ProviderMetadataResponse:
    providers = [provider.model_copy(deep=True) for provider in _PROVIDER_DATA]
    for provider in providers:
        provider.default_options = OPTION_MODELS[provider.api_format]().model_dump(by_alias=True)
    return ProviderMetadataResponse(
        schema_version=4,
        providers=providers,
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
    request: OpenAIImageGenerationRequest
    | OpenAIImageEditRequest
    | OpenAIImageTurnRequest
    | OpenAIResponsesImageTurnRequest,
) -> None:
    model_id = (
        request.options.image_model
        if isinstance(request, OpenAIResponsesImageTurnRequest)
        else request.model_id
    )
    capabilities = openai_image_capabilities(model_id)
    if request.options.quality not in capabilities["qualities"]:
        raise _capability_error(
            "当前图像模型不支持所选质量；xhigh、max 仅支持 GPT Image 2.5 / 2.6。",
            request.api_format,
        )
    if not capabilities["customImageSize"] and request.options.size not in STANDARD_SIZES:
        raise _capability_error("当前图像模型仅支持 auto 和三种标准尺寸。", request.api_format)
    if not isinstance(request, OpenAIResponsesImageTurnRequest):
        if request.options.output_format not in capabilities["outputFormats"]:
            raise _capability_error("当前图像模型不支持所选输出格式。", request.api_format)
        if request.options.complexity != "auto" and not capabilities["complexity"]:
            raise _capability_error("复杂度控制仅支持 GPT Image 2.6。", request.api_format)
        editing = isinstance(request, OpenAIImageEditRequest) or (
            isinstance(request, OpenAIImageTurnRequest) and bool(request.source_images)
        )
        if editing and request.options.output_format in {"svg", "gif"}:
            raise _capability_error(
                "SVG / GIF 仅支持文生图，请移除编辑基图和参考图。", request.api_format
            )
        if (
            isinstance(request, (OpenAIImageEditRequest, OpenAIImageTurnRequest))
            and request.markup is not None
            and not capabilities["markupEditing"]
        ):
            raise _capability_error("标注编辑需要 GPT Image 2.5 / 2.6。", request.api_format)
    # auto is an application-level sentinel: omit input_fidelity on the wire.
    if (
        isinstance(
            request,
            (OpenAIImageEditRequest, OpenAIImageTurnRequest, OpenAIResponsesImageTurnRequest),
        )
        and request.options.input_fidelity not in capabilities["inputFidelities"]
    ):
        raise _capability_error(
            "当前图像模型不支持调整输入保真度，请选择 auto。", request.api_format
        )


def validate_byte_dance_video_request(request: ByteDanceVideoGenerationRequest) -> None:
    capabilities = byte_dance_model_capabilities(request.model_id)
    inputs = request.inputs
    options = request.options
    if request.mode not in capabilities["modes"]:
        raise _capability_error("当前模型不支持所选视频生成模式。", request.api_format)
    for count, maximum, label in (
        (len(inputs.reference_image_urls), capabilities["maxReferenceImages"], "参考图片"),
        (len(inputs.videos), capabilities["maxReferenceVideos"], "参考视频"),
        (len(inputs.audios), capabilities["maxReferenceAudios"], "参考音频"),
    ):
        if count > maximum:
            raise _capability_error(f"当前模型最多支持 {maximum} 个{label}。", request.api_format)
    if (
        inputs.audios
        and not (inputs.reference_image_urls or inputs.videos)
        and not capabilities["audioOnlyReference"]
    ):
        raise _capability_error("当前模型的参考音频需要搭配参考图片或视频。", request.api_format)
    task_type = options.omni_reference_task_type
    if task_type != "auto" and (
        not capabilities["omniReferenceTaskType"] or request.mode != "referenceToVideo"
    ):
        raise _capability_error("任务类型引导仅用于 Seedance 2.5 全模态参考。", request.api_format)
    if task_type in {"edit", "extend"}:
        if not inputs.videos or options.aspect_ratio != "adaptive":
            raise _capability_error(
                "视频编辑/延长需要参考视频，并使用 adaptive 比例。", request.api_format
            )
        if task_type == "edit" and options.duration != -1:
            raise _capability_error("视频编辑必须使用自动时长（-1）。", request.api_format)
    if options.output_format not in capabilities["outputFormats"]:
        raise _capability_error("当前模型不支持所选视频输出格式。", request.api_format)
    if options.priority and (not capabilities["priority"] or options.service_tier == "flex"):
        raise _capability_error("当前模型或服务等级不支持任务优先级。", request.api_format)
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
    if request.mode in {"firstFrameToVideo", "firstLastFrameToVideo"} and (
        "frameAspectRatios" in capabilities
        and request.options.aspect_ratio not in capabilities["frameAspectRatios"]
    ):
        raise _capability_error(
            "当前模型的首帧/首尾帧生视频仅支持 adaptive 比例。", request.api_format
        )
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
