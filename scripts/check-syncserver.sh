#!/usr/bin/env bash
set -euo pipefail

# Run syncserver quality gates: fmt, clippy, check, test, build.
# Usage: ./scripts/check-syncserver.sh [fmt|lint|type|test|build|all]

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
pushd "${ROOT}/syncserver" >/dev/null

stage="${1:-all}"

run_fmt() { cargo fmt --all -- --check; }
run_lint() { cargo clippy --all-targets --all-features -- -D warnings; }
run_type() { cargo check --all-targets --all-features; }
run_test() { cargo test --all; }
run_build() { cargo build --release; }

case "${stage}" in
  fmt) run_fmt ;;
  lint) run_lint ;;
  type) run_type ;;
  test) run_test ;;
  build) run_build ;;
  all)
    run_fmt
    run_lint
    run_type
    run_test
    run_build
    ;;
  *)
    echo "Unknown stage: ${stage}"
    echo "Usage: $0 [fmt|lint|type|test|build|all]"
    exit 1
    ;;
esac

popd >/dev/null
