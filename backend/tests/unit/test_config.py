import pytest
from app.infrastructure.config import Settings


def test_settings_reads_prefixed_environment_variable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SHUANGHUA_ENV", "production")
    assert Settings().environment == "production"


def test_runtime_defaults_match_unified_server() -> None:
    settings = Settings(_env_file=None)
    assert settings.port == 3002
    assert settings.workers == 2


def test_port_and_workers_support_standard_environment_variables(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SHUANGHUA_PORT", "4000")
    monkeypatch.setenv("PORT", "4001")
    monkeypatch.setenv("SHUANGHUA_WORKERS", "3")
    monkeypatch.setenv("WEB_CONCURRENCY", "4")

    settings = Settings(_env_file=None)

    assert settings.port == 4001
    assert settings.workers == 4


def test_cors_origins_are_trimmed_and_empty_values_removed() -> None:
    settings = Settings(cors_origins="https://one.example, , https://two.example")
    assert settings.cors_origin_list == ["https://one.example", "https://two.example"]
