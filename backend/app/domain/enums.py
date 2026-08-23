from enum import StrEnum


class ApiFormat(StrEnum):
    GOOGLE_GEMINI_IMAGE = "googleGeminiImage"
    OPENAI_IMAGE = "openaiImage"
    OPENAI_RESPONSES_IMAGE = "openaiResponsesImage"
    XAI_IMAGE = "xaiImage"
    BYTE_DANCE_VIDEO = "byteDanceVideo"
    XAI_VIDEO = "xaiVideo"


class MediaKind(StrEnum):
    IMAGE = "image"
    VIDEO = "video"


class TaskStatus(StrEnum):
    QUEUED = "queued"
    PROCESSING = "processing"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class TaskOperation(StrEnum):
    GENERATION = "generation"
    EXTENSION = "extension"


class ErrorCategory(StrEnum):
    VALIDATION = "validation"
    AUTHENTICATION = "authentication"
    PERMISSION = "permission"
    RATE_LIMIT = "rateLimit"
    MODERATION = "moderation"
    CAPABILITY_NOT_SUPPORTED = "capabilityNotSupported"
    UPSTREAM_TIMEOUT = "upstreamTimeout"
    UPSTREAM_UNAVAILABLE = "upstreamUnavailable"
    NETWORK = "network"
    SECURITY = "security"
    UPSTREAM_ERROR = "upstreamError"
    INTERNAL = "internal"
