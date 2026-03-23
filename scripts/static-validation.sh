#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

node --check evals/run-codex-sentinel.mjs
node --check evals/lib/case-catalog.mjs
node --check evals/lib/check-oracles.mjs
node --check evals/lib/release-contract.mjs
node --check evals/lib/release-manifest.mjs
node --check scripts/check-release-surface.mjs
node --check scripts/lib/package-root-guard.mjs
node --check scripts/lib/release-policy.mjs
node --check scripts/lib/release-archive-verifier.mjs
node --check scripts/lib/release-surface-manifest.mjs
node --check scripts/lib/release-surface-validator.mjs
node --check scripts/print-release-exclude-patterns.mjs
node --check scripts/validate-release-surface.mjs
node --check scripts/verify-release-archive.mjs
node --check scripts/write-release-manifest.mjs
node --test evals/test/*.test.mjs

ruby <<'RUBY'
require "yaml"

Dir.glob("skills/**/agents/openai.yaml").sort.each do |file|
  YAML.load_file(file)
end
RUBY

node scripts/validate-release-surface.mjs
