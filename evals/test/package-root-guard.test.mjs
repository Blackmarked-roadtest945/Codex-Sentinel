import test from "node:test";
import assert from "node:assert/strict";

import { analyzePackageRootEntries } from "../../scripts/lib/package-root-guard.mjs";

test("allows a canonical package root", () => {
  const issues = analyzePackageRootEntries([
    "README.md",
    "LICENSE",
    "skills/codex-sentinel/SKILL.md",
    "scripts/package-release.sh",
    "evals/run-codex-sentinel.mjs",
  ]);

  assert.deepEqual(issues, []);
});

test("rejects a nested Ready-to-Push source tree", () => {
  const issues = analyzePackageRootEntries([
    "README.md",
    "skills/codex-sentinel/SKILL.md",
    "scripts/package-release.sh",
    "Ready-to-Push/README.md",
    "Ready-to-Push/skills/codex-sentinel/SKILL.md",
    "Ready-to-Push/scripts/package-release.sh",
  ]);

  assert.deepEqual(issues, [
    "nested source tree detected at Ready-to-Push/",
  ]);
});

test("rejects a nested git directory", () => {
  const issues = analyzePackageRootEntries([
    "README.md",
    "skills/codex-sentinel/SKILL.md",
    "scripts/package-release.sh",
    "scratch/.git/HEAD",
  ]);

  assert.deepEqual(issues, [
    "nested git directory detected at scratch/.git/",
  ]);
});

test("rejects a second repo-shaped root", () => {
  const issues = analyzePackageRootEntries([
    "README.md",
    "skills/codex-sentinel/SKILL.md",
    "scripts/package-release.sh",
    "workspace-copy/README.md",
    "workspace-copy/skills/extra/SKILL.md",
    "workspace-copy/scripts/package-release.sh",
  ]);

  assert.deepEqual(issues, [
    "duplicate repo-shaped tree detected at workspace-copy/",
  ]);
});

test("rejects a recursively nested Ready-to-Push source tree", () => {
  const issues = analyzePackageRootEntries([
    "README.md",
    "skills/codex-sentinel/SKILL.md",
    "scripts/package-release.sh",
    "wrapper/Ready-to-Push/README.md",
    "wrapper/Ready-to-Push/skills/codex-sentinel/SKILL.md",
    "wrapper/Ready-to-Push/scripts/package-release.sh",
  ]);

  assert.deepEqual(issues, [
    "nested source tree detected at wrapper/Ready-to-Push/",
  ]);
});

test("rejects a deeply nested duplicate repo-shaped tree", () => {
  const issues = analyzePackageRootEntries([
    "README.md",
    "skills/codex-sentinel/SKILL.md",
    "scripts/package-release.sh",
    "foo/bar/workspace-copy/README.md",
    "foo/bar/workspace-copy/skills/extra/SKILL.md",
    "foo/bar/workspace-copy/scripts/package-release.sh",
  ]);

  assert.deepEqual(issues, [
    "duplicate repo-shaped tree detected at foo/bar/workspace-copy/",
  ]);
});
