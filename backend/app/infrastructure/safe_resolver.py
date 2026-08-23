import asyncio
import ipaddress
import socket
from typing import Final

from aiohttp.abc import AbstractResolver, ResolveResult

from app.domain.errors import SecurityError

_BLOCKED_HOSTS: Final = {"localhost", "localhost.localdomain", "metadata.google.internal"}


def ensure_public_ip(address: str) -> None:
    normalized = address.split("%", maxsplit=1)[0]
    try:
        ip = ipaddress.ip_address(normalized)
    except ValueError as exc:
        raise SecurityError("DNS 返回了无效 IP 地址。", code="invalidResolvedAddress") from exc
    if not ip.is_global:
        raise SecurityError("Base URL 解析到了非公网地址。", code="privateAddressBlocked")


def validate_literal_host(host: str) -> None:
    try:
        ipaddress.ip_address(host.split("%", maxsplit=1)[0])
    except ValueError:
        return
    ensure_public_ip(host)


class PublicNetworkResolver(AbstractResolver):
    async def resolve(
        self,
        host: str,
        port: int = 0,
        family: socket.AddressFamily = socket.AF_INET,
    ) -> list[ResolveResult]:
        normalized_host = host.rstrip(".").lower()
        if normalized_host in _BLOCKED_HOSTS or normalized_host.endswith(".localhost"):
            raise SecurityError("Base URL 不能解析到本机。", code="localHostBlocked")

        validate_literal_host(normalized_host)
        loop = asyncio.get_running_loop()
        requested_family = socket.AF_UNSPEC if family == socket.AF_UNSPEC else family
        try:
            infos = await loop.getaddrinfo(
                normalized_host,
                port,
                family=requested_family,
                type=socket.SOCK_STREAM,
            )
        except socket.gaierror as exc:
            raise SecurityError("Base URL 域名解析失败。", code="dnsResolutionFailed") from exc

        results: list[ResolveResult] = []
        seen: set[tuple[str, int]] = set()
        for resolved_family, _socktype, proto, _canonname, sockaddr in infos:
            address = str(sockaddr[0])
            resolved_port = int(sockaddr[1])
            ensure_public_ip(address)
            key = (address, resolved_port)
            if key in seen:
                continue
            seen.add(key)
            results.append(
                ResolveResult(
                    hostname=normalized_host,
                    host=address,
                    port=resolved_port,
                    family=resolved_family,
                    proto=proto,
                    flags=socket.AI_NUMERICHOST,
                )
            )

        if not results:
            raise SecurityError("Base URL 域名没有可用的公网地址。", code="noPublicAddress")
        return results

    async def close(self) -> None:
        return None
