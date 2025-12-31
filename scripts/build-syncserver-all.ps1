$ErrorActionPreference = "Stop"

param(
    [string]$Targets = "x86_64-pc-windows-msvc,x86_64-unknown-linux-gnu,aarch64-apple-darwin",
    [switch]$SkipFmt
)

$root = Split-Path $PSScriptRoot -Parent
Push-Location "$root/syncserver"

if (-not $SkipFmt) {
    cargo fmt
}

$dist = Join-Path $root "dist"
New-Item -ItemType Directory -Force -Path $dist | Out-Null

$targetList = $Targets.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
foreach ($target in $targetList) {
    Write-Host "==> Building syncserver, syncctl, migrate for $target"
    cargo build --release --target $target --bin syncserver --bin syncctl --bin migrate
    $outDir = Join-Path $dist $target
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
    Get-ChildItem "target/$target/release/" -Include syncserver*,syncctl*,migrate* | Copy-Item -Destination $outDir -Force
}

Pop-Location
Write-Host "Artifacts copied to dist/<target>/"
