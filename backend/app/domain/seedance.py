"""Seedance model limits and defaults from the official video generation API.

https://console.volcengine.com/ark/region:cn-beijing/docs/create-video-generation-task-api
Verified 2026-10-21. Custom suffixes do not imply additional resolutions.
"""

from copy import deepcopy
from typing import Any

DEFAULT_BYTE_DANCE_MODEL_ID = "doubao-seedance-2-5-260628"

_SEEDANCE_2_CAPABILITIES: dict[str, Any] = {
    "durationMin": 4,
    "durationMax": 15,
    "automaticDuration": True,
    "resolutions": ["480p", "720p", "1080p", "4k"],
    "aspectRatios": ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"],
    "generateAudio": True,
    "cameraFixed": False,
    "serviceTiers": ["default"],
    "serviceTierParameter": False,
    "webSearch": True,
    "returnLastFrame": True,
    "seed": False,
    "defaultDuration": 5,
    "defaultResolution": "720p",
    "defaultGenerateAudio": True,
}


_MODEL_FAMILIES: tuple[tuple[tuple[str, ...], dict[str, Any]], ...] = (
    (
        ("doubao-seedance-2-5-",),
        {
            **_SEEDANCE_2_CAPABILITIES,
            "durationMax": 30,
            "resolutions": ["480p", "720p", "1080p"],
            "defaultDuration": -1,
            "frameAspectRatios": ["adaptive"],
        },
    ),
    (
        ("doubao-seedance-2-0-fast-", "doubao-seedance-2-0-mini-"),
        {
            **_SEEDANCE_2_CAPABILITIES,
            "resolutions": ["480p", "720p"],
        },
    ),
    (("doubao-seedance-2-0-",), _SEEDANCE_2_CAPABILITIES),
    (
        ("doubao-seedance-1-5-pro-",),
        {
            "durationMin": 4,
            "durationMax": 12,
            "automaticDuration": True,
            "resolutions": ["480p", "720p", "1080p"],
            "generateAudio": True,
            "cameraFixed": True,
            "serviceTiers": ["default", "flex"],
            "serviceTierParameter": True,
            "webSearch": False,
        },
    ),
    (
        ("doubao-seedance-1-0-lite-",),
        {
            "durationMin": 2,
            "durationMax": 12,
            "automaticDuration": False,
            "resolutions": ["480p", "720p"],
            "generateAudio": False,
            "cameraFixed": True,
            "serviceTiers": ["default", "flex"],
            "serviceTierParameter": True,
            "webSearch": False,
        },
    ),
    (
        ("doubao-seedance-1-0-",),
        {
            "defaultResolution": "1080p",
            "durationMin": 2,
            "durationMax": 12,
            "automaticDuration": False,
            "resolutions": ["480p", "720p", "1080p"],
            "generateAudio": False,
            "cameraFixed": True,
            "serviceTiers": ["default", "flex"],
            "serviceTierParameter": True,
            "webSearch": False,
        },
    ),
)

_GENERIC_CAPABILITIES: dict[str, Any] = {
    "durationMin": 2,
    "durationMax": 15,
    "automaticDuration": False,
    "resolutions": ["480p", "720p"],
    "generateAudio": False,
    "cameraFixed": False,
    "serviceTiers": ["default"],
    "serviceTierParameter": False,
    "webSearch": False,
}


def _with_defaults(capabilities: dict[str, Any]) -> dict[str, Any]:
    return {
        "defaultDuration": 5,
        "defaultResolution": "720p",
        "defaultGenerateAudio": capabilities["generateAudio"],
        "seed": capabilities["cameraFixed"],
        **deepcopy(capabilities),
    }


def byte_dance_model_capabilities(model_id: str) -> dict[str, Any]:
    capabilities = next(
        (
            capabilities
            for prefixes, capabilities in _MODEL_FAMILIES
            if model_id.startswith(prefixes)
        ),
        _GENERIC_CAPABILITIES,
    )
    return _with_defaults(capabilities)


def byte_dance_model_families() -> dict[str, Any]:
    return {
        "families": [
            {"prefixes": list(prefixes), "capabilities": _with_defaults(capabilities)}
            for prefixes, capabilities in _MODEL_FAMILIES
        ],
        "defaultCapabilities": _with_defaults(_GENERIC_CAPABILITIES),
    }
