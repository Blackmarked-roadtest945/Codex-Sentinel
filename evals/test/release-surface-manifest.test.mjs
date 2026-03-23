import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { buildReleaseSurfaceManifest } from "../../scripts/lib/release-surface-manifest.mjs";

test("ignores local worktree directories when building the release surface manifest", () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "codex-sentinel-surface-manifest-"));

  mkdirSync(path.join(repoRoot, ".worktrees", "feature"), { recursive: true });
  mkdirSync(path.join(repoRoot, "skills", "codex-sentinel"), { recursive: true });

  writeFileSync(path.join(repoRoot, "README.md"), "# Codex-Sentinel\n", "utf8");
  writeFileSync(path.join(repoRoot, "skills", "codex-sentinel", "SKILL.md"), "skill\n", "utf8");
  writeFileSync(path.join(repoRoot, ".worktrees", "feature", "README.md"), "# Shadow copy\n", "utf8");

  const manifest = buildReleaseSurfaceManifest(repoRoot);
  const relativePaths = manifest.map((entry) => entry.relativePath);

  assert.deepEqual(relativePaths, [
    "README.md",
    "skills",
    "skills/codex-sentinel",
    "skills/codex-sentinel/SKILL.md",
  ]);
});
