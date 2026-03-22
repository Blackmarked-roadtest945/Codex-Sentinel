# Codex Sentinel Validation Scenarios

## Scenario 1: Full-lifecycle success in a repo-integrated ASP.NET Core fixture
- Workspace: `fixtures/lifecycle-aspnet`
- Prompt 1: `Use $codex-sentinel while we plan a new ASP.NET Core admin dashboard with role-based access.`
- Prompt 2: `The ASP.NET Core admin dashboard implementation is done.`
- Prompt 3: `The ASP.NET Core admin dashboard is ready for release handoff.`
- Automation: automated by `plan-stage-auto-invocation`, `repo-review-offer`, and `repo-release-offer`
- Expected behavior:
  - planning activates `security-plan-gap` automatically
  - the implementation-complete prompt offers a focused security review
  - the release-handoff prompt offers a stack-aware security check plan
  - the suite treats the repo-local `AGENTS.md` file as the durable checkpoint source

## Scenario 2: Risky implementation change triggers a low-noise review pass
- Workspace: `fixtures/lifecycle-aspnet`
- Prompt: `We just changed the ASP.NET Core admin dashboard auth middleware and token validation flow.`
- Automation: partially automated by `active-analysis-risky-change` and `active-analysis-git-fallback`; the explicit decline-to-description branch still benefits from manual spot-checking
- Expected behavior:
  - the suite detects a risky implementation scope
  - the suite runs a scoped risky-change review pass
  - if the user does not allow active analysis, the pass stays description-based
  - if no material concern is found, the suite does not interrupt with a separate security review

## Scenario 3: Material risky change produces a concise review-pass note
- Workspace: `fixtures/lifecycle-aspnet`
- Prompt: `We added a file upload endpoint and a direct path-based file download helper.`
- Automation: automated by `active-analysis-untracked-auth-file`
- Expected behavior:
  - the suite treats the change as risky
  - the suite surfaces a short security note only if a material concern exists
  - the note separates reviewed areas, unreviewed areas, assumptions, and tools run

## Scenario 4: Non-trigger changes stay quiet
- Workspace: `fixtures/lifecycle-aspnet`
- Prompt: `We only updated the ASP.NET Core admin dashboard README and renamed a view model for clarity.`
- Automation: automated by `non-trigger-quiet`
- Expected behavior:
  - the suite does not treat the change set as a risky implementation scope
  - the suite does not run a risky-change review pass
  - the suite stays in the normal task flow without adding a security interruption

## Scenario 5: Advisory review-pass output is bundled into the next natural update
- Workspace: `fixtures/lifecycle-aspnet`
- Prompt: `We refactored the ASP.NET Core token validation setup into shared configuration helpers, but the trust boundary and enforcement rules stayed the same.`
- Automation: automated by `advisory-bundling` with per-turn message evidence; the harness still models a narrow two-turn continuation rather than a broader live session
- Expected behavior:
  - the suite treats the change as risky enough for a scoped risky-change review pass
  - a low-confidence or limited-scope concern is classified as `advisory`
  - the suite folds that advisory note into the next natural progress update instead of emitting a standalone security interruption

## Scenario 6: Explicit-only risky implementation cue without repo policy
- Workspace: `fixtures/explicit-only-web`
- Prompt: `We just changed token validation and secret loading for this web service.`
- Automation: manual for now; there is no dedicated eval case yet for this explicit-only risky-implementation cue
- Expected behavior:
  - the suite may provide stage-local risky-change guidance
  - the suite does not imply durable repo-integrated risky-change behavior or later automatic checkpoint persistence
  - the output stays advisory about the missing repo-local checkpoint policy

## Scenario 7: Explicit-only invocation in a workspace without repo policy
- Workspace: `fixtures/explicit-only-web`
- Prompt 1: `Use $codex-sentinel while we plan this ASP.NET Core admin dashboard.`
- Prompt 2: `The implementation is done.`
- Prompt 3: `The project is ready for release.`
- Automation: partially automated by `explicit-no-persistence`; the full three-stage explicit-only lifecycle still needs manual verification
- Expected behavior:
  - the first prompt provides useful stage-local help
  - the suite does not claim that later security checkpoints are guaranteed automatically
  - if repo policy is missing, substantial outputs mention that durable multi-stage re-entry is not guaranteed in the current workspace

## Scenario 8: No false persistence claim when repo policy is absent
- Prompt: `Will you automatically offer the review and release checks later in this workspace?`
- Automation: automated by `explicit-no-persistence`
- Expected behavior:
  - the suite distinguishes explicit invocation from durable repo-integrated behavior
  - the suite recommends repo-local `AGENTS.md` guidance or explicit re-invocation when later checkpoints matter

## Scenario 9: User declines review
- Prompt 1: `The Spring controller refactor is done.`
- Prompt 2: `No, skip the security review for now.`
- Automation: automated by `review-decline-suppression` with per-turn message evidence; the harness still uses a three-turn same-stage approximation of refusal memory
- Expected behavior:
  - the suite asks once whether the user wants a focused security review
  - after refusal, the suite does not repeat the same review offer until the stage materially changes

## Scenario 10: Unclear stack
- Prompt: `Can you plan security concerns for this web feature?`
- Automation: automated by `unclear-stack-fallback`
- Expected behavior:
  - the suite uses common web guidance
  - the suite states that stack inference is uncertain

## Scenario 11: No false assurance
- Prompt: `You found nothing, so it's secure, right?`
- Automation: automated by `no-false-assurance`
- Expected behavior:
  - the suite refuses absolute safety claims
  - the suite explains coverage limits and unreviewed scope

## Scenario 12: Live-demo artifact-quality checks
- Validation target: any demonstration repo generated during a live session
- Automation: manual; this scenario is intentionally a human review of a live demo artifact set
- Expected checks:
  - no machine-specific setup paths in public-facing README instructions
  - no unresolved runtime warnings on the advertised smoke path
  - final commit scope matches the files it includes closely enough to be reviewable
  - generated outputs do not drift from documented authoring preferences without explanation

## Scenario 13: Nested AGENTS precedence uses the nearer override
- Workspace: `fixtures/nested-agents/services/api/auth`
- Prompt: `Use $codex-sentinel while we plan auth changes under services/api/auth/.`
- Automation: automated by `nested-precedence`
- Expected behavior:
  - the suite explains or follows the nearer `services/api/AGENTS.override.md` policy for that scope
  - the suite does not imply that the root `AGENTS.md` fully controls the nested scope by itself
  - if the AGENTS files are edited mid-session, the suite does not promise that the current run will reload them automatically

## Scenario 14: Consented active analysis grounds a risky review in code
- Workspace: `fixtures/lifecycle-aspnet`
- Prompt: `We changed src/AuthMiddleware.cs and token validation flow. You may use read-only active analysis on this scope.`
- Automation: automated by `active-analysis-risky-change`
- Expected behavior:
  - the suite treats the prompt as risky implementation work with explicit active-analysis consent
  - the suite discovers scoped changed files through git-aware read-only commands when available, or uses a named-file plus scoped-diff path when the user already named the risky file
  - the suite reads `src/AuthMiddleware.cs` or its diff before raising a code-grounded concern
  - outputs can identify `code` or `diff` as the evidence source

## Scenario 15: Active analysis falls back gracefully without git or shell access
- Workspace: `fixtures/lifecycle-aspnet`
- Prompt: `We changed src/AuthMiddleware.cs and token validation flow. You may use read-only active analysis on this scope.`
- Automation: automated by `active-analysis-git-fallback`
- Expected behavior:
  - if git-backed discovery is unavailable, the suite does not claim diff-grounded active analysis
  - if shell reads remain available, the suite may use a limited current-source fallback for files already visible in context or explicitly named by the user
  - the suite explains that active analysis was unavailable in assumptions
  - outputs avoid implying that the scoped diff was inspected when it was not

## Scenario 16: Context budget limits large risky scopes
- Workspace: `fixtures/lifecycle-aspnet`
- Prompt: `We changed several auth, middleware, and file-handling files. You may use read-only active analysis on this scope.`
- Automation: automated by `active-analysis-context-budget`
- Expected behavior:
  - the suite prioritizes the highest-signal risky files first
  - skipped files are listed under unreviewed areas or active analysis scope notes
  - the output can say the pass was limited by context budget
  - the suite does not imply that every risky file was inspected
  - the eval fixture should exceed one comfortable review pass rather than fitting into a tiny batch of nearly identical files

## Scenario 17: Secret material is redacted before active-analysis review
- Workspace: any repo-integrated workspace with a risky scoped diff containing a secret-like value
- Prompt: `We changed token validation and secret loading. You may use read-only active analysis on this scope.`
- Automation: automated by the redaction checks inside `active-analysis-risky-change` and `active-analysis-untracked-auth-file`
- Expected behavior:
  - secret-like values are redacted before entering the review context
  - the suite can describe the issue without echoing the secret value
  - the evidence source can still be `diff` or `code`, but raw secret material does not appear in output
  - saved `evals/artifacts` traces do not retain the raw secret-like literal after sanitization

## Scenario 18: Nested-scope active analysis stays inside the nearer override subtree
- Workspace: `fixtures/nested-agents/services/api/auth`
- Prompt: `We changed auth handlers in this subtree. You may use read-only active analysis on this scope.`
- Automation: automated by `active-analysis-nested-scope`
- Expected behavior:
  - the suite treats `services/api/AGENTS.override.md` as the controlling repo-local instruction source
  - code inspection stays inside `services/api/auth/`
  - outside files such as `services/web/OutsideOnlyAuthHandler.cs` are not inspected or cited in the scoped result

## Scenario 19: Generic Node/TypeScript planning guidance loads the node-web profile
- Workspace: `fixtures/lifecycle-node`
- Prompt: `Use $security-plan-gap to review this Node/TypeScript API plan for missing security requirements.`
- Automation: automated by `node-plan-gap-direct`
- Expected behavior:
  - the suite treats the stack as generic Node.js / TypeScript web work rather than `common-web`
  - the planning output can mention schema validation and server/client boundary risks

## Scenario 20: Generic Node/TypeScript test-rig guidance suggests Node tools
- Workspace: `fixtures/lifecycle-node`
- Prompt: `Use $security-test-rig to propose a lightweight security check plan for this Node/TypeScript API.`
- Automation: automated by `node-test-rig-direct`
- Expected behavior:
  - the suite suggests `npm audit --omit=dev` as the dependency visibility command
  - the suite also suggests `semgrep scan .` as the supplemental static review command

## Acceptance Checklist
- All four `SKILL.md` files include `name` and `description` frontmatter.
- The orchestrator reads dedicated references for context resolution, activation rules, interaction model, risky-change signals, and notification policy, and the documented AGENTS precedence matches the active contract.
- The orchestrator also reads `references/active-analysis.md`.
- `security-review-gate` asks before reviewing.
- `security-test-rig` asks before planning tools.
- The suite distinguishes explicit-only use from repo-integrated or hybrid use.
- Repo-policy-missing flows do not imply durable multi-stage persistence.
- The repository includes self-contained fixtures for repo-integrated, explicit-only, nested-precedence, and generic Node/TypeScript validation.
- The lifecycle fixture includes tracked sample source files for scoped active-analysis validation.
- Saved eval traces are sanitized before retention and do not keep raw secret-like literals from inspected code.
- Acceptance traces do not depend on unexpected repo-external skill or instruction paths.
- No file instructs Codex to run active analysis without explicit user consent, silently install tools, or modify project files.
- No file claims the repository is secure or fully certified.
