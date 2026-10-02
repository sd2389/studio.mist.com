#!/usr/bin/env bash
# Re-pins requirements.lock and requirements-dev.lock from the ranges in the .txt files, with
# hashes, for the Python and platform the backend runs on (backend/Dockerfile and CI). Run it
# after changing a requirements .txt file. Needs uv (https://docs.astral.sh/uv/).
set -euo pipefail
cd "$(dirname "$0")/.."
for name in requirements requirements-dev; do
  uv pip compile "$name.txt" --python-version 3.12 --python-platform x86_64-unknown-linux-gnu \
    --generate-hashes --custom-compile-command "backend/scripts/lock-requirements.sh" -o "$name.lock" -q
done
