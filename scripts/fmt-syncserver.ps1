$ErrorActionPreference = "Stop"

# Format syncserver codebase.
# Usage: .\scripts\fmt-syncserver.ps1

$root = Split-Path $PSScriptRoot -Parent
Push-Location "$root\syncserver"

cargo fmt --all

Pop-Location
