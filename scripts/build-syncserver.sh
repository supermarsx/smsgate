#!/usr/bin/env bash
set -euo pipefail

# Build syncserver in release mode.
# Usage: ./scripts/build-syncserver.sh

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
pushd "${ROOT}/syncserver" >/dev/null

cargo build --release

popd >/dev/null
