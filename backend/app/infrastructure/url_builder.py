from urllib.parse import quote

from yarl import URL

from app.domain.errors import SecurityError

_ALLOWED_SCHEMES = {"http", "https"}
_BLOCKED_HOSTNAMES = {"localhost", "localhost.localdomain", "metadata.google.internal"}


def validate_base_url(raw_url: str) -> URL:
    try:
        url = URL(raw_url.strip())
    except ValueError as exc:
        raise SecurityError("Base URL 格式无效。") from exc

    if url.scheme.lower() not in _ALLOWED_SCHEMES:
        raise SecurityError("Base URL 只允许 HTTP 或 HTTPS。")
    if url.host is None:
        raise SecurityError("Base URL 必须包含主机名。")
    if url.user is not None or url.password is not None:
        raise SecurityError("Base URL 不能包含用户名或密码。")
    if url.query_string or url.fragment:
        raise SecurityError("Base URL 不能包含 Query 或 Fragment。")

    hostname = url.host.rstrip(".").lower()
    if hostname in _BLOCKED_HOSTNAMES or hostname.endswith(".localhost"):
        raise SecurityError("Base URL 不能指向本机或元数据服务。")

    normalized_path = url.path.rstrip("/")
    return url.with_path(normalized_path or "")


def build_upstream_url(base_url: str, path: str) -> URL:
    base = validate_base_url(base_url)
    suffix = "/" + path.lstrip("/")
    combined_path = f"{base.path.rstrip('/')}{suffix}"
    return base.with_path(combined_path)


def encode_path_segment(value: str) -> str:
    if any(character in value for character in "/?#\\"):
        raise SecurityError("路径参数包含不允许的字符。", code="unsafePathParameter")
    return quote(value, safe="-._~")
