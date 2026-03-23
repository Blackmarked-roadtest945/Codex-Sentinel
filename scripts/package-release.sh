#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
archive_name="${1:-Codex-Sentinel}"
node "$repo_root/scripts/check-package-root.mjs" "$repo_root"
dist_dir="$repo_root/dist"
staging_root="$(mktemp -d "${TMPDIR:-/tmp}/codex-sentinel-release.XXXXXX")"
staging_dir="$staging_root/$archive_name"
archive_path="$dist_dir/$archive_name.zip"
force_no_rsync="${CODEX_SENTINEL_FORCE_NO_RSYNC:-0}"

exclude_patterns=(
  ".git"
  ".superpowers"
  "dist"
  "evals/artifacts"
  "docs/superpowers/plans"
  "docs/superpowers/specs"
  "__MACOSX"
  "._*"
  ".DS_Store"
)

cleanup() {
  rm -rf "$staging_root"
}

copy_with_rsync() {
  local rsync_args=()
  local pattern

  for pattern in "${exclude_patterns[@]}"; do
    rsync_args+=(--exclude "$pattern")
  done

  rsync -a "${rsync_args[@]}" "$repo_root/" "$staging_dir/"
}

copy_with_tar() {
  local tar_args=()
  local pattern

  for pattern in "${exclude_patterns[@]}"; do
    tar_args+=(--exclude "$pattern")
  done

  (
    cd "$repo_root"
    tar -cf - "${tar_args[@]}" .
  ) | (
    cd "$staging_dir"
    tar -xf -
  )
}

trap cleanup EXIT

mkdir -p "$dist_dir" "$staging_dir"
rm -f "$archive_path"

export COPYFILE_DISABLE=1

if [[ "$force_no_rsync" != "1" ]] && command -v rsync >/dev/null 2>&1; then
  copy_with_rsync
else
  copy_with_tar
fi

find "$staging_root" \( -name '.DS_Store' -o -name '._*' \) -delete

if command -v ditto >/dev/null 2>&1; then
  ditto -c -k --norsrc --keepParent "$staging_dir" "$archive_path"
else
  (
    cd "$staging_root"
    zip -qr "$archive_path" "$archive_name" -x '*/__MACOSX/*' '*/._*' '*/.DS_Store'
  )
fi

printf '%s\n' "$archive_path"
