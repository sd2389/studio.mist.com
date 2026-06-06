#!/usr/bin/env bash
# Smoke test: backend accepts GLB multipart upload and returns .glb model_key
set -euo pipefail

API="${API_URL:-http://localhost:8765}"
FIXTURE="${1:-public/models/clearcoat/ClearcoatRing.gltf}"

if [[ ! -f "$FIXTURE" ]]; then
  echo "Fixture not found: $FIXTURE" >&2
  exit 1
fi

echo "Uploading fixture to $API …"
RESP=$(curl -sf -X POST "$API/upload" \
  -F "file=@${FIXTURE};filename=smoke-test.glb;type=model/gltf-binary" \
  -F 'model_config={"source":"upload-ingest","slots":[],"defaultMaterials":{},"materialOptionsBySlot":{},"sceneSettings":{}}' \
  -F "slot_selections={}" \
  -F "scene_settings={}")

KEY=$(node -e "const j=JSON.parse(process.argv[1]); if(!String(j.model_key||'').endsWith('.glb')) process.exit(2); console.log(j.model_key)" "$RESP")
echo "OK model_key=$KEY"

SCENE_ID=$(node -e "const j=JSON.parse(process.argv[1]); console.log(j.scene_id||'')" "$RESP")
if [[ -n "$SCENE_ID" ]]; then
  curl -sf "$API/scenes/$SCENE_ID" >/dev/null
  echo "OK scene $SCENE_ID registered"
fi

echo "Phase 2 upload smoke test passed."
