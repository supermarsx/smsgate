$ErrorActionPreference = "Stop"

# Run clippy with warnings as errors for syncserver.
# Usage: .\scripts\lint-syncserver.ps1

$root = Split-Path $PSScriptRoot -Parent
Push-Location "$root\syncserver"

cargo clippy --all-targets --all-features -- -D warnings

Pop-Location
