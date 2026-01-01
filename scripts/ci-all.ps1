$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$root = Resolve-Path (Join-Path $PSScriptRoot "..")

Write-Host "=== smsgate2: install, format, lint, typecheck, test, build ==="
Push-Location (Join-Path $root "smsgate2")
bun install --frozen-lockfile
bun run format
bun run lint
bun run typecheck
bun run test
bun run build
Pop-Location

Write-Host "=== syncserver: fmt, clippy, test, build ==="
Push-Location (Join-Path $root "syncserver")
cargo fmt -- --check
cargo clippy --all-targets -- -D warnings
cargo test --all-targets
cargo build --all-targets
Pop-Location

Write-Host "=== smsrelay3 (Android): ktlint, lint, unit tests, assemble ==="
Push-Location (Join-Path $root "smsrelay3/android")
& .\gradlew.bat ktlintCheck
& .\gradlew.bat lintDebug
& .\gradlew.bat testDebugUnitTest
& .\gradlew.bat assembleDebug
Pop-Location

Write-Host "All components passed."
