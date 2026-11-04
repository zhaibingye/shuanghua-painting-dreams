import json
from pathlib import Path

from app.domain.capabilities import provider_metadata
from app.domain.image_options import image_option_schemas


def test_generated_catalog_matches_backend_contract() -> None:
    root = Path(__file__).resolve().parents[3]
    catalog = json.loads(
        (root / "frontend/src/api/generated/provider-catalog.json").read_text(encoding="utf-8")
    )
    assert catalog == {
        "providers": provider_metadata().model_dump(by_alias=True)["providers"],
        "imageOptions": image_option_schemas(),
    }
