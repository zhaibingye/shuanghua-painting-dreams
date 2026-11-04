import sys
from pathlib import Path

import orjson

project_root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(project_root))

from app.domain.capabilities import provider_metadata  # noqa: E402
from app.domain.image_options import image_option_schemas  # noqa: E402
from app.main import app  # noqa: E402

output = project_root / "openapi.json"
output.write_bytes(orjson.dumps(app.openapi(), option=orjson.OPT_INDENT_2))
print(output)
catalog = project_root.parent / "frontend/src/api/generated/provider-catalog.json"
catalog.write_bytes(
    orjson.dumps(
        {
            "providers": provider_metadata().model_dump(by_alias=True)["providers"],
            "imageOptions": image_option_schemas(),
        },
        option=orjson.OPT_INDENT_2,
    )
)
print(catalog)
