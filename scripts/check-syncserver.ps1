$ErrorActionPreference = "Stop"

# Run syncserver quality gates: fmt, clippy, check, test, build.
# Usage: .\scripts\check-syncserver.ps1 [fmt|lint|type|test|build|all]

param(
    [ValidateSet("fmt", "lint", "type", "test", "build", "all")]
    [string]$Stage = "all"
)

$root = Split-Path $PSScriptRoot -Parent
Push-Location "$root\syncserver"

function Run-Fmt { cargo fmt --all -- --check }
function Run-Lint { cargo clippy --all-targets --all-features -- -D warnings }
function Run-Type { cargo check --all-targets --all-features }
function Run-Test { cargo test --all }
function Run-Build { cargo build --release }

switch ($Stage) {
    "fmt" { Run-Fmt }
    "lint" { Run-Lint }
    "type" { Run-Type }
    "test" { Run-Test }
    "build" { Run-Build }
    "all" {
        Run-Fmt
        Run-Lint
        Run-Type
        Run-Test
        Run-Build
    }
}

Pop-Location
