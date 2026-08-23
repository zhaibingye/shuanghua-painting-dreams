import pytest
from app.domain.enums import ApiFormat, ErrorCategory
from app.domain.errors import ApplicationError
from app.infrastructure.safe_http import UpstreamResponse
from app.providers.base import ensure_success


@pytest.mark.parametrize(
    ("status", "expected_category", "expected_code"),
    [
        (401, ErrorCategory.AUTHENTICATION, "invalidApiKey"),
        (403, ErrorCategory.PERMISSION, "upstreamPermissionDenied"),
        (429, ErrorCategory.RATE_LIMIT, "upstreamRateLimited"),
        (503, ErrorCategory.UPSTREAM_UNAVAILABLE, "upstreamUnavailable"),
    ],
)
def test_upstream_errors_are_normalized(
    status: int,
    expected_category: ErrorCategory,
    expected_code: str,
) -> None:
    response = UpstreamResponse(
        status=status,
        data={"error": {"code": "raw", "message": "upstream message"}},
        headers={},
    )

    with pytest.raises(ApplicationError) as caught:
        ensure_success(response, api_format=ApiFormat.OPENAI_IMAGE)

    assert caught.value.category == expected_category
    assert caught.value.code == expected_code
    assert caught.value.upstream_status == status


def test_creation_errors_are_not_marked_retryable() -> None:
    response = UpstreamResponse(status=503, data={}, headers={})
    with pytest.raises(ApplicationError) as caught:
        ensure_success(response, api_format=ApiFormat.XAI_VIDEO)
    assert not caught.value.retryable
