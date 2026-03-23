import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");

test("manifest-json ignores runtime timeout overrides", () => {
  const defaultResult = spawnSync("node", ["evals/run-codex-sentinel.mjs", "--manifest-json"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const overriddenResult = spawnSync("node", ["evals/run-codex-sentinel.mjs", "--manifest-json"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CODEX_SENTINEL_EVAL_TIMEOUT_MS: "12345",
    },
    encoding: "utf8",
  });

  assert.equal(defaultResult.status, 0, defaultResult.stderr || defaultResult.stdout);
  assert.equal(overriddenResult.status, 0, overriddenResult.stderr || overriddenResult.stdout);
  assert.deepEqual(JSON.parse(overriddenResult.stdout), JSON.parse(defaultResult.stdout));
});
