# Builds the Android app (Windows PowerShell).
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir
& .\gradlew.bat clean assembleRelease
