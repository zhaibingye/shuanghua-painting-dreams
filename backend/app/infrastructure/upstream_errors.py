from collections.abc import Mapping
from typing import Any, NoReturn

from app.domain.enums import ApiFormat, ErrorCategory
from app.domain.errors import ApplicationError


def raise_for_upstream_status(
    *,
    status: int,
    data: Any,
    api_format: ApiFormat,
    retryable: bool = False,
) -> None:
    if 200 <= status < 300:
        return
    raise build_upstream_error(
        status=status,
        data=data,
        api_format=api_format,
        retryable=retryable,
    )


def build_upstream_error(
    *,
    status: int,
    data: Any,
    api_format: ApiFormat,
    retryable: bool = False,
) -> ApplicationError:
    payload = data if isinstance(data, Mapping) else {}
    error = payload.get("error")
    error_mapping = error if isinstance(error, Mapping) else {}
    code_value = error_mapping.get("code") or payload.get("code")
    message_value = error_mapping.get("message") or payload.get("message")
    upstream_code = str(code_value) if code_value is not None else "upstreamError"
    message = _safe_message(message_value)

    moderation_codes = {
        "moderation_blocked",
        "InputTextSensitiveContentDetected",
        "InputImageSensitiveContentDetected",
        "OutputVideoSensitiveContentDetected",
    }
    if upstream_code in moderation_codes or status == 422:
        category = ErrorCategory.MODERATION
        code = "moderationBlocked"
        default_message = "输入或输出内容未通过上游安全审核。"
        http_status = 400
    elif status == 401:
        category = ErrorCategory.AUTHENTICATION
        code = "invalidApiKey"
        default_message = "API Key 缺失、无效或已过期。"
        http_status = 401
    elif status == 403:
        category = ErrorCategory.PERMISSION
        code = "upstreamPermissionDenied"
        default_message = "当前 Key 没有模型权限、额度不足或账号受限。"
        http_status = 403
    elif status == 429:
        category = ErrorCategory.RATE_LIMIT
        code = "upstreamRateLimited"
        default_message = "上游 API 当前请求过多或额度不足。"
        http_status = 429
    elif status >= 500:
        category = ErrorCategory.UPSTREAM_UNAVAILABLE
        code = "upstreamUnavailable"
        default_message = "上游 API 暂时不可用。"
        http_status = 503
    else:
        category = ErrorCategory.UPSTREAM_ERROR
        code = upstream_code
        default_message = "上游 API 拒绝了当前请求。"
        http_status = status if 400 <= status < 500 else 502

    return ApplicationError(
        code=code,
        category=category,
        message=message or default_message,
        http_status=http_status,
        retryable=retryable,
        api_format=api_format,
        upstream_status=status,
        details={"upstreamCode": upstream_code},
    )


def raise_upstream_error(
    *,
    status: int,
    data: Any,
    api_format: ApiFormat,
    retryable: bool = False,
) -> NoReturn:
    raise build_upstream_error(
        status=status,
        data=data,
        api_format=api_format,
        retryable=retryable,
    )


def _safe_message(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    if "base64," in text or len(text) > 1000:
        return text[:1000] + "…"
    return text
