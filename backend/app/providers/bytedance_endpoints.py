from dataclasses import dataclass

from yarl import URL

from app.infrastructure.url_builder import encode_path_segment, validate_base_url

# Match the full official hostname, never a hostname substring or a URL path.
_OFFICIAL_ARK_HOSTS = frozenset(
    {
        "ark.cn-beijing.volces.com",
        "ark.ap-southeast.bytepluses.com",
    }
)


@dataclass(frozen=True, slots=True)
class ByteDanceEndpoints:
    root: URL
    official: bool

    def image(self, *, editing: bool = False) -> URL:
        path = (
            "/api/v3/images/generations"
            if self.official
            else ("/v1/images/edits" if editing else "/v1/images/generations")
        )
        return self._url(path)

    def video(self, task_id: str | None = None) -> URL:
        path = "/api/v3/contents/generations/tasks" if self.official else "/v1/videos"
        if task_id is not None:
            return URL(f"{self._url(path)}/{encode_path_segment(task_id)}", encoded=True)
        return self._url(path)

    def _url(self, path: str) -> URL:
        return self.root.with_path(f"{self.root.path.rstrip('/')}{path}")


def byte_dance_endpoints(base_url: str) -> ByteDanceEndpoints:
    base = validate_base_url(base_url)
    assert base.host is not None  # Guaranteed by validate_base_url.
    host = base.host.rstrip(".").lower()
    root_path = base.path.rstrip("/")
    for version in ("/api/v3", "/v1"):
        if root_path.endswith(version):
            root_path = root_path.removesuffix(version)
            break
    return ByteDanceEndpoints(
        root=base.with_path(root_path),
        official=host in _OFFICIAL_ARK_HOSTS,
    )
