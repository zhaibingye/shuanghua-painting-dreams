from typing import Any

from pydantic import Field

from app.domain.enums import ApiFormat, MediaKind
from app.schemas.common import ApiModel


class ProviderMetadata(ApiModel):
    api_format: ApiFormat
    media_kind: MediaKind
    display_name: str
    default_base_url: str
    default_model_id: str
    generic_capabilities: dict[str, Any]
    known_models: dict[str, dict[str, Any]] = Field(default_factory=dict)
    default_options: dict[str, Any]


class ProviderMetadataResponse(ApiModel):
    schema_version: int
    providers: list[ProviderMetadata]
