#!/usr/bin/env bash
set -euo pipefail

TARGETS=${TARGETS:-"x86_64-unknown-linux-gnu,aarch64-unknown-linux-gnu,x86_64-apple-darwin"}
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
DIST="${ROOT}/dist"

pushd "${ROOT}/syncserver" >/dev/null

if [[ -z "${SKIP_FMT:-}" ]]; then
  cargo fmt
fi

mkdir -p "${DIST}"
IFS=',' read -ra target_list <<<"${TARGETS}"
for target in "${target_list[@]}"; do
  target_trimmed="$(echo "${target}" | xargs)"
  [[ -z "${target_trimmed}" ]] && continue
  echo "==> Building syncserver, syncctl, migrate for ${target_trimmed}"
  cargo build --release --target "${target_trimmed}" --bin syncserver --bin syncctl --bin migrate
  out_dir="${DIST}/${target_trimmed}"
  mkdir -p "${out_dir}"
  cp "target/${target_trimmed}/release/"{syncserver*,syncctl*,migrate*} "${out_dir}" || true
done

popd >/dev/null
echo "Artifacts copied to dist/<target>/"
