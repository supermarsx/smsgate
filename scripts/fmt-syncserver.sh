#!/usr/bin/env bash
set -euo pipefail

# Format syncserver codebase.
# Usage: ./scripts/fmt-syncserver.sh

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
pushd "${ROOT}/syncserver" >/dev/null

cargo fmt --all

popd >/dev/null
