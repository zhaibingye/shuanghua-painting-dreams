import sys
from pathlib import Path

import orjson

project_root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(project_root))

from app.main import app  # noqa: E402

output = project_root / "openapi.json"
output.write_bytes(orjson.dumps(app.openapi(), option=orjson.OPT_INDENT_2))
print(output)
