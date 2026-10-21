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


def byte_dance_model_capabilities(model_id: str) -> dict[str, Any]:
    capabilities = _family_capabilities(model_id)
    capabilities.setdefault("defaultDuration", 5)
    capabilities.setdefault("defaultResolution", "720p")
    capabilities.setdefault("defaultGenerateAudio", capabilities["generateAudio"])
    capabilities.setdefault("seed", capabilities["cameraFixed"])
    return capabilities


def _family_capabilities(model_id: str) -> dict[str, Any]:
    if model_id.startswith("doubao-seedance-2-5-"):
        return {
            **deepcopy(_SEEDANCE_2_CAPABILITIES),
            "durationMax": 30,
            "resolutions": ["480p", "720p", "1080p"],
            "defaultDuration": -1,
            "frameAspectRatios": ["adaptive"],
        }
    if model_id.startswith(("doubao-seedance-2-0-fast-", "doubao-seedance-2-0-mini-")):
        return {**deepcopy(_SEEDANCE_2_CAPABILITIES), "resolutions": ["480p", "720p"]}
    if model_id.startswith("doubao-seedance-2-0-"):
        return deepcopy(_SEEDANCE_2_CAPABILITIES)
    if model_id.startswith("doubao-seedance-1-5-pro-"):
        return {
            "durationMin": 4,
            "durationMax": 12,
            "automaticDuration": True,
            "resolutions": ["480p", "720p", "1080p"],
            "generateAudio": True,
            "cameraFixed": True,
            "serviceTiers": ["default", "flex"],
            "serviceTierParameter": True,
            "webSearch": False,
        }
    if model_id.startswith("doubao-seedance-1-0-lite-"):
        return {
            "durationMin": 2,
            "durationMax": 12,
            "automaticDuration": False,
            "resolutions": ["480p", "720p"],
            "generateAudio": False,
            "cameraFixed": True,
            "serviceTiers": ["default", "flex"],
            "serviceTierParameter": True,
            "webSearch": False,
        }
    if model_id.startswith("doubao-seedance-1-0-"):
        return {
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
        }
    return {
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
