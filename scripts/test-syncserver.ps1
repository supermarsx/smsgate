$ErrorActionPreference = "Stop"

# Run the syncserver test suite.
# Usage: .\scripts\test-syncserver.ps1

$root = Split-Path $PSScriptRoot -Parent
Push-Location "$root\syncserver"

cargo test --all

Pop-Location
