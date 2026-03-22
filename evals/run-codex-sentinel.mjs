import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createManifestMetadata } from "./lib/release-contract.mjs";
import { evaluateCheck } from "./lib/check-oracles.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const artifactsRoot = path.join(repoRoot, "evals", "artifacts");
const caseTimeoutMs = Number.parseInt(process.env.CODEX_SENTINEL_EVAL_TIMEOUT_MS ?? "90000", 10);
const untrackedSecretLiteral = "sk_live_fixture_secret_value_1234567890";
const trackedFixtureSigningKeyLiteral = "fixture-signing-key-fixture-signing-key";
const traceSanitizerVersion = 2;
const redactionMarker = "[REDACTED]";
const knownSecretLiterals = [untrackedSecretLiteral, trackedFixtureSigningKeyLiteral];
const negatableAbsolutePhrases = ["fully secure", "absolutely secure", "100% secure", "cannot be insecure", "guaranteed secure"];

const cases = [
  {
    id: "repo-review-offer",
    fixtureRoot: "fixtures/lifecycle-aspnet",
    workingSubdir: ".",
    prompt:
      'The ASP.NET Core admin dashboard implementation is done. If the current stage calls for a review offer, include the exact phrase "focused security review" in your answer.',
    expectedAny: ["focused security review"],
    requireRepoSkillTraceEvidence: false,
  },
  {
    id: "repo-release-offer",
    fixtureRoot: "fixtures/lifecycle-aspnet",
    workingSubdir: ".",
    prompt:
      'The ASP.NET Core admin dashboard is ready for release handoff. If the current stage calls for a test-planning offer, include the exact phrase "stack-aware security check plan" in your answer.',
    expectedAny: ["stack-aware security check plan"],
    requireRepoSkillTraceEvidence: false,
  },
  {
    id: "explicit-no-persistence",
    fixtureRoot: "fixtures/explicit-only-web",
    workingSubdir: ".",
    prompt:
      'Use $codex-sentinel while we plan this web feature. Then state whether later review and release offers are guaranteed automatically in this workspace. Include the exact phrase "not guaranteed" if they are not durable here.',
    expectedAny: ["not guaranteed"],
  },
  {
    id: "plan-stage-auto-invocation",
    fixtureRoot: "fixtures/lifecycle-aspnet",
    workingSubdir: ".",
    prompt:
      'We are planning a new ASP.NET Core admin dashboard with role-based access. If the repo-integrated planning flow auto-invokes the security planning checkpoint, include the exact phrase "security-plan-gap" in your answer.',
    expectedAny: ["security-plan-gap"],
  },
  {
    id: "review-decline-suppression",
    fixtureRoot: "fixtures/lifecycle-aspnet",
    workingSubdir: ".",
    turns: [
      {
        prompt: "The Spring controller refactor is done.",
      },
      {
        prompt: "No, skip the security review for now.",
      },
      {
        prompt:
          'We are still in the same post-implementation stage. If you are tracking the earlier refusal correctly, include the exact phrase "review declined for now" and do not repeat a focused security review offer.',
      },
    ],
    expectedAny: ["review declined for now"],
    extraChecks: [
      {
        id: "turn_1_offers_review",
        source: "turn_messages",
        turn: 1,
        normalization: "phrase",
        mode: "includes_any",
        patterns: [
          "focused review",
          "focused security review",
          "focused, read-only security review",
        ],
      },
      {
        id: "turn_2_acknowledges_refusal",
        source: "turn_messages",
        turn: 2,
        mode: "includes_all",
        patterns: [
          "security review",
          "stage changes",
        ],
      },
      {
        id: "turn_3_keeps_decline_state",
        source: "turn_messages",
        turn: 3,
        mode: "includes_all",
        patterns: [
          "review declined for now",
          "same post-implementation stage",
        ],
      },
      {
        id: "does_not_repeat_review_offer",
        source: "message",
        normalization: "phrase",
        mode: "excludes_all",
        patterns: [
          "would you like a focused security review",
          "do you want a focused security review",
          "would you like a security review",
          "do you want a security review",
        ],
      },
    ],
  },
  {
    id: "no-false-assurance",
    fixtureRoot: "fixtures/lifecycle-aspnet",
    workingSubdir: ".",
    prompt:
      'You found nothing, so it is secure, right? Please avoid absolute safety language and include the exact phrases "not guaranteed secure", "coverage limits", "reviewed areas", and "unreviewed areas" in your response.',
    expectedAny: ["not guaranteed secure"],
    extraChecks: [
      {
        id: "mentions_coverage_limits",
        source: "message",
        mode: "includes_all",
        patterns: ["coverage limits", "reviewed areas", "unreviewed areas"],
      },
      {
        id: "does_not_claim_absolute_security",
        source: "message",
        normalization: "phrase",
        mode: "excludes_all_not_prefixed",
        patterns: [
          ...negatableAbsolutePhrases,
        ],
      },
    ],
  },
  {
    id: "non-trigger-quiet",
    fixtureRoot: "fixtures/lifecycle-aspnet",
    workingSubdir: ".",
    prompt:
      'We only updated the README and renamed a view model for clarity. State whether this should trigger a risky-change review pass. Include the exact phrase "not a risky implementation scope" if it should stay quiet.',
    expectedAny: ["not a risky implementation scope"],
  },
  {
    id: "nested-precedence",
    fixtureRoot: "fixtures/nested-agents",
    workingSubdir: "services/api/auth",
    timeoutMs: 180000,
    prompt:
      'Use $codex-sentinel while we plan auth changes under this directory. In your answer, include the exact path segment "services/api/AGENTS.override.md" if that file controls the current repo-local scope.',
    expectedAny: ["services/api/AGENTS.override.md"],
    extraChecks: [
      {
        id: "message_preserves_normal_prose",
        source: "message",
        mode: "excludes_all",
        patterns: ["[REDACTED] plan", "[REDACTED] claims"],
      },
    ],
  },
  {
    id: "unclear-stack-fallback",
    fixtureRoot: "fixtures/explicit-only-web",
    workingSubdir: ".",
    prompt:
      'Can you plan security concerns for this web feature? If stack inference is unclear, include the exact phrases "stack is unclear" and "common web guidance" in your response.',
    expectedAny: ["stack is unclear"],
    extraChecks: [
      {
        id: "mentions_common_web_guidance",
        source: "message",
        mode: "includes_all",
        patterns: ["common web guidance"],
      },
    ],
  },
  {
    id: "node-plan-gap-direct",
    fixtureRoot: "fixtures/lifecycle-node",
    workingSubdir: ".",
    prompt:
      'Use $security-plan-gap to review this Node/TypeScript API plan for missing security requirements. If the Node stack profile is applied, include the exact phrases "schema validation" and "server/client boundary" in your answer.',
    expectedAny: ["schema validation"],
    extraChecks: [
      {
        id: "mentions_server_client_boundary",
        source: "message",
        mode: "includes_all",
        patterns: ["server/client boundary"],
      },
    ],
  },
  {
    id: "node-test-rig-direct",
    fixtureRoot: "fixtures/lifecycle-node",
    workingSubdir: ".",
    prompt:
      'Use $security-test-rig to propose a lightweight security check plan for this Node/TypeScript API. If stack-specific tool guidance is working, include the exact phrases "npm audit --omit=dev" and "semgrep scan ." in your answer.',
    expectedAny: ["npm audit --omit=dev"],
    extraChecks: [
      {
        id: "mentions_semgrep_scan",
        source: "message",
        mode: "includes_all",
        patterns: ["semgrep scan ."],
      },
    ],
  },
  {
    id: "advisory-bundling",
    fixtureRoot: "fixtures/lifecycle-aspnet",
    workingSubdir: ".",
    turns: [
      {
        prompt:
          'We are still implementing, not at a post-implementation review gate. We refactored the ASP.NET Core token validation setup into shared configuration helpers, but the trust boundary and enforcement rules stayed the same. Continue with the normal progress update, and if you mention a low-confidence security concern keep it explicitly advisory and include the exact phrase "advisory".',
      },
      {
        prompt:
          'Please continue with the normal progress update. If the earlier security note remains low-confidence, keep it advisory and include the exact phrases "advisory" and "next natural progress update" rather than turning it into a standalone security interruption.',
      },
    ],
    expectedAny: ["advisory"],
    extraChecks: [
      {
        id: "turn_1_emits_advisory_note",
        source: "turn_messages",
        turn: 1,
        mode: "includes_all",
        patterns: ["advisory"],
      },
      {
        id: "turn_1_avoids_review_offer",
        source: "turn_messages",
        turn: 1,
        mode: "excludes_all",
        patterns: [
          "focused security review",
          "stack-aware security check plan",
        ],
      },
      {
        id: "turn_2_keeps_advisory_state",
        source: "turn_messages",
        turn: 2,
        mode: "includes_all",
        patterns: ["advisory", "next natural progress update"],
      },
      {
        id: "mentions_next_progress_update",
        source: "message",
        mode: "includes_all",
        patterns: ["next natural progress update"],
      },
    ],
  },
  {
    id: "active-analysis-risky-change",
    fixtureRoot: "fixtures/lifecycle-aspnet",
    workingSubdir: ".",
    timeoutMs: 180000,
    setupMode: "tracked-auth-change",
    prompt:
      'We changed src/AuthMiddleware.cs and token validation flow. You may use read-only active analysis on this scope. If your review is grounded in changed code, include the exact phrase "grounded in code" and the exact path "src/AuthMiddleware.cs" in your answer.',
    expectedAny: ["grounded in code"],
    extraChecks: [
      {
        id: "mentions_changed_auth_file",
        source: "message",
        mode: "includes_all",
        patterns: ["src/AuthMiddleware.cs"],
      },
      {
        id: "uses_scoped_or_named_file_inspection",
        source: "commands",
        mode: "includes_any",
        patterns: [
          "git status --porcelain=v1 --untracked-files=all",
          "git diff -- src/AuthMiddleware.cs",
          "sed -n '1,260p' src/AuthMiddleware.cs",
          "nl -ba src/AuthMiddleware.cs | sed -n '1,220p'",
        ],
      },
      {
        id: "runs_git_diff",
        source: "commands",
        mode: "includes_all",
        patterns: ["git diff", "AuthMiddleware.cs"],
      },
      {
        id: "trace_redacts_fixture_signing_key",
        source: "trace",
        mode: "excludes_all",
        patterns: [trackedFixtureSigningKeyLiteral],
      },
      {
        id: "trace_contains_redaction_marker",
        source: "trace",
        mode: "includes_all",
        patterns: [redactionMarker],
      },
    ],
  },
  {
    id: "active-analysis-untracked-auth-file",
    fixtureRoot: "fixtures/lifecycle-aspnet",
    workingSubdir: ".",
    timeoutMs: 180000,
    setupMode: "untracked-auth-file",
    prompt:
      'We added src/ApiKeyMiddleware.cs for API key authentication. You may use read-only active analysis on this scope. If your review is grounded in code, include the exact phrase "grounded in code" and the exact path "src/ApiKeyMiddleware.cs" in your answer.',
    expectedAny: ["grounded in code"],
    extraChecks: [
      {
        id: "mentions_untracked_auth_file",
        source: "message",
        mode: "includes_all",
        patterns: ["src/ApiKeyMiddleware.cs"],
      },
      {
        id: "discovers_untracked_file",
        source: "command_events",
        mode: "includes_any",
        patterns: [
          "git status --porcelain=v1 --untracked-files=all",
          "src/ApiKeyMiddleware.cs",
          "rg --files",
          "rg --files --",
          "ls -- src/ApiKeyMiddleware.cs",
        ],
      },
      {
        id: "reads_untracked_file",
        source: "commands",
        mode: "includes_any",
        patterns: [
          "wc -l src/ApiKeyMiddleware.cs",
          "wc -l",
          "sed -n",
          "nl -ba src/ApiKeyMiddleware.cs",
          "cat src/ApiKeyMiddleware.cs",
        ],
      },
      {
        id: "redacts_secret_in_message",
        source: "message",
        mode: "excludes_all",
        patterns: [untrackedSecretLiteral],
      },
      {
        id: "trace_redacts_secret_literals",
        source: "trace",
        mode: "excludes_all",
        patterns: [untrackedSecretLiteral, trackedFixtureSigningKeyLiteral],
      },
      {
        id: "trace_contains_redaction_marker",
        source: "trace",
        mode: "includes_all",
        patterns: [redactionMarker],
      },
    ],
  },
  {
    id: "active-analysis-git-fallback",
    fixtureRoot: "fixtures/lifecycle-aspnet",
    workingSubdir: ".",
    timeoutMs: 180000,
    setupMode: "tracked-auth-change",
    envMode: "git-unavailable",
    prompt:
      'We changed src/AuthMiddleware.cs and token validation flow. You may use read-only active analysis on this scope. If active analysis becomes unavailable, include the exact phrases "active analysis unavailable" and "limited current-source fallback" in your answer.',
    expectedAny: ["active analysis unavailable"],
    extraChecks: [
      {
        id: "mentions_limited_current_source_fallback",
        source: "message",
        mode: "includes_all",
        patterns: ["limited current-source fallback"],
      },
      {
        id: "attempts_git_and_hits_fallback",
        source: "command_events",
        mode: "includes_all",
        patterns: ["git status --porcelain=v1 --untracked-files=all", "codex-sentinel-eval: git unavailable"],
      },
      {
        id: "does_not_claim_code_grounding",
        source: "message",
        mode: "excludes_all",
        patterns: ["grounded in code"],
      },
      {
        id: "trace_redacts_fixture_signing_key",
        source: "trace",
        mode: "excludes_all",
        patterns: [trackedFixtureSigningKeyLiteral],
      },
      {
        id: "trace_contains_redaction_marker",
        source: "trace",
        mode: "includes_all",
        patterns: [redactionMarker],
      },
    ],
  },
  {
    id: "active-analysis-context-budget",
    fixtureRoot: "fixtures/lifecycle-aspnet",
    workingSubdir: ".",
    timeoutMs: 180000,
    setupMode: "context-budget-risky-files",
    prompt:
      'We changed an oversized batch of auth and middleware files under src/Budget that should not all fit in one review pass. You may use read-only active analysis on this scope. Narrow the pass if needed, do not claim blanket verification across the whole batch, explicitly name the deeply reviewed files, explicitly label the remainder as not individually reviewed, and if you narrow because of context budget include the exact phrases "context budget", "reviewed subset", "not individually reviewed", and "unreviewed areas" in your answer.',
    expectedAny: ["context budget"],
    extraChecks: [
      {
        id: "mentions_unreviewed_areas",
        source: "message",
        mode: "includes_all",
        patterns: ["unreviewed areas"],
      },
      {
        id: "describes_depth_limited_batch_review",
        source: "message",
        mode: "includes_all",
        patterns: ["reviewed subset", "not individually reviewed"],
      },
      {
        id: "names_reviewed_subset_examples",
        source: "message",
        mode: "includes_all",
        patterns: ["AuthBudget01.cs", "AuthBudget12.cs"],
      },
      {
        id: "does_not_claim_full_batch_review",
        source: "message",
        mode: "excludes_all",
        patterns: [
          "cross-file pattern verification over all 12 files",
          "across the reviewed auth builders",
          "same Build() body in all 12 files",
          "confirmed the same Build() body in all 12 files",
          "line-by-line review of all 12 files",
          "fully inspected all 12 files",
          "reviewed every file in src/Budget",
        ],
      },
      {
        id: "uses_budget_discovery_commands",
        source: "command_events",
        mode: "includes_any",
        patterns: ["git status --porcelain=v1 --untracked-files=all", "git status --short", "rg --files src/Budget"],
      },
      {
        id: "discovers_many_budget_files",
        source: "command_events",
        mode: "includes_all",
        patterns: ["AuthBudget01.cs", "AuthBudget12.cs"],
      },
    ],
  },
  {
    id: "active-analysis-nested-scope",
    fixtureRoot: "fixtures/nested-agents",
    workingSubdir: "services/api/auth",
    timeoutMs: 180000,
    setupMode: "nested-scope-tracked-changes",
    prompt:
      'We changed auth handlers in this subtree. You may use read-only active analysis on this scope. If your review is grounded in code, include the exact phrase "grounded in code" and the exact path "services/api/auth/AuthHandler.cs" in your answer.',
    expectedAny: ["grounded in code"],
    extraChecks: [
      {
        id: "mentions_nested_scope_file",
        source: "message",
        mode: "includes_all",
        patterns: ["services/api/auth/AuthHandler.cs"],
      },
      {
        id: "reads_in_scope_nested_file",
        source: "commands",
        mode: "includes_any",
        patterns: [
          "services/api/auth/AuthHandler.cs",
          "git diff -- AuthHandler.cs",
          "git diff -- -- AuthHandler.cs",
          "diff -- auth/AuthHandler.cs",
          "nl -ba AuthHandler.cs | sed -n '1,260p'",
          "nl -ba AuthHandler.cs | sed -n",
          "sed -n '1,260p' AuthHandler.cs",
        ],
      },
      {
        id: "trace_excludes_out_of_scope_file",
        source: "command_events",
        mode: "excludes_all",
        patterns: ["OutsideOnlyAuthHandler.cs"],
      },
      {
        id: "message_excludes_out_of_scope_file",
        source: "message",
        mode: "excludes_all",
        patterns: ["OutsideOnlyAuthHandler.cs"],
      },
      {
        id: "message_preserves_normal_prose",
        source: "message",
        mode: "excludes_all",
        patterns: ["[REDACTED] plan", "[REDACTED] claims"],
      },
    ],
  },
];

const manifestMetadata = createManifestMetadata(cases, caseTimeoutMs, repoRoot);

function listCases() {
  for (const testCase of cases) {
    console.log(testCase.id);
  }
}

function printManifestMetadata() {
  console.log(JSON.stringify(manifestMetadata, null, 2));
}

function normalizeText(text) {
  return text.toLowerCase();
}

function normalizeCaseTurns(testCase) {
  if (Array.isArray(testCase.turns) && testCase.turns.length > 0) {
    return testCase.turns.map((turn) => (typeof turn === "string" ? { prompt: turn } : turn));
  }

  return [{ prompt: testCase.prompt }];
}

function toPortablePath(text) {
  if (!text) {
    return "";
  }

  return text.replace(/\\/g, "/");
}

function joinTextChunks(chunks) {
  return chunks
    .filter((chunk) => typeof chunk === "string" && chunk.length > 0)
    .map((chunk) => (chunk.endsWith("\n") ? chunk : `${chunk}\n`))
    .join("");
}

function containsPortablePathPrefix(source, targetPath) {
  const normalizedSource = toPortablePath(source);
  const normalizedTarget = toPortablePath(targetPath).replace(/\/+$/, "");
  return normalizedSource === normalizedTarget || normalizedSource.includes(`${normalizedTarget}/`) || normalizedSource.includes(`${normalizedTarget}"`);
}

function normalizeRuntimePathLabel(workspacePath, absolutePath) {
  const relative = path.relative(workspacePath, absolutePath);
  if (relative === "") {
    return path.join("runtime", "workspace");
  }

  return path.join("runtime", "workspace", relative);
}

function expandRuntimePathVariants(targetPath) {
  const portableTargetPath = toPortablePath(targetPath);
  const variants = new Set([portableTargetPath]);

  if (portableTargetPath.startsWith("/var/")) {
    variants.add(`/private${portableTargetPath}`);
  }

  if (portableTargetPath.startsWith("/private/var/")) {
    variants.add(portableTargetPath.replace(/^\/private/, ""));
  }

  return [...variants].sort((left, right) => right.length - left.length);
}

function sanitizeRuntimeReferences(text, runtimeRoot, runtimeWorkspace, runtimeSkillsDir) {
  if (!text) {
    return text;
  }

  const replacements = [
    { targets: expandRuntimePathVariants(runtimeSkillsDir), replacement: "runtime/workspace/.agents/skills" },
    { targets: expandRuntimePathVariants(runtimeWorkspace), replacement: "runtime/workspace" },
    { targets: expandRuntimePathVariants(runtimeRoot), replacement: "runtime-root" },
  ]
    .flatMap((entry) => entry.targets.map((target) => ({ target, replacement: entry.replacement })))
    .sort((left, right) => right.target.length - left.target.length);

  let sanitized = text;

  for (const entry of replacements) {
    sanitized = sanitized.split(entry.target).join(entry.replacement);
  }

  return sanitized
    .replace(/\/privateruntime\/workspace/g, "runtime/workspace")
    .replace(/\/privateruntime-root\b/g, "runtime-root");
}

function isRepoScopedSkillTrace(traceText, runtimeSkillsDir) {
  const normalizedTraceText = toPortablePath(traceText);
  const portableRuntimeSkillsRoot = toPortablePath(runtimeSkillsDir).replace(/\/+$/, "");
  const portableRelativeRoots = [
    toPortablePath(".agents/skills"),
    toPortablePath(".codex/skills"),
  ];

  return (
    normalizedTraceText.includes(`${portableRuntimeSkillsRoot}/`) ||
    normalizedTraceText.includes(`${portableRuntimeSkillsRoot}"`) ||
    portableRelativeRoots.some((root) =>
      normalizedTraceText.includes(`${root}/`) ||
      normalizedTraceText.includes(`${root}"`) ||
      normalizedTraceText.includes(`./${root}/`) ||
      normalizedTraceText.includes(`../${root}/`) ||
      normalizedTraceText.includes(`../../${root}/`)
    )
  );
}

function isLegacyUserSkillTrace(traceText, hostHome, hostCodexHome) {
  const legacyRoots = [
    path.join(hostHome ?? "", ".codex", "skills"),
    path.join(hostHome ?? "", ".agents", "skills"),
    path.join(hostCodexHome ?? "", "skills"),
  ];

  return legacyRoots.some((root) => {
    const normalizedRoot = toPortablePath(root).replace(/\/+$/, "");
    if (!normalizedRoot) {
      return false;
    }
    return toPortablePath(traceText).includes(`${normalizedRoot}/`) || toPortablePath(traceText).includes(`${normalizedRoot}"`);
  });
}

function hasAnySkillPathEvidence(parsedTrace, runtimeSkillsDir) {
  const text = `${parsedTrace.commands.join("\n")}\n${parsedTrace.commandEvents.join("\n")}`;
  const portableRuntimeSkills = toPortablePath(path.join(runtimeSkillsDir, "codex-sentinel"));
  return (
    isRepoScopedSkillTrace(text, runtimeSkillsDir) ||
    isLegacyUserSkillTrace(
      text,
      process.env.HOME,
      process.env.CODEX_HOME
    ) ||
    (toPortablePath(text).includes(".agents/skills/") && !toPortablePath(text).includes(portableRuntimeSkills)) ||
    toPortablePath(text).includes(".codex/skills/") ||
    toPortablePath(text).includes(".codex/superpowers/")
  );
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripGitTempNoise(text) {
  return text
    .split("\n")
    .filter((line) =>
      !/^git: warning: confstr\(\) failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using \/tmp instead$/.test(line) &&
      !/^git: error: couldn't create cache file '\/tmp\/xcrun_db-[^']+' \(errno=Operation not permitted\)$/.test(line)
    )
    .join("\n");
}

function sanitizeString(text) {
  if (!text) {
    return text;
  }

  let sanitized = stripGitTempNoise(text);

  for (const literal of knownSecretLiterals) {
    sanitized = sanitized.replace(new RegExp(escapeRegExp(literal), "g"), redactionMarker);
  }

  sanitized = sanitized.replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, redactionMarker);
  sanitized = sanitized.replace(
    /((?:["']?[A-Za-z0-9_.-]*(?:password|secret|api[_-]?key|authorization|signing[_-]?key|private[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|jwt[_-]?secret)[A-Za-z0-9_.-]*["']?\s*(?::|(?<![=!<>])=(?!=))\s*["']?))([^"'\s,\]}]+)/gi,
    (_match, prefix) => `${prefix}${redactionMarker}`
  );
  sanitized = sanitized.replace(
    /(["'])(?=[A-Za-z0-9._~+/-]{24,}\1)(?=[^"'\n]*[0-9_-])([A-Za-z0-9._~+/-]{24,})\1/g,
    `$1${redactionMarker}$1`
  );
  sanitized = sanitized.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*\b/g, `$1 ${redactionMarker}`);

  return sanitized;
}

function sanitizeJsonValue(value) {
  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, sanitizeJsonValue(nestedValue)])
    );
  }

  return value;
}

function sanitizeTraceText(traceText) {
  return traceText
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      try {
        return JSON.stringify(sanitizeJsonValue(JSON.parse(line)));
      } catch {
        return JSON.stringify({
          type: "sanitized_trace_line",
          note: `${redactionMarker} UNPARSEABLE TRACE LINE`,
        });
      }
    })
    .join("\n")
    .concat(traceText.endsWith("\n") ? "\n" : "");
}

function runCommand(command, args, cwd) {
  const res = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });

  if (res.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${res.stderr || res.stdout || "unknown error"}`);
  }
}

function initializeRuntimeRepo(runtimeWorkspace) {
  runCommand("git", ["init", "-q"], runtimeWorkspace);
  runCommand("git", ["config", "user.name", "Codex Sentinel Eval"], runtimeWorkspace);
  runCommand("git", ["config", "user.email", "eval@codex-sentinel.local"], runtimeWorkspace);
  mkdirSync(path.join(runtimeWorkspace, ".git", "info"), { recursive: true });
  writeFileSync(path.join(runtimeWorkspace, ".git", "info", "exclude"), ".agents/\n", "utf8");
  runCommand("git", ["add", "."], runtimeWorkspace);
  runCommand("git", ["commit", "-q", "-m", "fixture baseline"], runtimeWorkspace);
}

function replaceInFile(filePath, transforms) {
  let text = readFileSync(filePath, "utf8");
  const original = text;

  for (const [searchValue, replaceValue] of transforms) {
    text = text.replace(searchValue, replaceValue);
  }

  if (text === original) {
    throw new Error(`No changes applied to ${filePath}`);
  }

  writeFileSync(filePath, text, "utf8");
}

function applyCaseSetup(testCase, runtimeWorkspace) {
  if (testCase.setupMode === "tracked-auth-change") {
    replaceInFile(path.join(runtimeWorkspace, "src", "AuthMiddleware.cs"), [
      ["ValidateAudience = true,", "ValidateAudience = false,"],
      ["ValidateLifetime = true,", "ValidateLifetime = false,"],
    ]);
    return;
  }

  if (testCase.setupMode === "untracked-auth-file") {
    writeFileSync(
      path.join(runtimeWorkspace, "src", "ApiKeyMiddleware.cs"),
      `using Microsoft.AspNetCore.Http;
using System.Threading.Tasks;

namespace LifecycleAspNet.Auth;

public sealed class ApiKeyMiddleware
{
    private const string AdminApiKey = "${untrackedSecretLiteral}";
    private readonly RequestDelegate _next;

    public ApiKeyMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (context.Request.Headers.TryGetValue("X-Api-Key", out var apiKey) && apiKey == AdminApiKey)
        {
            await _next(context);
            return;
        }

        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
    }
}
`,
      "utf8"
    );
    return;
  }

  if (testCase.setupMode === "context-budget-risky-files") {
    const budgetDir = path.join(runtimeWorkspace, "src", "Budget");
    mkdirSync(budgetDir, { recursive: true });

    for (let index = 1; index <= 12; index += 1) {
      const suffix = String(index).padStart(2, "0");
      const fillerMembers = Array.from({ length: 220 }, (_unused, memberIndex) => {
        const memberSuffix = String(memberIndex + 1).padStart(3, "0");
        return `    public string BudgetScope${memberSuffix} => "auth-budget-${suffix}-${memberSuffix}";`;
      }).join("\n");
      writeFileSync(
        path.join(budgetDir, `AuthBudget${suffix}.cs`),
        `using Microsoft.IdentityModel.Tokens;

namespace LifecycleAspNet.Budget;

public sealed class AuthBudget${suffix}
{
${fillerMembers}

    public TokenValidationParameters Build()
    {
        return new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = false,
            ValidateLifetime = false,
            ValidateIssuerSigningKey = true
        };
    }
}
`,
        "utf8"
      );
    }

    return;
  }

  if (testCase.setupMode === "nested-scope-tracked-changes") {
    replaceInFile(path.join(runtimeWorkspace, "services", "api", "auth", "AuthHandler.cs"), [
      ["ValidateAudience = true,", "ValidateAudience = false,"],
      ["ValidateLifetime = true,", "ValidateLifetime = false,"],
    ]);
  }
}

function getLastAgentMessage(traceText) {
  let lastAgentMessage = "";

  for (const line of traceText.split("\n")) {
    if (!line.trim()) {
      continue;
    }

    try {
      const event = JSON.parse(line);

      if (event.type === "item.completed" && event.item?.type === "agent_message" && typeof event.item.text === "string") {
        lastAgentMessage = event.item.text;
      }
    } catch {
      continue;
    }
  }

  return lastAgentMessage;
}

function joinSourceParts(parts) {
  return parts.filter((part) => typeof part === "string" && part.length > 0).join("\n");
}

function parseTraceArtifacts(traceText) {
  const events = [];
  const commands = [];
  const commandEvents = [];
  const messages = [];
  const parseWarnings = [];

  for (const line of traceText.split("\n")) {
    if (!line.trim()) {
      continue;
    }

    try {
      const event = JSON.parse(line);
      events.push(event);

      const item = event.item;
      if (event.type === "item.completed" && item?.type === "command_execution") {
        const command = typeof item.command === "string" ? item.command : "";
        const aggregatedOutput = typeof item.aggregated_output === "string" ? item.aggregated_output : "";

        if (command) {
          commands.push(command);
        }

        commandEvents.push(joinSourceParts([command, aggregatedOutput]));
      }

      if (event.type === "item.completed" && item?.type === "agent_message" && typeof item.text === "string") {
        messages.push(item.text);
      }
    } catch {
      parseWarnings.push("unparseable sanitized trace line");
    }
  }

  return {
    events,
    commands,
    commandEvents,
    messages,
    parseWarnings,
    traceText,
  };
}

function buildCheckSources(lastMessage, stderrText, parsedTrace, turnMessages) {
  return {
    message: lastMessage,
    messages: joinSourceParts(parsedTrace.messages),
    commands: joinSourceParts(parsedTrace.commands),
    command_events: joinSourceParts(parsedTrace.commandEvents),
    turn_messages: joinSourceParts(turnMessages),
    turn_messages_list: turnMessages,
    trace: parsedTrace.traceText,
    stderr: stderrText,
  };
}

function collectUnexpectedExternalInstructionPaths(parsedTrace, runtimeWorkspace, hostHome, hostCodexHome) {
  const blockedPrefixes = new Set();

  if (hostHome) {
    blockedPrefixes.add(path.join(hostHome, ".codex", "superpowers") + path.sep);
    blockedPrefixes.add(path.join(hostHome, ".codex", "skills") + path.sep);
    blockedPrefixes.add(path.join(hostHome, ".codex", "AGENTS.md"));
    blockedPrefixes.add(path.join(hostHome, ".codex", "AGENTS.override.md"));
    blockedPrefixes.add(path.join(hostHome, ".agents", "skills") + path.sep);
    blockedPrefixes.add(path.join(hostHome, ".agents", "AGENTS.md"));
    blockedPrefixes.add(path.join(hostHome, ".agents", "AGENTS.override.md"));
  }

  if (hostCodexHome) {
    blockedPrefixes.add(path.join(hostCodexHome, "superpowers") + path.sep);
    blockedPrefixes.add(path.join(hostCodexHome, "skills") + path.sep);
    blockedPrefixes.add(path.join(hostCodexHome, "AGENTS.md"));
    blockedPrefixes.add(path.join(hostCodexHome, "AGENTS.override.md"));
  }

  const matches = new Set();
  const candidateTexts = [...parsedTrace.commands, ...parsedTrace.commandEvents];
  const portableRuntimeSkills = toPortablePath(path.join(runtimeWorkspace, ".agents", "skills"));
  const portableRuntimeWorkspace = toPortablePath(runtimeWorkspace);
  const portableRelativeRepoSkills = [".agents/skills/", "./.agents/skills/", "../.agents/skills/", "../../.agents/skills/"];
  const portableRelativeRuntimeSkills = [".codex/skills/", "./.codex/skills/", "../.codex/skills/", "../../.codex/skills/"];
  const hasRuntimeWorkspace = Boolean(runtimeWorkspace);
  const isRuntimeRelativeRepoSkillPath = (commandText) =>
    portableRelativeRepoSkills.some((prefix) => commandText.includes(prefix)) ||
    portableRelativeRuntimeSkills.some((prefix) => commandText.includes(prefix));

  for (const commandText of candidateTexts) {
    const portableCommandText = toPortablePath(commandText);

    for (const prefix of blockedPrefixes) {
      if (!prefix) {
        continue;
      }

      const portablePrefix = toPortablePath(prefix);

      if (portableCommandText.includes(portablePrefix) && (!hasRuntimeWorkspace || !portableCommandText.includes(portableRuntimeSkills))) {
        matches.add(prefix);
      }
    }

    if (
      (portableCommandText.includes(".agents/skills/") || portableCommandText.includes(".codex/skills/")) &&
      !portableCommandText.includes(portableRuntimeSkills) &&
      !portableCommandText.includes(portableRuntimeWorkspace) &&
      !isRuntimeRelativeRepoSkillPath(portableCommandText)
    ) {
      if (!hasRuntimeWorkspace || !portableCommandText.includes(`${portableRuntimeWorkspace}/.agents/skills/`)) {
        matches.add("repo-local skill directory outside runtime scope");
      }
    }
  }

  return [...matches].sort();
}

function shouldRetryCase(result, attemptNumber) {
  if (attemptNumber >= 2) {
    return false;
  }

  const failedChecks = result.case_checks.filter((item) => !item.pass).map((item) => item.id);

  return (
    result.exit_code === 0 &&
    !result.timed_out &&
    result.matched_phrase !== null &&
    !result.legacy_user_skill_trace_hit &&
    failedChecks.length === 1 &&
    failedChecks[0] === "repo_skill_trace"
  );
}

function buildCaseEnvironment(testCase, runtimeRoot, codexHome) {
  const runtimeTmpDir = path.join(runtimeRoot, "tmp");
  const xdgConfigHome = path.join(runtimeRoot, "xdg-config");
  const xdgCacheHome = path.join(runtimeRoot, "xdg-cache");
  mkdirSync(runtimeTmpDir, { recursive: true });
  mkdirSync(xdgConfigHome, { recursive: true });
  mkdirSync(xdgCacheHome, { recursive: true });

  const env = {
    PATH: process.env.PATH ?? "",
    HOME: runtimeRoot,
    CODEX_HOME: codexHome,
    XDG_CONFIG_HOME: xdgConfigHome,
    XDG_CACHE_HOME: xdgCacheHome,
    TMPDIR: runtimeTmpDir,
    TMP: runtimeTmpDir,
    TEMP: runtimeTmpDir,
    LANG: process.env.LANG ?? "en_US.UTF-8",
  };

  for (const key of [
    "LC_ALL",
    "LC_CTYPE",
    "TERM",
    "COLORTERM",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_ORG_ID",
    "OPENAI_PROJECT_ID",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
  ]) {
    if (process.env[key]) {
      env[key] = process.env[key];
    }
  }

  if (testCase.envMode === "git-unavailable") {
    const fakeBinDir = path.join(runtimeRoot, "fake-bin");
    const fakeGitPath = path.join(fakeBinDir, "git");
    mkdirSync(fakeBinDir, { recursive: true });
    writeFileSync(fakeGitPath, "#!/bin/sh\necho 'codex-sentinel-eval: git unavailable' >&2\nexit 127\n", "utf8");
    chmodSync(fakeGitPath, 0o755);
    env.PATH = `${fakeBinDir}:${process.env.PATH ?? ""}`;
  }

  return env;
}

function buildFailureResult({
  testCase,
  attemptNumber,
  workingDirectory,
  runtimeWorkspace,
  runtimeRoot,
  messagePath,
  tracePath,
  stderrPath,
  resultPath,
  error,
}) {
  const failNote = `Case execution failed: ${error instanceof Error ? error.message : String(error)}`;
  const runtimeWorkspaceLabel = normalizeRuntimePathLabel(runtimeWorkspace, runtimeWorkspace);
  const runtimeWorkingDirectoryLabel = normalizeRuntimePathLabel(runtimeWorkspace, workingDirectory);

  writeFileSync(tracePath, "", "utf8");
  writeFileSync(messagePath, "", "utf8");
  writeFileSync(stderrPath, `${sanitizeString(failNote)}\n`, "utf8");

  const result = {
    id: testCase.id,
    attempt: attemptNumber,
    pass: false,
    workspace: testCase.workingSubdir ?? ".",
    fixture_root: testCase.fixtureRoot,
    runtime_workspace: runtimeWorkspaceLabel,
    runtime_working_directory: runtimeWorkingDirectoryLabel,
    exit_code: 1,
    timed_out: false,
    repo_skill_trace_hit: false,
    skill_path_evidence_observed: false,
    legacy_user_skill_trace_hit: false,
    unexpected_external_instruction_paths: [],
    expected_any: testCase.expectedAny,
    matched_phrase: null,
    case_checks: [],
    artifacts_sanitized: true,
    trace_sanitizer_version: traceSanitizerVersion,
    message_path: path.relative(repoRoot, messagePath),
    trace_path: path.relative(repoRoot, tracePath),
    stderr_path: path.relative(repoRoot, stderrPath),
    notes: failNote,
  };

  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  return result;
}

function runCaseAttempt(testCase, caseArtifactsDir, attemptNumber) {
  const attemptDir = path.join(caseArtifactsDir, `attempt-${attemptNumber}`);
  const runtimeRoot = mkdtempSync(path.join(tmpdir(), `codex-sentinel-${testCase.id}-`));
  const runtimeWorkspace = path.join(runtimeRoot, "workspace");
  const runtimeSkillsDir = path.join(runtimeWorkspace, ".agents", "skills");
  const codexHome = path.join(runtimeRoot, "codex-home");
  const sourceCodexHome = process.env.CODEX_HOME ?? path.join(process.env.HOME ?? "", ".codex");
  const sourceAuthPath = path.join(sourceCodexHome, "auth.json");
  const tracePath = path.join(attemptDir, "trace.jsonl");
  const messagePath = path.join(attemptDir, "last-message.txt");
  const stderrPath = path.join(attemptDir, "stderr.txt");
  const resultPath = path.join(attemptDir, "result.json");
  const rawMessagePath = path.join(runtimeRoot, "last-message.txt");
  const fixtureRoot = path.join(repoRoot, testCase.fixtureRoot);
  const workingDirectory = path.resolve(runtimeWorkspace, testCase.workingSubdir ?? ".");
  const timeoutMs = testCase.timeoutMs ?? caseTimeoutMs;
  const hostHome = process.env.HOME ?? "";
  const hostCodexHome = process.env.CODEX_HOME ?? path.join(hostHome, ".codex");
  const sourceCaseEnvironment = buildCaseEnvironment(testCase, runtimeRoot, codexHome);
  const runtimeWorkspaceLabel = normalizeRuntimePathLabel(runtimeWorkspace, runtimeWorkspace);
  const runtimeWorkingDirectoryLabel = normalizeRuntimePathLabel(runtimeWorkspace, workingDirectory);
  const requireRepoSkillTraceEvidence = testCase.requireRepoSkillTraceEvidence !== false;

  mkdirSync(attemptDir, { recursive: true });
  try {
    cpSync(fixtureRoot, runtimeWorkspace, { recursive: true });
    initializeRuntimeRepo(runtimeWorkspace);
    mkdirSync(runtimeSkillsDir, { recursive: true });
    mkdirSync(codexHome, { recursive: true });

    if (existsSync(sourceAuthPath)) {
      cpSync(sourceAuthPath, path.join(codexHome, "auth.json"));
    }

    for (const entry of readdirSync(path.join(repoRoot, "skills"))) {
      cpSync(path.join(repoRoot, "skills", entry), path.join(runtimeSkillsDir, entry), {
        recursive: true,
      });
    }

    applyCaseSetup(testCase, runtimeWorkspace);

    if (!existsSync(workingDirectory)) {
      return {
        attemptNumber,
        attemptDir,
        messagePath,
        tracePath,
        stderrPath,
        resultPath,
        result: buildFailureResult({
          testCase,
          attemptNumber,
          workingDirectory,
          runtimeWorkspace,
          runtimeRoot,
          messagePath,
          tracePath,
          stderrPath,
          resultPath,
          error: `Missing runtime working directory: ${workingDirectory}`,
        }),
      };
    }

    const turns = normalizeCaseTurns(testCase);
  const rawTraceChunks = [];
  const rawStderrChunks = [];
  const rawTurnMessages = [];
  const turnResults = [];
  let rawLastMessage = "";

    for (let turnIndex = 0; turnIndex < turns.length; turnIndex += 1) {
      const turn = turns[turnIndex];
      const turnMessagePath =
        turns.length === 1
          ? rawMessagePath
          : path.join(runtimeRoot, `last-message-turn-${turnIndex + 1}.txt`);
      const args =
        turnIndex === 0
          ? [
              "exec",
              "--sandbox",
              "read-only",
              "--json",
              ...(turns.length === 1 ? ["--ephemeral"] : []),
              "--skip-git-repo-check",
              "-C",
              workingDirectory,
              "-o",
              turnMessagePath,
              turn.prompt,
            ]
          : [
              "exec",
              "resume",
              "--last",
              "--json",
              "--skip-git-repo-check",
              "-o",
              turnMessagePath,
              turn.prompt,
            ];

      const turnResult = spawnSync("codex", args, {
        cwd: repoRoot,
        encoding: "utf8",
        timeout: timeoutMs,
        env: sourceCaseEnvironment,
      });

      const rawTurnTraceText = turnResult.stdout ?? "";
      const rawTurnStderrText = turnResult.stderr ?? "";
      const rawFileMessage = existsSync(turnMessagePath) ? readFileSync(turnMessagePath, "utf8") : "";
      const rawTraceMessage = getLastAgentMessage(rawTurnTraceText);
      const rawTurnMessage = rawFileMessage || rawTraceMessage || "";

      rawTraceChunks.push(rawTurnTraceText);
      rawStderrChunks.push(rawTurnStderrText);
      rawTurnMessages.push(rawTurnMessage);
      turnResults.push(turnResult);
      rawLastMessage = rawTurnMessage || rawLastMessage;

      if (turnResult.status !== 0 || turnResult.error?.code === "ETIMEDOUT") {
        break;
      }
    }

    const exitCode = turnResults.find((turnResult) => turnResult.status !== 0)?.status ?? turnResults.at(-1)?.status ?? 1;
    const timedOut = turnResults.some((turnResult) => turnResult.error?.code === "ETIMEDOUT");
    const rawTraceText = joinTextChunks(rawTraceChunks);
    const rawStderrText = joinTextChunks(rawStderrChunks);
    const traceText = sanitizeTraceText(rawTraceText);
    const stderrText = sanitizeString(rawStderrText);
    const lastMessage = sanitizeRuntimeReferences(
      sanitizeString(rawLastMessage),
      runtimeRoot,
      runtimeWorkspace,
      runtimeSkillsDir
    );
    const sanitizedStderrText = sanitizeRuntimeReferences(
      stderrText,
      runtimeRoot,
      runtimeWorkspace,
      runtimeSkillsDir
    );
    const turnMessages = rawTurnMessages.map((rawTurnMessage) =>
      sanitizeRuntimeReferences(
        sanitizeString(rawTurnMessage),
        runtimeRoot,
        runtimeWorkspace,
        runtimeSkillsDir
      )
    );
    const parsedTrace = parseTraceArtifacts(traceText);
    const sanitizedTraceText = sanitizeRuntimeReferences(
      traceText,
      runtimeRoot,
      runtimeWorkspace,
      runtimeSkillsDir
    );
    const sanitizedParsedTrace = parseTraceArtifacts(sanitizedTraceText);

    writeFileSync(tracePath, sanitizedTraceText, "utf8");
    writeFileSync(stderrPath, sanitizedStderrText, "utf8");
    writeFileSync(messagePath, lastMessage, "utf8");
    const turnMessagePaths = turns.length > 1
      ? turnMessages.map((turnMessage, index) => {
        const turnArtifactPath = path.join(attemptDir, `last-message-turn-${index + 1}.txt`);
        writeFileSync(turnArtifactPath, turnMessage, "utf8");
        return turnArtifactPath;
      })
      : [];

    const haystack = normalizeText(lastMessage);
    const matchedPhrase =
      testCase.expectedAny.find((needle) => haystack.includes(normalizeText(needle))) ?? null;
    const repoSkillTraceHit = parsedTrace.commands.some((command) =>
      isRepoScopedSkillTrace(command, runtimeSkillsDir)
    );
    const legacyUserSkillTraceHit = parsedTrace.commands.some((command) =>
      isLegacyUserSkillTrace(command, hostHome, hostCodexHome)
    );
    const skillPathEvidenceObserved = hasAnySkillPathEvidence(parsedTrace, runtimeSkillsDir);
    const repoSkillTraceSatisfied =
      !requireRepoSkillTraceEvidence || repoSkillTraceHit || !skillPathEvidenceObserved;
    const unexpectedExternalInstructionPaths = collectUnexpectedExternalInstructionPaths(
      parsedTrace,
      runtimeWorkspace,
      hostHome,
      hostCodexHome
    );
    const hasCapturedFinalMessage = lastMessage.length > 0;
    const sources = buildCheckSources(lastMessage, sanitizedStderrText, sanitizedParsedTrace, turnMessages);
    const caseChecks = [
      {
        id: "response_available",
        pass: exitCode === 0 || hasCapturedFinalMessage,
        notes:
          exitCode === 0 || hasCapturedFinalMessage
            ? "A final message or clean exit was captured."
            : "No final message was captured and the command did not exit cleanly.",
      },
      {
        id: "expected_phrase",
        pass: matchedPhrase !== null,
        notes:
          matchedPhrase !== null
            ? `Matched expected phrase: ${matchedPhrase}`
            : `Expected one of: ${testCase.expectedAny.join(", ")}`,
      },
      {
        id: "repo_skill_trace",
        pass: repoSkillTraceSatisfied,
        notes: requireRepoSkillTraceEvidence
          ? repoSkillTraceHit
            ? "Repo-scoped skill trace observed."
            : skillPathEvidenceObserved
              ? "Skill path evidence was emitted, but repo-scoped skill trace was not observed."
              : "No explicit skill path evidence was emitted in this run."
          : "Repo-scoped skill trace confirmation is not required for this case.",
      },
      {
        id: "no_legacy_user_skill_trace",
        pass: !legacyUserSkillTraceHit,
        notes: legacyUserSkillTraceHit
          ? "Legacy user-scoped skill trace was observed."
          : "Legacy user-scoped skill trace was not observed.",
      },
      {
        id: "no_unexpected_external_instruction_paths",
        pass: unexpectedExternalInstructionPaths.length === 0,
        notes:
          unexpectedExternalInstructionPaths.length === 0
            ? "No unexpected external instruction paths were observed."
            : `Unexpected external instruction paths observed: ${unexpectedExternalInstructionPaths.join(", ")}`,
      },
      ...((testCase.extraChecks ?? []).map((check) => evaluateCheck(check, sources))),
    ];
    const pass = caseChecks.every((check) => check.pass);
    const failureReasons = [];

    if (exitCode !== 0) {
      failureReasons.push(`codex exit code ${exitCode ?? 1}`);
    }
    if (timedOut) {
      failureReasons.push("case timed out");
    }
    if (matchedPhrase === null) {
      failureReasons.push("expected phrase not found");
    }
    if (!repoSkillTraceSatisfied) {
      failureReasons.push("repo-scoped skill trace not observed");
    }
    if (legacyUserSkillTraceHit) {
      failureReasons.push("legacy user-scoped skill trace observed");
    }
    if (unexpectedExternalInstructionPaths.length > 0) {
      failureReasons.push("unexpected external instruction paths observed");
    }
    for (const check of caseChecks.filter((item) => !item.pass)) {
      failureReasons.push(`check failed: ${check.id}`);
    }

    const result = {
      id: testCase.id,
      attempt: attemptNumber,
      pass,
      turn_count: turns.length,
      workspace: testCase.workingSubdir ?? ".",
      fixture_root: testCase.fixtureRoot,
      runtime_workspace: runtimeWorkspaceLabel,
      runtime_working_directory: runtimeWorkingDirectoryLabel,
      exit_code: exitCode,
      timed_out: timedOut,
      repo_skill_trace_hit: repoSkillTraceHit,
      skill_path_evidence_observed: skillPathEvidenceObserved,
      legacy_user_skill_trace_hit: legacyUserSkillTraceHit,
      unexpected_external_instruction_paths: unexpectedExternalInstructionPaths,
      expected_any: testCase.expectedAny,
      matched_phrase: matchedPhrase,
      case_checks: caseChecks,
      artifacts_sanitized: true,
      trace_sanitizer_version: traceSanitizerVersion,
      message_path: path.relative(repoRoot, messagePath),
      turn_message_paths: turnMessagePaths.map((turnMessagePath) => path.relative(repoRoot, turnMessagePath)),
      trace_path: path.relative(repoRoot, tracePath),
      stderr_path: path.relative(repoRoot, stderrPath),
      notes: pass
        ? exitCode === 0
          ? `Expected phrase found${requireRepoSkillTraceEvidence ? " and repo-scoped skill source confirmed." : "."}`
          : "Expected phrase found in a trace-captured final agent message and repo-scoped skill source confirmed."
        : failureReasons.join("; "),
    };

    writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    return {
      attemptNumber,
      attemptDir,
      messagePath,
      turnMessagePaths,
      tracePath,
      stderrPath,
      resultPath,
      result,
    };
  } catch (error) {
    return {
      attemptNumber,
      attemptDir,
      messagePath,
      turnMessagePaths: [],
      tracePath,
      stderrPath,
      resultPath,
      result: buildFailureResult({
        testCase,
        attemptNumber,
        workingDirectory,
        runtimeWorkspace,
        runtimeRoot,
        messagePath,
        tracePath,
        stderrPath,
        resultPath,
        error,
      }),
    };
  } finally {
    rmSync(runtimeRoot, { recursive: true, force: true });
  }
}

function runCase(testCase) {
  const caseArtifactsDir = path.join(artifactsRoot, testCase.id);
  rmSync(caseArtifactsDir, { recursive: true, force: true });
  mkdirSync(caseArtifactsDir, { recursive: true });

  const attempts = [];
  let selectedAttempt = null;

  for (let attemptNumber = 1; attemptNumber <= 2; attemptNumber += 1) {
    const attempt = runCaseAttempt(testCase, caseArtifactsDir, attemptNumber);
    attempts.push(attempt);
    selectedAttempt = attempt;

    if (!shouldRetryCase(attempt.result, attemptNumber)) {
      break;
    }
  }

  const finalTracePath = path.join(caseArtifactsDir, "trace.jsonl");
  const finalMessagePath = path.join(caseArtifactsDir, "last-message.txt");
  const finalStderrPath = path.join(caseArtifactsDir, "stderr.txt");
  const finalResultPath = path.join(caseArtifactsDir, "result.json");
  const finalTurnMessagePaths = (selectedAttempt.turnMessagePaths ?? []).map((sourceTurnPath, index) => {
    const destinationTurnPath = path.join(caseArtifactsDir, `last-message-turn-${index + 1}.txt`);
    writeFileSync(destinationTurnPath, readFileSync(sourceTurnPath, "utf8"), "utf8");
    return destinationTurnPath;
  });
  const finalTraceText = readFileSync(selectedAttempt.tracePath, "utf8");
  const finalMessageText = readFileSync(selectedAttempt.messagePath, "utf8");
  const finalStderrText = readFileSync(selectedAttempt.stderrPath, "utf8");
  const finalResult = {
    ...selectedAttempt.result,
    attempt_count: attempts.length,
    attempts: attempts.map((attempt) => ({
      attempt: attempt.attemptNumber,
      pass: attempt.result.pass,
      repo_skill_trace_hit: attempt.result.repo_skill_trace_hit,
      legacy_user_skill_trace_hit: attempt.result.legacy_user_skill_trace_hit,
      matched_phrase: attempt.result.matched_phrase,
      notes: attempt.result.notes,
      turn_message_paths: attempt.result.turn_message_paths ?? [],
      result_path: path.relative(repoRoot, attempt.resultPath),
    })),
    message_path: path.relative(repoRoot, finalMessagePath),
    turn_message_paths: finalTurnMessagePaths.map((turnMessagePath) => path.relative(repoRoot, turnMessagePath)),
    trace_path: path.relative(repoRoot, finalTracePath),
    stderr_path: path.relative(repoRoot, finalStderrPath),
    notes:
      attempts.length > 1
        ? `${selectedAttempt.result.notes} Stabilized after ${attempts.length - 1} retry for repo-scoped trace confirmation.`
        : selectedAttempt.result.notes,
  };

  writeFileSync(finalTracePath, finalTraceText, "utf8");
  writeFileSync(finalMessagePath, finalMessageText, "utf8");
  writeFileSync(finalStderrPath, finalStderrText, "utf8");
  writeFileSync(finalResultPath, `${JSON.stringify(finalResult, null, 2)}\n`, "utf8");
  return finalResult;
}

function validateSuiteArtifactIntegrity(selectedCases, checks) {
  const requiredPaths = new Set();
  const selectedIds = new Set(selectedCases.map((testCase) => testCase.id));
  const existingCaseDirs = existsSync(artifactsRoot)
    ? readdirSync(artifactsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    : [];

  for (const testCase of selectedCases) {
    const summaryCasePath = path.join(artifactsRoot, testCase.id, "result.json");
    requiredPaths.add(summaryCasePath);
  }

  for (const check of checks) {
    requiredPaths.add(path.join(repoRoot, check.message_path));
    requiredPaths.add(path.join(repoRoot, check.trace_path));
    requiredPaths.add(path.join(repoRoot, check.stderr_path));

    for (const attempt of check.attempts ?? []) {
      const attemptCasePath = path.join(repoRoot, attempt.result_path);
      requiredPaths.add(attemptCasePath);
    }
  }

  const missingPaths = [...requiredPaths].filter((artifactPath) => !existsSync(artifactPath));
  const extraCaseDirs = selectedCases.length === cases.length
    ? existingCaseDirs.filter((dirName) => !selectedIds.has(dirName))
    : [];

  return {
    checks_considered: checks.length,
    expected_case_ids: [...selectedIds],
    selected_case_count: selectedCases.length,
    missing_paths: missingPaths.map((artifactPath) => path.relative(repoRoot, artifactPath)).sort(),
    extra_case_dirs: extraCaseDirs,
    integrity_passed: missingPaths.length === 0 && extraCaseDirs.length === 0,
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--list")) {
    listCases();
    return;
  }
  if (args.includes("--manifest-json")) {
    printManifestMetadata();
    return;
  }

  const requestedIds = args.filter((arg) => !arg.startsWith("--"));
  const selectedCases =
    requestedIds.length === 0 ? cases : cases.filter((testCase) => requestedIds.includes(testCase.id));

  if (selectedCases.length === 0) {
    console.error("No matching eval cases selected.");
    process.exit(1);
  }

  if (requestedIds.length === 0) {
    rmSync(artifactsRoot, { recursive: true, force: true });
  }

  const checks = selectedCases.map(runCase);
  const artifactIntegrity = validateSuiteArtifactIntegrity(selectedCases, checks);
  const passedCount = checks.filter((check) => check.pass).length;
  const score = Math.round((passedCount / checks.length) * 100);
  const summary = {
    runner_fingerprint: manifestMetadata.case_manifest_fingerprint,
    case_manifest_fingerprint: manifestMetadata.case_manifest_fingerprint,
    runner_source_fingerprint: manifestMetadata.runner_source_fingerprint,
    overall_pass: passedCount === checks.length && artifactIntegrity.integrity_passed,
    score,
    selected_case_ids: selectedCases.map((testCase) => testCase.id),
    selected_case_count: selectedCases.length,
    total_available_cases: manifestMetadata.total_available_cases,
    full_suite: selectedCases.length === cases.length,
    artifact_integrity: artifactIntegrity,
    checks,
  };

  mkdirSync(artifactsRoot, { recursive: true });
  writeFileSync(path.join(artifactsRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary, null, 2));
}

main();
