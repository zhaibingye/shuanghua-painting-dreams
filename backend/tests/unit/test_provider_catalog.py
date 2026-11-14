import json
from pathlib import Path

from app.domain.capabilities import provider_metadata
from app.domain.image_options import seedream_model_families
from app.domain.openai_images import openai_image_capabilities
from app.domain.options import option_schemas
from app.domain.seedance import byte_dance_model_families


def test_generated_catalog_matches_backend_contract() -> None:
    root = Path(__file__).resolve().parents[3]
    catalog = json.loads(
        (root / "frontend/src/api/generated/provider-catalog.json").read_text(encoding="utf-8")
    )
    assert catalog == {
        "providers": provider_metadata().model_dump(by_alias=True)["providers"],
        "options": option_schemas(),
        "openAIImageDefaultCapabilities": openai_image_capabilities(),
        "seedreamImageFamilies": seedream_model_families(),
        "byteDanceVideoFamilies": byte_dance_model_families(),
    }
