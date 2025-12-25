param(
    [string]$JdkUrl = "https://download.java.net/java/early_access/jdk27/3/GPL/openjdk-27-ea+3_windows-x64_bin.zip",
    [string]$InstallRoot = "C:\\Bin",
    [string]$JdkFolderName = "jdk-27",
    [string]$ProjectRoot = (Get-Location).Path
)

$ErrorActionPreference = "Stop"

function Ensure-Directory([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

function Download-File([string]$Url, [string]$Destination) {
    Write-Host "Downloading $Url"
    Invoke-WebRequest -Uri $Url -OutFile $Destination
}

function Extract-Zip([string]$ZipPath, [string]$Destination) {
    Write-Host "Extracting $ZipPath to $Destination"
    Expand-Archive -Path $ZipPath -DestinationPath $Destination -Force
}

function Set-GradleJavaHome([string]$GradlePropsPath, [string]$JdkPath) {
    $line = "org.gradle.java.home=$JdkPath"
    if (-not (Test-Path -LiteralPath $GradlePropsPath)) {
        Set-Content -Path $GradlePropsPath -Value $line
        return
    }
    $content = Get-Content -Path $GradlePropsPath
    $filtered = $content | Where-Object { $_ -notmatch '^org\.gradle\.java\.home=' }
    $filtered + $line | Set-Content -Path $GradlePropsPath
}

$zipName = Split-Path -Path $JdkUrl -Leaf
$tempZip = Join-Path -Path $env:TEMP -ChildPath $zipName
$installPath = Join-Path -Path $InstallRoot -ChildPath $JdkFolderName
$extractRoot = Join-Path -Path $env:TEMP -ChildPath "jdk-27-extract"

Ensure-Directory $InstallRoot
Ensure-Directory $extractRoot

if (-not (Test-Path -LiteralPath $tempZip)) {
    Download-File $JdkUrl $tempZip
}

Extract-Zip $tempZip $extractRoot

$extractedDir = Get-ChildItem -Path $extractRoot -Directory | Select-Object -First 1
if (-not $extractedDir) {
    throw "JDK extraction failed: no directory found in $extractRoot"
}

if (Test-Path -LiteralPath $installPath) {
    Remove-Item -LiteralPath $installPath -Recurse -Force
}

Move-Item -Path $extractedDir.FullName -Destination $installPath

$gradleProps = Join-Path -Path $ProjectRoot -ChildPath "smsrelay3\\android\\gradle.properties"
Set-GradleJavaHome $gradleProps $installPath

[Environment]::SetEnvironmentVariable("JAVA_HOME", $installPath, "User")

$pathValue = [Environment]::GetEnvironmentVariable("Path", "User")
if ($pathValue -notmatch [regex]::Escape("$installPath\\bin")) {
    [Environment]::SetEnvironmentVariable("Path", "$pathValue;$installPath\\bin", "User")
}

Write-Host "JDK installed at $installPath"
Write-Host "Updated $gradleProps with org.gradle.java.home"
Write-Host "Set JAVA_HOME and updated PATH for the current user"
