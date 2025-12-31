$ErrorActionPreference = "Stop"

# Build syncserver in release mode.
# Usage: .\scripts\build-syncserver.ps1

$root = Split-Path $PSScriptRoot -Parent
Push-Location "$root\syncserver"

cargo build --release

Pop-Location
