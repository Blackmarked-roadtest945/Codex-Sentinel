import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");

test("package-release defaults to the public Codex-Sentinel archive name", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "codex-sentinel-package-default-"));
  const tempRepo = path.join(tempRoot, "repo");

  try {
    mkdirSync(path.join(tempRepo, "scripts"), { recursive: true });
    cpSync(path.join(repoRoot, "scripts", "package-release.sh"), path.join(tempRepo, "scripts", "package-release.sh"));
    writeFileSync(path.join(tempRepo, "README.md"), "# Temp repo\n", "utf8");
    writeFileSync(path.join(tempRepo, ".gitignore"), "dist/\n", "utf8");

    const result = spawnSync("bash", ["scripts/package-release.sh"], {
      cwd: tempRepo,
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);

    const archivePath = result.stdout.trim();
    assert.equal(path.basename(archivePath), "Codex-Sentinel.zip");
    assert.equal(existsSync(path.join(tempRepo, "dist", "Codex-Sentinel.zip")), true);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
