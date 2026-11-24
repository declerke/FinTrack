import json
import sys
from pathlib import Path

from app.main import app

repository_root = Path(__file__).resolve().parents[1]
openapi_path = repository_root / "docs" / "openapi.json"
current_schema = app.openapi()

if "--check" in sys.argv:
    saved_schema = json.loads(openapi_path.read_text(encoding="utf-8"))
    if saved_schema != current_schema:
        raise SystemExit("docs/openapi.json does not match the current FastAPI schema")
    print("docs/openapi.json matches the current FastAPI schema.")
else:
    openapi_path.parent.mkdir(parents=True, exist_ok=True)
    openapi_path.write_text(
        json.dumps(current_schema, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Exported {len(current_schema.get('paths', {}))} API paths to docs/openapi.json.")
