import { readdirSync } from "node:fs";
import path from "node:path";

const ignoredRootDirectories = new Set([
  ".git",
  ".superpowers",
  ".worktrees",
  "worktrees",
  "dist",
  "node_modules",
  "__MACOSX",
]);

const ignoredNestedDirectories = new Set([
  "evals/artifacts",
]);

function normalizeEntry(entry) {
  return entry
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/$/, "");
}

function isRepoShapedTree(entries) {
  return entries.has("README.md")
    && [...entries].some((entry) => entry === "skills" || entry.startsWith("skills/"))
    && [...entries].some((entry) => entry === "scripts" || entry.startsWith("scripts/"));
}

export function analyzePackageRootEntries(entries) {
  const normalizedEntries = entries.map(normalizeEntry).filter(Boolean);
  const issues = new Set();
  const topLevelEntries = new Map();

  for (const entry of normalizedEntries) {
    const segments = entry.split("/");
    const gitSegmentIndex = segments.indexOf(".git");

    if (gitSegmentIndex > 0) {
      issues.add(`nested git directory detected at ${segments.slice(0, gitSegmentIndex + 1).join("/")}/`);
    }

    if (segments.length > 1) {
      const [topLevel, ...rest] = segments;
      if (!topLevelEntries.has(topLevel)) {
        topLevelEntries.set(topLevel, new Set());
      }
      topLevelEntries.get(topLevel).add(rest.join("/"));
    }
  }

  for (const [topLevel, nestedEntries] of topLevelEntries) {
    if (ignoredRootDirectories.has(topLevel)) {
      continue;
    }

    if (!isRepoShapedTree(nestedEntries)) {
      continue;
    }

    if (topLevel === "Ready-to-Push") {
      issues.add("nested source tree detected at Ready-to-Push/");
      continue;
    }

    issues.add(`duplicate repo-shaped tree detected at ${topLevel}/`);
  }

  return [...issues].sort();
}

export function loadPackageRootEntries(repoRoot) {
  const entries = [];

  function walk(currentPath, relativePath = "") {
    for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
      const nextRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      const normalizedPath = normalizeEntry(nextRelativePath);

      if (entry.isDirectory()) {
        if (!relativePath && ignoredRootDirectories.has(entry.name)) {
          continue;
        }

        if (ignoredNestedDirectories.has(normalizedPath)) {
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
