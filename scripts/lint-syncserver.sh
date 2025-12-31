#!/usr/bin/env bash
set -euo pipefail

# Run clippy with warnings as errors for syncserver.
# Usage: ./scripts/lint-syncserver.sh

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
pushd "${ROOT}/syncserver" >/dev/null

cargo clippy --all-targets --all-features -- -D warnings

popd >/dev/null
