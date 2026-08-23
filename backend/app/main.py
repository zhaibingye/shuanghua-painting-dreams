from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from app.api.error_handlers import (
    application_error_handler,
    unexpected_error_handler,
    validation_error_handler,
)
from app.api.routes import health, images, metadata, videos
from app.application.image_service import ImageService
from app.application.video_service import VideoService
from app.domain.errors import ApplicationError
from app.infrastructure.config import get_settings
from app.infrastructure.logging import configure_logging
from app.infrastructure.request_id import RequestIdMiddleware
from app.infrastructure.safe_http import SafeHttpTransport
from app.providers.registry import ProviderRegistry
from app.web.static import SinglePageApplicationFiles

settings = get_settings()
configure_logging(settings.log_level)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    transport = SafeHttpTransport(settings)
    await transport.start()
    providers = ProviderRegistry.create(transport, settings)
    app.state.transport = transport
    app.state.image_service = ImageService(providers)
    app.state.video_service = VideoService(providers)
    try:
        yield
    finally:
        await transport.close()


def create_app(*, frontend_dist: Path | None = None) -> FastAPI:
    app = FastAPI(
        title="霜华绘梦 API",
        version="0.1.0",
        description="无状态的多供应商图片与视频生成 API 适配层。",
        lifespan=lifespan,
    )
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "X-Upstream-API-Key", "X-Request-ID"],
        expose_headers=["X-Request-ID", "Server-Timing"],
    )
    app.add_exception_handler(ApplicationError, application_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(Exception, unexpected_error_handler)

    api_prefix = "/api/v1"
    app.include_router(health.router, prefix=api_prefix)
    app.include_router(metadata.router, prefix=api_prefix)
    app.include_router(images.router, prefix=api_prefix)
    app.include_router(videos.router, prefix=api_prefix)

    default_frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    resolved_frontend_dist = frontend_dist or default_frontend_dist
    app.mount(
        "/",
        SinglePageApplicationFiles(resolved_frontend_dist),
        name="frontend",
    )
    return app


app = create_app()
