import { readdirSync } from "node:fs";
import path from "node:path";
import { normalizeReleasePath, shouldIgnorePackageRootPath } from "./release-policy.mjs";

function isRepoShapedTree(entries) {
  return entries.has("README.md")
    && [...entries].some((entry) => entry === "skills" || entry.startsWith("skills/"))
    && [...entries].some((entry) => entry === "scripts" || entry.startsWith("scripts/"));
}

function formatRepoShapeIssue(candidatePath) {
  if (path.posix.basename(candidatePath) === "Ready-to-Push") {
    return `nested source tree detected at ${candidatePath}/`;
  }

  return `duplicate repo-shaped tree detected at ${candidatePath}/`;
}

export function analyzePackageRootEntries(entries) {
  const normalizedEntries = entries.map(normalizeReleasePath).filter(Boolean);
  const issues = new Set();
  const nestedEntriesByCandidate = new Map();

  for (const entry of normalizedEntries) {
    const segments = entry.split("/");
    const gitSegmentIndex = segments.indexOf(".git");

    if (gitSegmentIndex > 0) {
      issues.add(`nested git directory detected at ${segments.slice(0, gitSegmentIndex + 1).join("/")}/`);
    }

    for (let index = 0; index < segments.length - 1; index += 1) {
      const candidatePath = segments.slice(0, index + 1).join("/");
      if (shouldIgnorePackageRootPath(candidatePath)) {
        continue;
      }

      const nestedEntry = segments.slice(index + 1).join("/");
      if (!nestedEntriesByCandidate.has(candidatePath)) {
        nestedEntriesByCandidate.set(candidatePath, new Set());
      }
      nestedEntriesByCandidate.get(candidatePath).add(nestedEntry);
    }
  }

  for (const candidatePath of [...nestedEntriesByCandidate.keys()].sort()) {
    if (isRepoShapedTree(nestedEntriesByCandidate.get(candidatePath))) {
      issues.add(formatRepoShapeIssue(candidatePath));
    }
  }

  return [...issues].sort();
}

export function loadPackageRootEntries(repoRoot) {
  const entries = [];

  function walk(currentPath, relativePath = "") {
    for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
      const nextRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      const normalizedPath = normalizeReleasePath(nextRelativePath);

      if (entry.isDirectory()) {
        if (shouldIgnorePackageRootPath(normalizedPath)) {
          continue;
        }

        walk(path.join(currentPath, entry.name), normalizedPath);
        continue;
      }

      entries.push(normalizedPath);
    }
  }

  walk(repoRoot);
  return entries;
}
