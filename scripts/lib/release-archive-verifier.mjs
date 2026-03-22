import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const forbiddenRelativePrefixes = [
  "dist/",
  "evals/artifacts/",
  "docs/superpowers/plans/",
  "docs/superpowers/specs/",
  "__MACOSX/",
];

function normalizeArchiveEntry(entry) {
  return entry
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\.\/+/, "");
}

export function analyzeArchiveEntries(entries) {
  const normalizedEntries = entries.map(normalizeArchiveEntry).filter(Boolean);
  const rootDirNames = [...new Set(normalizedEntries.map((entry) => entry.split("/")[0]).filter(Boolean))];

  if (rootDirNames.length !== 1) {
    return {
      rootDirName: null,
      forbiddenEntries: [],
      issues: ["archive must contain exactly one top-level root directory"],
    };
  }

  const rootDirName = rootDirNames[0];
  const forbiddenEntries = [];

  for (const entry of normalizedEntries) {
    if (entry === rootDirName || entry === `${rootDirName}/`) {
      continue;
    }

    const relativePath = entry.startsWith(`${rootDirName}/`) ? entry.slice(rootDirName.length + 1) : entry;
    if (!relativePath) {
      continue;
    }

    const segments = relativePath.split("/");
    const basename = segments[segments.length - 1];
    const matchesForbiddenPrefix = forbiddenRelativePrefixes.some((prefix) => relativePath.startsWith(prefix));
    const matchesMacMetadata = segments.includes("__MACOSX") || basename.startsWith("._");

    if (matchesForbiddenPrefix || matchesMacMetadata) {
      forbiddenEntries.push(entry);
    }
  }

  return {
    rootDirName,
    forbiddenEntries: [...new Set(forbiddenEntries)].sort(),
    issues: [],
  };
}

export function compareManifestMetadata(sourceManifest, archiveManifest) {
  const issues = [];

  if (archiveManifest.total_available_cases !== sourceManifest.total_available_cases) {
    issues.push("archive total_available_cases does not match source manifest length");
  }

  if (archiveManifest.case_manifest_fingerprint !== sourceManifest.case_manifest_fingerprint) {
    issues.push("archive case_manifest_fingerprint does not match source manifest fingerprint");
  }

  if (archiveManifest.runner_source_fingerprint !== sourceManifest.runner_source_fingerprint) {
    issues.push("archive runner_source_fingerprint does not match source runner fingerprint");
  }

  const sameCaseOrder =
    Array.isArray(sourceManifest.case_ids)
    && Array.isArray(archiveManifest.case_ids)
    && sourceManifest.case_ids.length === archiveManifest.case_ids.length
    && sourceManifest.case_ids.every((caseId, index) => archiveManifest.case_ids[index] === caseId);

  if (!sameCaseOrder) {
    issues.push("archive case_ids do not exactly match source manifest order");
  }

  return issues;
}

function runCommand(command, args, cwd = undefined) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} failed`);
  }

  return result.stdout;
}

export function listArchiveEntries(archivePath) {
  return runCommand("unzip", ["-Z1", archivePath])
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function loadManifestMetadata(repoRoot) {
  return JSON.parse(runCommand("node", ["evals/run-codex-sentinel.mjs", "--manifest-json"], repoRoot));
}

export function verifyReleaseArchive({ archivePath, sourceRoot }) {
  const entries = listArchiveEntries(archivePath);
  const entryReport = analyzeArchiveEntries(entries);
  const issues = [...entryReport.issues];
  let sourceManifest = null;
  let archiveManifest = null;

  if (entryReport.forbiddenEntries.length > 0) {
    issues.push("archive contains forbidden entries");
  }

  if (!entryReport.rootDirName) {
    return {
      pass: false,
      rootDirName: null,
      forbiddenEntries: entryReport.forbiddenEntries,
      issues,
      sourceManifest,
      archiveManifest,
    };
  }

  const extractRoot = mkdtempSync(path.join(tmpdir(), "codex-sentinel-archive-"));

  try {
    runCommand("unzip", ["-q", archivePath, "-d", extractRoot]);
    const extractedRoot = path.join(extractRoot, entryReport.rootDirName);

    if (!existsSync(extractedRoot)) {
      issues.push(`archive root ${entryReport.rootDirName} was not extracted`);
    } else {
      sourceManifest = loadManifestMetadata(sourceRoot);
      archiveManifest = loadManifestMetadata(extractedRoot);
      issues.push(...compareManifestMetadata(sourceManifest, archiveManifest));
    }
  } finally {
    rmSync(extractRoot, { recursive: true, force: true });
  }

  return {
    pass: issues.length === 0,
    rootDirName: entryReport.rootDirName,
    forbiddenEntries: entryReport.forbiddenEntries,
    issues,
    sourceManifest,
    archiveManifest,
  };
}
