from typing import Any

from app.domain.enums import ApiFormat, ErrorCategory
from app.schemas.common import ApiModel


class ErrorBody(ApiModel):
    code: str
    category: ErrorCategory
    message: str
    retryable: bool
    request_id: str
    api_format: ApiFormat | None = None
    upstream_status: int | None = None
    details: dict[str, Any] | None = None


class ErrorEnvelope(ApiModel):
    error: ErrorBody
