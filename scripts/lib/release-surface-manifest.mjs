import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ignoredPathPrefixes = [
  ".git",
  ".superpowers",
  "dist",
  "evals/artifacts",
  "docs/superpowers/plans",
  "docs/superpowers/specs",
  "__MACOSX",
];

function normalizeRelativePath(relativePath) {
  return relativePath
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/$/, "");
}

function shouldIgnoreReleaseSurfacePath(relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);
  const segments = normalizedPath.split("/").filter(Boolean);
  const basename = segments[segments.length - 1] ?? "";

  if (basename === ".DS_Store" || basename.startsWith("._") || segments.includes("__MACOSX")) {
    return true;
  }

  return ignoredPathPrefixes.some((prefix) => (
    normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)
  ));
}

function createFileHash(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function buildReleaseSurfaceManifest(rootPath) {
  const manifest = [];

  function walk(currentPath, relativePath = "") {
    const entries = readdirSync(currentPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const nextRelativePath = normalizeRelativePath(
        relativePath ? `${relativePath}/${entry.name}` : entry.name
      );

      if (shouldIgnoreReleaseSurfacePath(nextRelativePath)) {
        continue;
      }

      const absolutePath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        manifest.push({
          entryType: "directory",
          relativePath: nextRelativePath,
        });
        walk(absolutePath, nextRelativePath);
        continue;
      }

      manifest.push({
        entryType: "file",
        relativePath: nextRelativePath,
        contentHash: createFileHash(absolutePath),
      });
    }
  }

  walk(rootPath);
  return manifest;
}

export function compareReleaseSurfaceManifests(sourceManifest, archiveManifest) {
  const issues = [];
  const sourceByPath = new Map(sourceManifest.map((entry) => [entry.relativePath, entry]));
  const archiveByPath = new Map(archiveManifest.map((entry) => [entry.relativePath, entry]));
  const missingPaths = [];
  const unexpectedPaths = [];

  for (const [relativePath, sourceEntry] of sourceByPath) {
    const archiveEntry = archiveByPath.get(relativePath);

    if (!archiveEntry) {
      missingPaths.push(relativePath);
      continue;
    }

    if (archiveEntry.entryType !== sourceEntry.entryType) {
      issues.push(`archive entry type does not match source for ${relativePath}`);
      continue;
    }

    if (sourceEntry.entryType === "file" && archiveEntry.contentHash !== sourceEntry.contentHash) {
      issues.push(`archive content hash does not match source for ${relativePath}`);
    }
  }

  for (const relativePath of archiveByPath.keys()) {
    if (!sourceByPath.has(relativePath)) {
      unexpectedPaths.push(relativePath);
    }
  }

  for (const relativePath of missingPaths.sort()) {
    issues.push(`archive is missing path ${relativePath}`);
  }

  for (const relativePath of unexpectedPaths.sort()) {
    issues.push(`archive contains unexpected path ${relativePath}`);
  }

  return issues;
}
