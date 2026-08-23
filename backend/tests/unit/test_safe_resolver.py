import asyncio
import socket
from collections.abc import Sequence

import pytest
from app.domain.errors import SecurityError
from app.infrastructure.safe_resolver import PublicNetworkResolver


class FakeLoop:
    def __init__(
        self,
        addresses: Sequence[tuple[socket.AddressFamily, int, int, str, tuple[str, int]]]
        | None = None,
        error: OSError | None = None,
    ) -> None:
        self.addresses = list(addresses or [])
        self.error = error
        self.calls: list[tuple[str, int]] = []

    async def getaddrinfo(
        self,
        host: str,
        port: int,
        **_kwargs: object,
    ) -> list[tuple[socket.AddressFamily, int, int, str, tuple[str, int]]]:
        self.calls.append((host, port))
        if self.error is not None:
            raise self.error
        return self.addresses


def ipv4_result(
    address: str, port: int = 443
) -> tuple[socket.AddressFamily, int, int, str, tuple[str, int]]:
    return (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (address, port))


@pytest.mark.asyncio
async def test_resolver_returns_only_deduplicated_public_addresses(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    loop = FakeLoop([ipv4_result("8.8.8.8"), ipv4_result("8.8.8.8"), ipv4_result("1.1.1.1")])
    monkeypatch.setattr(asyncio, "get_running_loop", lambda: loop)

    results = await PublicNetworkResolver().resolve("Example.COM.", 443)

    assert [result["host"] for result in results] == ["8.8.8.8", "1.1.1.1"]
    assert all(result["hostname"] == "example.com" for result in results)
    assert loop.calls == [("example.com", 443)]


@pytest.mark.asyncio
async def test_resolver_rejects_response_containing_private_address(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    loop = FakeLoop([ipv4_result("8.8.8.8"), ipv4_result("169.254.169.254")])
    monkeypatch.setattr(asyncio, "get_running_loop", lambda: loop)

    with pytest.raises(SecurityError, match="非公网地址"):
        await PublicNetworkResolver().resolve("example.com", 443)


@pytest.mark.asyncio
@pytest.mark.parametrize("host", ["localhost", "service.localhost", "metadata.google.internal"])
async def test_resolver_blocks_local_and_metadata_hosts_without_dns(
    monkeypatch: pytest.MonkeyPatch,
    host: str,
) -> None:
    loop = FakeLoop([ipv4_result("8.8.8.8")])
    monkeypatch.setattr(asyncio, "get_running_loop", lambda: loop)

    with pytest.raises(SecurityError, match="不能解析到本机"):
        await PublicNetworkResolver().resolve(host, 443)
    assert loop.calls == []


@pytest.mark.asyncio
async def test_resolver_normalizes_dns_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    loop = FakeLoop(error=socket.gaierror(socket.EAI_NONAME, "not found"))
    monkeypatch.setattr(asyncio, "get_running_loop", lambda: loop)

    with pytest.raises(SecurityError, match="域名解析失败"):
        await PublicNetworkResolver().resolve("missing.example", 443)
