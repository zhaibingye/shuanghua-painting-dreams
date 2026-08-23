from dataclasses import dataclass, field
from typing import Any

from app.domain.enums import ApiFormat, ErrorCategory


@dataclass(slots=True)
class ApplicationError(Exception):
    code: str
    category: ErrorCategory
    message: str
    http_status: int
    retryable: bool = False
    api_format: ApiFormat | None = None
    upstream_status: int | None = None
    details: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        Exception.__init__(self, self.message)


class SecurityError(ApplicationError):
    def __init__(self, message: str, *, code: str = "unsafeBaseUrl") -> None:
        super().__init__(
            code=code,
            category=ErrorCategory.SECURITY,
            message=message,
            http_status=400,
            retryable=False,
        )
