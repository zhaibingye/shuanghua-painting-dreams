import pytest
from app.domain.errors import SecurityError
from app.infrastructure.safe_resolver import ensure_public_ip, validate_literal_host
from app.infrastructure.url_builder import (
    build_upstream_url,
    encode_path_segment,
    validate_base_url,
)


def test_build_upstream_url_preserves_proxy_prefix() -> None:
    url = build_upstream_url(
        "https://example.com/gateway/",
        "/v1/images/generations",
    )
    assert str(url) == "https://example.com/gateway/v1/images/generations"


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "https://user:pass@example.com",
        "https://example.com?target=internal",
        "https://example.com/#fragment",
        "http://localhost",
    ],
)
def test_validate_base_url_rejects_unsafe_shapes(url: str) -> None:
    with pytest.raises(SecurityError):
        validate_base_url(url)


@pytest.mark.parametrize(
    "address",
    [
        "127.0.0.1",
        "::1",
        "fc00::1",
        "fe80::1",
        "::ffff:127.0.0.1",
        "10.0.0.1",
        "172.16.0.1",
        "192.168.1.1",
        "169.254.169.254",
        "100.64.0.1",
    ],
)
def test_non_public_ips_are_blocked(address: str) -> None:
    with pytest.raises(SecurityError):
        ensure_public_ip(address)


@pytest.mark.parametrize("address", ["8.8.8.8", "2001:4860:4860::8888"])
def test_public_literal_ip_is_allowed(address: str) -> None:
    validate_literal_host(address)


def test_path_parameter_cannot_escape_route() -> None:
    with pytest.raises(SecurityError):
        encode_path_segment("model/../../internal")
