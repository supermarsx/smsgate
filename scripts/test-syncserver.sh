#!/usr/bin/env bash
set -euo pipefail

# Run the syncserver test suite.
# Usage: ./scripts/test-syncserver.sh

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
pushd "${ROOT}/syncserver" >/dev/null

cargo test --all

popd >/dev/null
