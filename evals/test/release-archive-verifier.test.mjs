import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeArchiveEntries,
  compareManifestMetadata,
} from "../../scripts/lib/release-archive-verifier.mjs";

test("rejects forbidden archive entries under the packaged root", () => {
  const report = analyzeArchiveEntries([
    "Codex-Sentinel-Ready/",
    "Codex-Sentinel-Ready/README.md",
    "Codex-Sentinel-Ready/dist/old.zip",
    "Codex-Sentinel-Ready/evals/artifacts/summary.json",
    "Codex-Sentinel-Ready/docs/superpowers/plans/internal-plan.md",
    "Codex-Sentinel-Ready/docs/superpowers/specs/internal-spec.md",
    "Codex-Sentinel-Ready/__MACOSX/._README.md",
    "Codex-Sentinel-Ready/._README.md",
  ]);

  assert.equal(report.rootDirName, "Codex-Sentinel-Ready");
  assert.deepEqual(report.forbiddenEntries, [
    "Codex-Sentinel-Ready/._README.md",
    "Codex-Sentinel-Ready/__MACOSX/._README.md",
    "Codex-Sentinel-Ready/dist/old.zip",
    "Codex-Sentinel-Ready/docs/superpowers/plans/internal-plan.md",
    "Codex-Sentinel-Ready/docs/superpowers/specs/internal-spec.md",
    "Codex-Sentinel-Ready/evals/artifacts/summary.json",
  ]);
});

test("requires a single packaged root directory", () => {
  const report = analyzeArchiveEntries([
    "Codex-Sentinel-Ready/README.md",
    "Another-Root/README.md",
  ]);

  assert.deepEqual(report.issues, ["archive must contain exactly one top-level root directory"]);
});

test("rejects manifest metadata drift between source and archive", () => {
  const issues = compareManifestMetadata(
    {
      case_ids: ["case-a", "case-b"],
      total_available_cases: 2,
      case_manifest_fingerprint: "source-manifest",
      runner_source_fingerprint: "source-runner",
    },
    {
      case_ids: ["case-a"],
      total_available_cases: 1,
      case_manifest_fingerprint: "archive-manifest",
      runner_source_fingerprint: "archive-runner",
    }
  );

  assert.deepEqual(issues, [
    "archive total_available_cases does not match source manifest length",
    "archive case_manifest_fingerprint does not match source manifest fingerprint",
    "archive runner_source_fingerprint does not match source runner fingerprint",
    "archive case_ids do not exactly match source manifest order",
  ]);
});
