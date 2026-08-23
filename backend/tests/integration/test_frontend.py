from collections.abc import Iterator
from pathlib import Path
from tempfile import TemporaryDirectory

import httpx
import pytest
from app.main import create_app


@pytest.fixture
def frontend_dist() -> Iterator[Path]:
    backend_directory = Path(__file__).resolve().parents[2]
    with TemporaryDirectory(prefix=".frontend-dist-", dir=backend_directory) as temporary_directory:
        dist = Path(temporary_directory) / "dist"
        assets = dist / "assets"
        assets.mkdir(parents=True)
        (dist / "index.html").write_text(
            "<html><body>霜华绘梦</body></html>",
            encoding="utf-8",
        )
        (dist / "favicon.svg").write_text("<svg></svg>", encoding="utf-8")
        (assets / "app-a1b2c3.js").write_text("console.log('ready')", encoding="utf-8")
        yield dist


@pytest.mark.asyncio
async def test_frontend_files_and_spa_routes_are_served(frontend_dist: Path) -> None:
    app = create_app(frontend_dist=frontend_dist)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        index = await client.get("/")
        route = await client.get("/create/image")
        favicon = await client.get("/favicon.svg")
        asset = await client.get("/assets/app-a1b2c3.js")

    assert index.status_code == 200
    assert route.status_code == 200
    assert index.text == route.text
    assert index.headers["cache-control"] == "no-cache"
    assert route.headers["cache-control"] == "no-cache"
    assert favicon.headers["cache-control"] == "public, max-age=3600"
    assert asset.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert asset.headers["x-content-type-options"] == "nosniff"


@pytest.mark.asyncio
async def test_missing_api_and_assets_do_not_fall_back_to_index(frontend_dist: Path) -> None:
    app = create_app(frontend_dist=frontend_dist)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        api_response = await client.get("/api/v1/not-found")
        asset_response = await client.get("/assets/not-found.js")

    assert api_response.status_code == 404
    assert asset_response.status_code == 404
    assert "霜华绘梦" not in api_response.text
    assert "霜华绘梦" not in asset_response.text
