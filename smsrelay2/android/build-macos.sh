#!/usr/bin/env bash
# Builds the Android app (macOS).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
chmod +x gradlew
./gradlew clean assembleRelease
