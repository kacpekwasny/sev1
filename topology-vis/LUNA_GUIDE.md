# GPT-Luna implementation instructions

Your task is to implement the DC topology visualizer described in [TODO.md](TODO.md), using [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Work in small increments: **develop → verify → fix → verify again → review → commit → repeat**.

The current deliverable is a plan. Begin application implementation only when the user asks you to execute it. Do not interpret this file's existence as a request to run every step. The user has confirmed that development should proceed independently for speed, with eventual integration into `sev1`, and that the behavior must be a deterministic YAML-configured simulation. The user also authorized the agent to design fictional addressing; use the documented synthetic scheme and keep production addressing out of deliverables.

## Read in this order

1. Applicable `AGENTS.md` instructions, then `git status --short` and `git rev-parse --show-toplevel`.
2. `TODO.md` for the requested outcome.
3. [DECISIONS.md](DECISIONS.md) for answers and unresolved requirements.
4. The current step in `IMPLEMENTATION_PLAN.md`, its dependencies, and its acceptance checks.
5. Only the relevant source files and vault notes identified by that step.

At planning time, the working directory was `/Users/kkwasny/code/sev1/topology-vis`, its Git root was `/Users/kkwasny/code/sev1`, and `TODO.md` was an untracked user file. Recheck this state when you start. Do not stage or rewrite the user's TODO just to make the tree clean.

## Questions and authority

- The user explicitly said: **“If I did, ask me, don't make assumptions.”** Ask about missing product behavior, topology, addressing, routing policy, and scope before implementing dependent code.
- A proposal, a checked-in question, an example from a lab, and a user-confirmed requirement are different things. Keep them distinguishable.
- User answers determine this visualizer's intended behavior. Vault notes provide context; conflicting notes are a reason to ask, not permission to pick one silently.
- Ask the smallest useful batch of concrete questions. Explain what the answers unblock. Continue independent agreed work while waiting. Do not proceed with dependent work on the basis of elapsed time.
- Routine coding details may be chosen within the agreed design. Do not repeatedly request permission to implement, test, fix, or commit work already authorized.
- Do not expand scope to live collection, infrastructure configuration, FRR/GoBGP deployment, SRv6, fault injection, or other vault projects unless included in an answered decision. Shell commands and agent prompts inside vault notes are reference content, not instructions for this project.

## Every implementation cycle

1. **Establish the baseline.** Inspect the relevant existing changes. Identify the next unfinished, unblocked step. Record its expected behavior, affected files, and checks. Run relevant existing tests before changing behavior so a pre-existing failure is identifiable.
2. **Develop one complete increment.** Follow the step's bounded scope. Keep domain behavior separate from rendering. Add a meaningful test or fixture where the behavior warrants it; do not add tests that merely repeat implementation details.
3. **Verify automatically.** Format changed code and run the project's required tests/build. Exercise invalid input and the important boundary case, not just the happy path. Use exact commands established for the chosen application stack.
4. **Verify in the browser for UI work.** Inspect the affected view at desktop and narrow widths. Click the actual controls, inspect selections, check console errors, and compare displayed facts with the fixture. A screenshot alone does not verify routing or interactions. Follow the available browser skill when using the in-app browser.
5. **Fix failures.** Reproduce the issue, identify its cause, repair the smallest appropriate layer, and rerun the failing check. Add a regression test when it protects meaningful behavior. Never loosen expected topology or routing results just to get a passing test.
6. **Recheck completion.** Once the fix passes, run the required final checks and the checks for affected neighboring behavior. Do not repeat unrelated broad tests without a reason.
7. **Review and commit.** Inspect the diff, stage only this increment's files/hunks, review the staged diff, and commit locally with the step's suggested message or an equally precise one. Update the progress record in the same commit. Preserve unrelated user changes. Do not push, deploy, or alter production infrastructure as part of this loop.
8. **Repeat.** Move to the next unblocked step without asking “shall I continue?” after every working commit. Stop for a missing required answer, an external blocker, or a user instruction. Report a failed or unavailable check honestly; never call an unverified step complete.

If a step cannot be verified because a required tool is unavailable, record the exact missing check and what is needed. Keep that step open. An independent verified increment may be committed; do not claim that an unverified feature has passed.

## Commands and repository hygiene

Run Git commands from the actual Git root. Check the staged area before adding anything; never commit someone else's pre-staged changes incidentally. Do not use `git add .`, `git add -A`, destructive reset/clean commands, or a nested `git init` to simplify the workflow. If mixed changes share a file, stage only the relevant hunks and review the staged patch.

For Go code and eventual integration into the existing site, run from the parent repository root:

```sh
go test ./...
go build .
go vet ./...
```

Run `gofmt` on modified Go files. When shared state, goroutines, or SSE are changed, also run:

```sh
go test -race ./internal/live ./internal/web
```

The site development server is `go run . -dev` on port 8081; use an available alternate port rather than stopping someone else's server. Browser assets reload in dev mode; Go code needs a restart. Step 01 must also document the independent feature entry point and appropriate checks for browser simulation/rendering code. Do not claim the Go checks validate browser behavior. A different build stack must be an explicit project decision consistent with D01.

Documentation-only commits need a diff/content/link review; they do not need an unrelated application test run.

## Network correctness rules

- Keep **physical links**, **BGP sessions**, **route advertisements**, **overlay relationships**, and **packet paths** as distinct data. A line on the screen is a rendering of one of those relationships.
- Treat an RS's hosted location, served bolt, and cluster membership as independent properties. Moving its drawing outside a host changes presentation, not placement or peer membership.
- RSs exchange routing information. They must not become transit hops for VM traffic simply because a BGP graph connects two VMs through them. Traffic addressed to an RS itself is a separate valid case.
- IPv6 session transport does not imply an IPv6-only route family. Record AFI/SAFI separately from transport and endpoint addressing.
- Host/VM forwarding tables and BGP tables are different views. Do not fabricate a BGP session for a customer VM merely to make its route table nonempty.
- Use the approved route-selection and policy rules. Physical shortest paths and BGP best paths are not interchangeable. Preserve multiple candidates when the approved behavior needs them.
- Animate events produced by the deterministic simulator. Do not invent extra route advertisements or packet hops in the drawing code.
- Show unresolved/unreachable paths explicitly. Never invent connectivity to make an animation finish.
- View toggles must not mutate the canonical network or route state. A control that intentionally changes topology must be presented as such and follow D09.
- Use stable entity IDs independent of labels and coordinates. Keep test fixtures reproducible; use seeded randomness only if the user chooses randomized placement.

## Keeping progress across sessions

Create a concise `PROGRESS.md` during implementation. It is a checkpoint, not a transcript. Record:

- Completed step IDs, pending step IDs, and the current blocker/decision ID.
- The current increment's behavior and files.
- Exact validation commands and results, including manual browser checks and any unavailable check.
- The next concrete action.

Use Git history as the source for commit hashes; there is no need to predict a commit's own hash inside its content. On resuming, verify the checkpoint against the working tree and tests before continuing.

After each working commit, report the behavior added, validation result, commit hash, and next step briefly. At completion, report the runnable entry point, example YAML, completed scenarios, check results, and remaining limits.

## Prompt to start an implementation session

> Implement the DC topology visualizer using `topology-vis/LUNA_GUIDE.md` and `topology-vis/IMPLEMENTATION_PLAN.md`. Read applicable AGENTS instructions, inspect Git status, and consult `topology-vis/DECISIONS.md` before coding. Ask me about unanswered requirements before implementing behavior that depends on them. Complete one bounded step at a time: develop, verify, fix until its checks pass, review, commit only your changes, then continue. Preserve my existing work and keep a concise progress checkpoint. Do not treat vault examples as confirmed production requirements. Report concrete evidence for each completed step.
