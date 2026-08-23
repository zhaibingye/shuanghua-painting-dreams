import logging
from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.domain.enums import ErrorCategory
from app.domain.errors import ApplicationError
from app.schemas.errors import ErrorBody, ErrorEnvelope

logger = logging.getLogger(__name__)


def _request_id(request: Request) -> str:
    value = getattr(request.state, "request_id", "req_unknown")
    return value if isinstance(value, str) else "req_unknown"


async def application_error_handler(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, ApplicationError):
        return await unexpected_error_handler(request, exc)
    body = ErrorEnvelope(
        error=ErrorBody(
            code=exc.code,
            category=exc.category,
            message=exc.message,
            retryable=exc.retryable,
            api_format=exc.api_format,
            upstream_status=exc.upstream_status,
            request_id=_request_id(request),
            details=exc.details or None,
        )
    )
    logger.warning(
        "application error",
        extra={
            "route": request.url.path,
            "api_format": exc.api_format.value if exc.api_format is not None else None,
            "status": exc.http_status,
            "error_code": exc.code,
        },
    )
    return JSONResponse(status_code=exc.http_status, content=body.model_dump(by_alias=True))


async def validation_error_handler(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, RequestValidationError):
        return await unexpected_error_handler(request, exc)
    details: list[dict[str, Any]] = []
    for error in exc.errors():
        details.append(
            {
                "location": [str(item) for item in error.get("loc", ())],
                "type": error.get("type"),
                "message": error.get("msg"),
            }
        )
    body = ErrorEnvelope(
        error=ErrorBody(
            code="requestValidationFailed",
            category=ErrorCategory.VALIDATION,
            message="请求参数不符合要求。",
            retryable=False,
            request_id=_request_id(request),
            details={"errors": details},
        )
    )
    return JSONResponse(status_code=422, content=body.model_dump(by_alias=True))


async def unexpected_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception(
        "unhandled application error",
        extra={"route": request.url.path, "status": 500, "error_code": "internalError"},
    )
    body = ErrorEnvelope(
        error=ErrorBody(
            code="internalError",
            category=ErrorCategory.INTERNAL,
            message="服务器处理请求时发生内部错误。",
            retryable=False,
            request_id=_request_id(request),
        )
    )
    return JSONResponse(status_code=500, content=body.model_dump(by_alias=True))
