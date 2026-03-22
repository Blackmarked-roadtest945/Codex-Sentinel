# Example Prompts

## Orchestrator

- `Use $codex-sentinel while we plan this ASP.NET Core billing feature.`
- `Use $codex-sentinel now that the Spring Boot refactor is done.`
- `Use $security-plan-gap to review this Node/TypeScript API plan before implementation.`
- `Use $codex-sentinel before we hand off this Python API for release.`

## Full Lifecycle

- `Use $codex-sentinel while we plan a new ASP.NET Core admin dashboard with role-based access.`
- `The ASP.NET Core admin dashboard implementation is done.`
- `The ASP.NET Core admin dashboard is ready for release handoff.`

## Risky Implementation

- `We just changed the ASP.NET Core auth middleware and token validation flow.`
- `We changed src/AuthMiddleware.cs and token validation flow. You may use read-only active analysis on this scope.`
- `We added a Python file upload endpoint and direct path-based file serving.`
- `The CI pipeline now injects deployment secrets for the release job.`

## Low-Noise Risky-Change Review

- `We only updated the ASP.NET Core admin dashboard README and renamed a view model for clarity.`
- `We refactored the ASP.NET Core token validation setup into shared configuration helpers, but the trust boundary and enforcement rules stayed the same.`

## Explicit-Only Fallback

- `Use $codex-sentinel while we plan this web feature.`
- `We just changed token validation and secret loading in a workspace that does not have AGENTS.md.`
- `Will the later review and release offers be automatic in this workspace?`
- `If I add AGENTS.md now, should I start a new Codex session before expecting repo-integrated behavior?`
- `Explain what changes once the repo has a Codex Sentinel checkpoint block in AGENTS.md.`

## Planning

- `Use $security-plan-gap to review this architecture for missing auth, secret-management, and audit requirements.`
- `Use $security-plan-gap on this Python service plan and tell me what security gaps should be added before coding starts.`

## Review

- `Use $security-review-gate to do a focused security review of the recent controller and auth changes.`
- `Use $security-review-gate on this finished Spring module and prioritize the findings by severity.`

## Test Planning

- `Use $security-test-rig to propose a lightweight security check plan for this ASP.NET Core repo.`
- `Use $security-test-rig to propose a lightweight security check plan for this Node/TypeScript API.`
- `Use $security-test-rig to suggest tools and commands for a Python API release check.`

## Prompting Tips

- mention the stack when you know it
- mention the stage: planning, finished code, release, or hardening
- mention the component or risk area if you want tighter output
- use a repo with `AGENTS.md` checkpoints when you want durable multi-stage behavior
- mention risky implementation areas such as auth, uploads, secrets, outbound requests, or deployment boundaries when you want a low-noise risky-change review pass
- say explicitly when read-only active analysis is allowed if you want the review grounded in git diff or code context
- keep risky implementation example prompts exact when they are meant to match validation scenarios
