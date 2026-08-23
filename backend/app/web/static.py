import os
from pathlib import Path

from starlette.exceptions import HTTPException
from starlette.responses import Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

INDEX_CACHE_CONTROL = "no-cache"
HASHED_ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable"
STATIC_FILE_CACHE_CONTROL = "public, max-age=3600"


class SinglePageApplicationFiles(StaticFiles):
    """Serve a Vite build and fall back to index.html for client-side routes."""

    def __init__(self, directory: Path) -> None:
        self.root_directory = directory.resolve()
        super().__init__(directory=self.root_directory, html=True, check_dir=False)

    async def get_response(self, path: str, scope: Scope) -> Response:
        try:
            return await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404 or not self._should_fall_back_to_index(scope):
                raise
            return await super().get_response("index.html", scope)

    def file_response(
        self,
        full_path: str | os.PathLike[str],
        stat_result: os.stat_result,
        scope: Scope,
        status_code: int = 200,
    ) -> Response:
        response = super().file_response(full_path, stat_result, scope, status_code)
        response.headers["Cache-Control"] = self._cache_control_for(Path(full_path))
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    def _should_fall_back_to_index(self, scope: Scope) -> bool:
        if scope["method"] not in {"GET", "HEAD"}:
            return False

        request_path = scope["path"].lstrip("/")
        first_segment = request_path.partition("/")[0]
        if first_segment in {"api", "assets"}:
            return False

        return not Path(request_path.rstrip("/")).suffix

    def _cache_control_for(self, full_path: Path) -> str:
        relative_path = full_path.resolve().relative_to(self.root_directory)
        if relative_path.name == "index.html":
            return INDEX_CACHE_CONTROL
        if relative_path.parts and relative_path.parts[0] == "assets":
            return HASHED_ASSET_CACHE_CONTROL
        return STATIC_FILE_CACHE_CONTROL
