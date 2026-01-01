#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== smsgate2: install, format, lint, typecheck, test, build ==="
pushd "$ROOT/smsgate2" >/dev/null
bun install --frozen-lockfile
bun run format
bun run lint
bun run typecheck
bun run test
bun run build
popd >/dev/null

echo "=== syncserver: fmt, clippy, test, build ==="
pushd "$ROOT/syncserver" >/dev/null
cargo fmt -- --check
cargo clippy --all-targets -- -D warnings
cargo test --all-targets
cargo build --all-targets
popd >/dev/null

echo "=== smsrelay3 (Android): ktlint, lint, unit tests, assemble ==="
pushd "$ROOT/smsrelay3/android" >/dev/null
./gradlew ktlintCheck
./gradlew lintDebug
./gradlew testDebugUnitTest
./gradlew assembleDebug
popd >/dev/null

echo "All components passed."
