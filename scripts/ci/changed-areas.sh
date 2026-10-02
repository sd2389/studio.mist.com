#!/usr/bin/env bash
# Reads changed file paths (one per line) on stdin and prints which parts of CI they need, as
# GitHub step outputs:
#   web=true      lint, type check and frontend unit tests
#   backend=true  backend unit tests
#   render=true   render goldens (the studio pipeline the harness draws)
# Changes to CI itself or to dependencies run everything; docs alone run nothing.
set -euo pipefail

web=false
backend=false
render=false

while IFS= read -r path; do
  [ -z "$path" ] && continue
  case "$path" in
    .github/* | scripts/ci/* | package.json | package-lock.json)
      web=true backend=true render=true ;;
    backend/*)
      backend=true ;;
    *.md | docs/* | LICENSE* | .gitignore | .env.example)
      ;;
    src/lib/* | src/features/viewer/* | src/features/render/* | src/stores/* | src/app/render-harness/* | \
      public/* | scripts/golden/* | tests/goldens/* | next.config.* | postcss.config.* | tsconfig.json)
      web=true render=true ;;
    *)
      web=true ;;
  esac
done

echo "web=$web"
echo "backend=$backend"
echo "render=$render"
