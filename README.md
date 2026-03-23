# Codex-Sentinel

> Stage-aware security skills for Codex that surface planning gaps, offer opt-in reviews, and help teams ship safer code without pretending to certify security.

[![Codex Skills](https://img.shields.io/badge/Codex-Agent%20Skills-111111?style=flat)](#what-it-is)
[![Validation](https://img.shields.io/badge/Validation-static%20%2B%20evals-2ea043?style=flat)](#validation-and-release)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat)](LICENSE)
[![Stacks](https://img.shields.io/badge/Stacks-ASP.NET%20Core%20%7C%20Spring%20%7C%20Node%20%7C%20Python-1f6feb?style=flat)](#supported-stacks)
[![Release Zip](https://img.shields.io/badge/Release%20Zip-verified-8250df?style=flat)](#validation-and-release)

---

## What It Is

Codex-Sentinel is a repository of reusable security skills for Codex. It helps teams catch security gaps during planning, run an opt-in focused review after implementation, and propose a practical security test/check plan before release.

The suite is advisory-first by design. It is built to improve signal and consistency, not to claim that a repository is secure, fully reviewed, or production-ready.

## Why It Exists

- planning discussions often miss authentication, authorization, secret-handling, and trust-boundary requirements
- post-implementation reviews are easy to skip unless the repo has a durable checkpoint model
- release hardening guidance is often too generic or too tool-heavy for day-to-day development
- teams need repeatable, repo-local security prompts without turning the assistant into a blocker by default

## Included Skills

| Skill | Purpose |
| --- | --- |
| `codex-sentinel` | Orchestrator that chooses the right security mode for the current stage |
| `security-plan-gap` | Planning-stage security gap analysis |
| `security-review-gate` | Opt-in post-implementation security review |
| `security-test-rig` | Opt-in security test/check planning before release |
| `shared/*` | Common threat references, finding schema, and stack profiles |

## Supported Stacks

- `.NET / ASP.NET Core`
- `Java / Spring`
- `Node / TypeScript`
- `Python`

If the stack is unclear, the suite falls back to common web-security guidance and says that the stack inference is uncertain.

## Quick Start

### 1. Install the skills

Project-scoped install:

```bash
mkdir -p .agents/skills
cp -R skills/codex-sentinel .agents/skills/
cp -R skills/security-plan-gap .agents/skills/
cp -R skills/security-review-gate .agents/skills/
cp -R skills/security-test-rig .agents/skills/
cp -R skills/shared .agents/skills/
```

User-scoped install works the same way with `~/.agents/skills/` instead of `.agents/skills/`.

### 2. Add repo-level checkpoint guidance

Use [`docs/examples/repo-agents-snippet.md`](docs/examples/repo-agents-snippet.md) as the starting point for the target repository's `AGENTS.md`.

Repo-local checkpoint guidance is what makes planning, post-implementation review, and pre-release hardening show up as durable repo behaviors instead of one-off prompts.

### 3. Start with the orchestrator

Example prompts:

- `Use $codex-sentinel while we plan this new ASP.NET Core feature.`
- `Use $codex-sentinel before we release this Spring service.`
- `Use $security-test-rig to propose a lightweight security check plan for this Node/TypeScript API.`
- `Use $security-plan-gap to review this Python API design for missing security requirements.`

More prompt examples live in [`docs/examples/example-prompts.md`](docs/examples/example-prompts.md).

## Adoption Modes

- `Explicit invocation`: useful when you want help in the current conversation without changing repo behavior
- `Repo-integrated invocation`: useful when the target repository includes the Codex-Sentinel checkpoint block in `AGENTS.md`
- `Hybrid invocation`: recommended default; install the skills, add repo-level checkpoints, and keep the suite easy to discover and durable across stages

## Safety Model

- planning analysis can happen automatically at the planning stage
- read-only active analysis is available only after explicit user consent in risky-change and accepted review flows
- code security review is opt-in
- security test/check planning is opt-in
- sanitized eval artifacts should not contain raw command output
- substantial results should separate reviewed areas, unreviewed areas, assumptions, and tool-run status
- the suite must not silently install tools, mutate project files, or imply that a full repository review occurred

## Validation And Release

The validation scenarios live in [`docs/superpowers/validation/2026-03-18-codex-sentinel-scenarios.md`](docs/superpowers/validation/2026-03-18-codex-sentinel-scenarios.md).

Recommended local verification:

```bash
bash scripts/static-validation.sh
node evals/run-codex-sentinel.mjs --manifest-json
node evals/run-codex-sentinel.mjs
```

Public release flow:

```bash
bash scripts/package-release.sh
CODEX_SENTINEL_FORCE_NO_RSYNC=1 bash scripts/package-release.sh Codex-Sentinel-fallback
node scripts/verify-release-archive.mjs dist/Codex-Sentinel.zip
node scripts/verify-release-archive.mjs dist/Codex-Sentinel-fallback.zip
```

Run those commands only from a clean clone of the repository or the canonical repo root. Do not build release zips from Finder exports, wrapped workspace snapshots, or a directory that contains another repo-shaped copy of Codex-Sentinel.

`node scripts/verify-release-archive.mjs` verifies the shipped release surface against the source tree by comparing normalized paths, file hashes, and eval manifest provenance. It is stronger than a simple zip hygiene check.

Artifact types:

- `Source repo`: the authoritative GitHub repository contents
- `Release zip`: a clean archive generated by `scripts/package-release.sh`
- `Sanitized evidence bundle`: an optional separate bundle containing curated `evals/artifacts/` output

Important release rules:

- do not share Finder/manual workspace zips
- only build release archives from a clean repo root or fresh clone
- default public source releases and default release zips do not ship `evals/artifacts/`
- if you curate a sanitized evidence bundle with `summary.json`, validate it with `node scripts/validate-release-surface.mjs --require-summary`
- `.github/workflows/live-acceptance.yml` is manual and self-hosted on purpose; it is optional release evidence, not a default PR gate

## Repository Layout

```text
.
├── AGENTS.md
├── CONTRIBUTING.md
├── LICENSE
├── README.md
├── SECURITY.md
├── docs/
│   ├── examples/
│   └── superpowers/
├── evals/
├── fixtures/
├── scripts/
└── skills/
    ├── codex-sentinel/
    ├── security-plan-gap/
    ├── security-review-gate/
    ├── security-test-rig/
    └── shared/
```

## Author

**Alican Kiraz**

[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=flat&logo=linkedin&logoColor=white)](https://linkedin.com/in/alican-kiraz)
[![X](https://img.shields.io/badge/X-000000?style=flat&logo=x&logoColor=white)](https://x.com/AlicanKiraz0)
[![Medium](https://img.shields.io/badge/Medium-12100E?style=flat&logo=medium&logoColor=white)](https://alican-kiraz1.medium.com)
[![HuggingFace](https://img.shields.io/badge/HuggingFace-FFD21E?style=flat&logo=huggingface&logoColor=black)](https://huggingface.co/AlicanKiraz0)
[![GitHub](https://img.shields.io/badge/GitHub-181717?style=flat&logo=github&logoColor=white)](https://github.com/alicankiraz1)

## License

MIT. See [LICENSE](LICENSE).
