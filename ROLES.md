# AVEL Command Center — State

*The single source of truth for build status, counts, and gaps. **No other document may state build status, entity counts, or agent counts.** They link here.*

**Last updated:** 2026-10-03

---

## One-line status

**Rebuilding from an empty repository** against `COMMAND-CENTER.md`. The previous build, at `github.com/Javaris500/avelcc`, is a reference to read, never a source to copy; its lessons live in the docs. **Zero missions have run end to end through the platform.**

---

## Counts

| Thing | Count |
|---|---|
| Command Center modules (`COMMAND-CENTER.md`) | **15**, numbered 0–14 |
| Core entities | **18** + SkillSource (supporting catalog) |
| Roles (`ROLES.md`) | **35** — 23 model · 11 code · 1 human |
| Model agents — target, horizontal cut (`ROSTER-V2.md`) | **13** in every mission (A 3 · B 5 · C 3 · D 2), plus up to 2: concurrency when required, incident on demand |
| Model agents — `template-booking` (`TEMPLATE-BOOKING.md`) | **10**, plus the operator |
| Orchestrator | **1** — Axis, the human |
| Agent identity files | **0** — to be generated from `ROLES.md`, not hand-written. The 19 hand-written v1 files are superseded. |

Honest external framing: *a role catalog of 35 jobs, assigned to a small set of named model agents per project, plus one human operator and a set of code functions.* Never "25 AI agents," and never "18 build agents" — both describe rosters that no longer exist. <!--allow-stale-->

---

## Module status

| # | Module | State |
|---|---|---|
| 0 | Foundation | ⬜ |
| 1 | Intake | ⬜ |
| 2 | Repo read | ⬜ |
| 3 | Mission planner | ⬜ |
| 4 | Roles and roster | ⬜ |
| 5 | Identity generator | ⬜ |
| 6 | Dispatch and runner | ⬜ |
| 7 | Sandbox rooms | ⬜ |
| 8 | Completion records | ⬜ |
| 9 | The gate | ⬜ |
| 10 | Render | ⬜ |
| 11 | Delivery | ⬜ |
| 12 | Knowledge and metrics | ⬜ |
| 13 | Surfaces | ⬜ |
| 14 | Proposals | ⬜ |

**The previous build is evidence, not code.** It produced the export engine design, the four day-one defects that passed a build, and Mission 002's findings — all recorded in the docs. None of its code is assumed to exist in the rebuild.

---

## Gaps

### Blocking

- **Nothing is built.** The rebuild starts at module 0.
- **Does Capability earn its own entity?** The schema cannot be created until this is decided. See `SKILLS.md`, open questions.
- **Client-side contract conformance is unspecified.** See `CLIENT-CONTRACT-CONFORMANCE.md` — the artifact a client repository must carry has no defined format, and the top-priority gate cannot be built until it does.

### Carried from the previous build

A scan of the previous repository found six problems. Each now has a rule that prevents it in the rebuild.

| Found | Prevented by |
|---|---|
| The README said "no backend, no database and no export engine" over code containing all three | `CLAUDE.md`: a README never states build status |
| No CI and no `test` script, so 469 passing tests ran only when someone remembered | Module 0: CI and `pnpm test` from the first commit |
| Three database tests crashed when no database was present, instead of skipping | `EXPORT-ENGINE.md` §13: tests connect lazily, and CI provides a database |
| The ship decision was never built — the gate module was display components only | Module 9 is a function, `decide(findings)`, before any gate screen |
| The schema reflected the pre-roles design: teams instead of roles, skills joined to agents, no proposals | Module 0 builds from `DATA-CONTRACTS-V2.md` — 18 entities |
| The repository carried its own copy of the docs, which drifted from the doc set | One copy only — the docs live in `avel-server/docs`, and nowhere else |

A seventh surfaced in this doc set while fixing the others: the doc check's capability rule still enforced a decision that had been reversed. It is rewritten, and `CLAUDE.md` rule 6 now requires every check to be proven by failing.

### Agent system flaws

Fourteen known flaws in the agent design, all addressed in the specification and **none closed**, because no mission has yet run under the new specification. Full ledger in `ROSTER-V2.md`, section *Known flaws*. A flaw closes only when a mission runs without reproducing it.

### Content-blocked, not code-blocked

- No skill library exists. The design is settled in `SKILLS.md`; the first role skills for `template-booking`'s roles come before module 5 generates identity files.

### Unowned

- **No sandbox exists.** Agents run with full user privileges on a machine holding the GitHub credential, with every client's code on one filesystem. `SANDBOX.md` Tier 0 fixes this at zero cost.
- **`cc-palette.html`** — a design system (tokens, contrast ratios, chamfer geometry) exists as a standalone HTML file referenced by no document. It needs an owner doc or an explicit note that it is a scratch artifact.
- **`MOBILE-PWA.md` does not exist** but is referenced by the frontend handoff prompt as required reading. The mobile boundary and the iOS push-permission ordering are undocumented. **A frontend session cannot start on mobile work until this is written.**

### Minor

- `npm run start` points at `.output/server/index.mjs`; the build emits `dist/`.

---

## The parallel-session problem

The canonical data model is maintained outside this repo and advances in parallel sessions. It has drifted ahead of the repo doc set three times; each reconciliation surfaced real conflicts.

**Re-pull canonical before any schema work.** This is the most common source of wasted effort on this project.

`scripts/check-docs.sh` now catches the mechanical half of this automatically. It does not catch semantic drift.

---

## What has to happen next

**One mission, end to end, measured.** Not the frontend, not more architecture. Every decision in `DECISIONS-V2.md` is a hypothesis until a real client project passes through the whole pipeline — manually in places if necessary — and produces a number.
