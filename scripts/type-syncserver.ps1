$ErrorActionPreference = "Stop"

# Type-check syncserver without building binaries.
# Usage: .\scripts\type-syncserver.ps1

$root = Split-Path $PSScriptRoot -Parent
Push-Location "$root\syncserver"

cargo check --all-targets --all-features

Pop-Location
