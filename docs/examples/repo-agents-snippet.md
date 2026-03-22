# Repo AGENTS Snippet

Use this as the starting point for a target repository's `AGENTS.md`.

Put this block at the repository root. These checkpoints are what make later-stage review and test-planning offers durable inside that repo.

```md
# Codex Sentinel Integration

## Security Checkpoints
- Planning checkpoint: before locking a plan, architecture, or task breakdown, run a security gap analysis.
- Risky-implementation checkpoint: when work touches authentication, authorization, tokens, secrets, middleware, outbound requests, file handling, CI, deployment, or other trust-boundary code, run a low-noise scoped risky-change review pass and surface only material concerns.
- Post-implementation checkpoint: when coding appears complete, offer a focused security review.
- Pre-release checkpoint: before release, deployment, or handoff, offer a stack-aware security check plan.

## Guardrails
- Treat security guidance as advisory-first unless the user explicitly asks for stricter gating.
- Never claim the codebase is secure, fully reviewed, or production-safe from a security perspective.
- Separate reviewed scope, unreviewed scope, assumptions, and tool-run status in every substantial security result.
- If the user declines review or test planning at the current stage, do not repeat the same offer until the stage changes.
- If the stack is unclear, fall back to common web-security guidance and say that stack inference is uncertain.
```

## Adoption Notes

- The planning, post-implementation, and pre-release checkpoints should stay in the same block so Codex can interpret them as one lifecycle contract.
- After adding or editing repo-local `AGENTS.md` files, start a new Codex run or session before validating the updated contract.
- The risky-implementation checkpoint should stay close to the other lifecycle checkpoints so Codex can interpret it as part of one security workflow instead of an unrelated coding hint.
- Skill installation helps Codex discover the suite, but this snippet is what makes later-stage offers durable in the repo once a new run or session starts.
- Put repository-specific compliance or threat-model requirements below the snippet.
- Keep security checkpoints short and operational.
- Avoid mixing unrelated coding conventions into the same block if you want the behavior to stay discoverable.
