#!/usr/bin/env bash
set -euo pipefail

# Type-check syncserver without building binaries.
# Usage: ./scripts/type-syncserver.sh

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
pushd "${ROOT}/syncserver" >/dev/null

cargo check --all-targets --all-features

popd >/dev/null
