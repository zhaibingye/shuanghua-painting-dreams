import ipaddress
import re
from typing import Annotated, Literal

from pydantic import AfterValidator, AnyHttpUrl, BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

from app.domain.enums import ApiFormat

_MODEL_ID_PATTERN = re.compile(r"^[^/?#\\\s]+$")
_DATA_URL_PATTERN = re.compile(
    r"^data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$",
    re.IGNORECASE,
)
_BLOCKED_MEDIA_HOSTS = {"localhost", "localhost.localdomain", "metadata.google.internal"}


def _validate_public_http_url(value: AnyHttpUrl) -> AnyHttpUrl:
    if value.username is not None or value.password is not None:
        raise ValueError("公网素材 URL 不能包含用户名或密码")
    if value.host is None:
        raise ValueError("公网素材 URL 必须包含主机名")
    host = value.host.rstrip(".").lower().removeprefix("[").removesuffix("]")
    if host in _BLOCKED_MEDIA_HOSTS or host.endswith(".localhost"):
        raise ValueError("素材 URL 不能指向本机或云元数据服务")
    try:
        address = ipaddress.ip_address(host.split("%", maxsplit=1)[0])
    except ValueError:
        return value
    if not address.is_global:
        raise ValueError("素材 URL 必须使用公网地址")
    return value


PublicHttpUrl = Annotated[AnyHttpUrl, AfterValidator(_validate_public_http_url)]


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
        extra="forbid",
        str_strip_whitespace=True,
    )


class UpstreamRequest(ApiModel):
    api_format: ApiFormat
    base_url: str = Field(min_length=8, max_length=2048)
    model_id: str = Field(min_length=1, max_length=256)

    @field_validator("model_id")
    @classmethod
    def validate_model_id(cls, value: str) -> str:
        if not _MODEL_ID_PATTERN.fullmatch(value):
            raise ValueError("模型 ID 不能包含空白、斜杠、反斜杠、Query 或 Fragment")
        return value


class DataUrlImageAsset(ApiModel):
    kind: Literal["dataUrl"] = "dataUrl"
    data_url: str = Field(min_length=32)
    filename: str | None = Field(default=None, max_length=255)

    @field_validator("data_url")
    @classmethod
    def validate_data_url(cls, value: str) -> str:
        if not _DATA_URL_PATTERN.fullmatch(value):
            raise ValueError("只支持 PNG、JPEG 或 WebP Base64 Data URL")
        return value


class UrlImageAsset(ApiModel):
    kind: Literal["url"] = "url"
    url: PublicHttpUrl


ImageAsset = Annotated[DataUrlImageAsset | UrlImageAsset, Field(discriminator="kind")]


class UsageResponse(ApiModel):
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None
    cost_in_usd_ticks: int | None = None


class HealthResponse(ApiModel):
    status: str


class ReadyResponse(ApiModel):
    status: str
    version: str
