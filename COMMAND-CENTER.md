# AVEL — Data Contracts & Schema (v2)

*This document owns **shapes**: the contract layer structure and the entity definitions. It does not carry rationale — for why any of this changed, see `DECISIONS-V2.md`. For tools and versions, `TECH-STACK.md`. For build status, `STATE.md`.*

*Supersedes the v1 data model. Stale markers: 13 entities · tRPC · Capability as an entity · `bytea` snapshots · `skippable` gates.*

---

# Part 1 — The Contract Layer

## What the contract artifact is

Under ts-rest the contract is a first-class artifact: a shared object of routes, methods, paths, and Zod shapes, from which an OpenAPI document is generated.

| Job | Mechanism |
|---|---|
| Type safety, both sides | Backend implements it; frontend infers from it. A change breaks both at compile time. |
| Breaking-change detection | `oasdiff` compares the generated spec against the previous one in CI. Exit 1 on breaking. |
| Reproducibility | The contract's hash freezes into the export's version manifest alongside the rendered bytes. |

**Scope note:** this artifact governs **AVEL's own API**. The phase1↔phase2 conformance gate operates on a *different* artifact in the *client's* repository — see `CLIENT-CONTRACT-CONFORMANCE.md`. Do not conflate them.

## Structure

```
src/contract/
  index.ts            the assembled contract (this is THE artifact)
  mission.ts          route group per domain
  roster.ts
  export.ts
  agent-template.ts
  skill.ts
  playbook.ts
  preset.ts           RosterPreset — list · get · create · update · apply
  skill-source.ts
  repo-policy.ts
  connection.ts
  activity.ts
  shared/
    envelope.ts       success/error response envelope
    errors.ts         the error code union
    pagination.ts
    coherence.ts      computeCoherence — pure, imported by both sides
```

**`apply` materializes.** `preset.apply` copies the preset into RosterEntries (copy-then-edit); the preset holds no mission state. The procedure name should make it obvious that applying is a write, not a reference.

**Placement rule:** the contract lives where neither the backend nor the frontend can edit it unilaterally without the other noticing. `src/contract/` in the single-repo layout; `packages/contract` if it ever splits.

## Route shape

Every route declares method, path, request shape, and **responses per status code**.

```ts
// src/contract/export.ts
export const exportContract = c.router({
  create: {
    method: 'POST',
    path: '/exports',
    body: z.object({
      missionId: z.string().uuid(),
      idempotencyKey: z.string().uuid(),
      target: exportTargetKind,           // zip | github_pr | github_push
      repoUrl: z.string().url().optional(),
    }),
    responses: {
      201: exportSchema,
      409: errorEnvelope,                 // IDEMPOTENCY_REPLAY
      422: errorEnvelope,                 // PRECONDITION_FAILED
      502: errorEnvelope,                 // EXTERNAL_GITHUB
    },
  },
})
```

## The envelope

```
success:  { success: true,  data: T, meta?: {...} }
error:    { success: false, error: { code, message, details?, requestId } }
```

**The frontend switches on `error.code`. It never parses `message`.** The code union lives in `contract/shared/errors.ts`; both sides import it.

## Non-contract routes

Two deliberate exceptions, both returning bytes rather than JSON:

- **Zip download** — authenticated `GET`, streams the frozen package.
- **GitHub webhook** — receives, does not envelope.

---

# Part 2 — The Schema

## The eighteen core entities

**Client · Engagement · AgentTemplate · Skill · KnowledgeEntry · Finding · Intake · Mission · Playbook · RosterEntry · CompletionReport · RosterPreset · Export · RepoPolicy · Connection · ActivityLog · User · Proposal**

Plus **SkillSource** (supporting catalog). Deferred: PromptFragment (V1.5), Session (V2 stub).

Up from twelve. `Client` and `Engagement` close the agency layer, `Intake` holds Canon's proposal before an operator approves it into a Mission, `Finding` turns a confirmed defect from one mission into an executable check on every mission after it, `CompletionReport` makes cost and edge consumption required fields rather than habits, and `Proposal` is how anything proactive reaches the operator without acting on its own.

---

## Entity reference

### Client

```
id · name · status ('active' | 'closed')
primary_contact? · notes_md?
deleted_at · timestamps
```

`Mission.client` was a text field. At three clients that makes "everything for Meridian" ungreppable, and every query that should have been client-scoped was not. Retrofitting scoping through a codebase is where authorization bugs live.

### Engagement

```
id · client_id      FK → Client
name · scope_md?
status              'active' | 'closed'
started_at · closed_at?
deleted_at · timestamps
```

An engagement groups missions, connections, and knowledge for one body of work. **Closing an engagement revokes its Connections** — that is the lifecycle step `Connection.revoked_at` exists for.

### Intake

Canon's proposal. Never a Mission until an operator approves it.

```
id · engagement_id          FK → Engagement
status                      'draft' | 'proposed' | 'approved' | 'rejected'
source_md                   raw input: call notes, transcript, email thread
proposed_brief              structured — Canon's output
open_questions              text[] — ambiguities Canon surfaced
derived_cut                 'horizontal' | 'vertical'  — computed, not proposed
derived_cut_evidence        text — the directory structure that decided it
derived_conventions         ConventionSet — extracted from the repo, see below
derived_boundaries          Boundary[] — the feature/layer split found in the tree
suggested_preset_id?        FK → RosterPreset — follows from the cut
approved_by? · approved_at?
mission_id?                 FK → Mission, set on approval
deleted_at · timestamps
```

**`derived_cut`, `derived_conventions`, and `derived_boundaries` are all computed by reading the repository, not proposed by Canon.** One capability — read the client's tree — with three outputs. See the Canon decision in `DECISIONS-V2.md`.

```
read the client repository
    ├── cut            which boundary is a directory
    ├── conventions    the rules actually in force
    └── boundaries     the natural split, and how big each piece is
```

### ConventionSet

The conventions a codebase actually follows, as opposed to the ones its README claims. Extracted, never invented.

```
ConventionSet {
  layering?      { pattern, evidence }    e.g. controller→service→repository
  testing?       { runner, location, naming, evidence }
  naming?        { files, exports, evidence }
  imports?       { rules[], evidence }    e.g. modules import services, never repositories
  formatting?    { tool, config_path }
  enforcement    { eslint?, tsconfig?, precommit?, ci? }
  confidence     'high' | 'low'
  unextracted    text[]  — conventions the operator must supply by hand
}
```

**Every entry carries `evidence`** — the files or config that demonstrate the pattern. A convention asserted without evidence is a guess, and a guess in `conventions/` is worse than a gap, because agents follow it.

**`confidence: 'low'` blocks approval.** A repository with three competing patterns has no convention to extract, and inventing one is the failure this whole system exists to prevent.

**This closes a real gap.** `conventions/layering.md` is required by the golden fixture and no role owns writing it. CounselOS's were written by hand. At the third client that is the same provisioning problem Mission 002 found, one level up.

### Boundary

The natural split found in the tree. Makes the roster derived rather than asserted.

```
Boundary {
  kind          'feature' | 'layer'
  path          the directory that is the boundary
  files         count
  loc           approximate
  suggested_territory         the territory for this boundary — the agent is written Name · territory
  collides_with path[]        shared surface two boundaries both touch
}
```

**`collides_with` is the useful field.** A composition root, a shared package, or a barrel file that several boundaries write is exactly what needed the foundations role in Mission 002. Surfacing it at onboarding means the shared surface is provisioned before the first agent dispatches rather than after it blocks four times.

**This makes the roster size a finding rather than an opinion.** The current roster asserts a number of feature agents; nothing has ever checked whether it is right. Reading the tree turns "I picked seven" into "the codebase has six feature boundaries, here they are, and two of them share a file."

**Still operator-approved.** Derived boundaries are a proposal for the roster, not the roster. The operator can merge, split, or override — and an override, like a cut override, requires written rationale.

**Approval materializes a Mission.** Nothing Canon writes becomes executable until an operator says so. The Intake row is retained — it is the provenance for how the brief came to exist.

### AgentTemplate
An agent as data.

```
id · slug              path segment in the export, and the mount lookup key
name
kind                   'horizontal' | 'feature'
roles                  role[] — from the closed vocabulary in ROLES.md
engagement_id          FK -> Engagement, required when kind='feature'
team                   frontend | backend | qa | root
wave_defaults          wave[]
identity_md            ≤800 tokens, Zod refinement
depth_md               ≤800 tokens, Zod refinement
writable_paths         text[]   ← glob patterns this agent may modify
version · deleted_at · timestamps
```

`writable_paths` backs the file-ownership check at render time: a file modified by an agent outside its declared globs is a gate failure. This is the mechanical form of "testers never modify code under test."

**`roles` is a closed vocabulary** of the 35 roles in `ROLES.md`, a pgEnum because code branches on it. Only `model` roles may appear on an `AgentTemplate`; a `code` role is a pipeline function and has no template. The one `human` role, `foundations`, appears only on the operator's template.

**Measurements are keyed by name · territory · engagement, and what may be combined depends on the measurement.**

`AgentTemplate.name` is the identity — the instructions an agent runs on. `RosterEntry.territory` is the optional scope within one project. `engagement_id` is the project. Atlas · scheduling in two different clients' apps shares a template and nothing else.

| Kind | Combines across |
|---|---|
| Discipline — boundary violations, blockers filed versus absorbed, edge hash mismatches, test-file writes caught at the exit | Every territory and engagement under the same name |
| Outcome — tokens, cost, time, defects, first-pass gate rate | Only the same territory on the same template |

**Neither kind is ever combined across greenfield and brownfield work, or across internal and client missions.**

A query or report that returns a territory-scoped measurement without its territory and engagement is refused. See the naming section of `ROSTER-V2.md`.

### Skill

```
id · slug · name
description            one or two sentences, always visible to the agent
content_md             the full skill, loaded only when the task needs it
avel_enhancement_md?   AVEL's additions to an imported skill, kept separate
layer                  'role' | 'stack' | 'domain'
type                   'knowledge' | 'capability'
grants?                tool[] — capability only; what the runner provides in the room
io_shape?              { reads: 'large' | 'small', returns: 'large' | 'small' } — capability only
recommended_for        role[] — from the closed vocabulary in ROLES.md
source_id              FK → SkillSource
content_sha256         hash of description, content, and grants
status                 'draft' | 'approved' | 'retired'
reviewed_by? · reviewed_at?
version · deleted_at · timestamps
```

**Layers decide where a skill is delivered.** `role` skills are part of the identity file and hashed into `agent_version_sha256`. `stack` and `domain` skills are given at dispatch and hashed into `CompletionReport.skills_sha256`. See `SKILLS.md`.

**`type='capability'` is enforced by the room.** The runner provides the tools in `grants` and nothing else. A code check rejects a capability attached to any role whose room cannot hold it — a judge cannot be granted write access to source, and only the delivery room can hold the credential.

*Correction:* this previously said a capability "declares a tool grant; it does not enforce one," because no runtime could restrict a tool. The sandbox rooms are that runtime.

**`io_shape` is the declaration the routing rule depends on.** A capability that reads large and returns small is tool-heavy and routed accordingly. `DECISIONS-V2.md` and `SANDBOX.md` both refer to a skill's declared inputs and outputs; until this field existed, they referred to nothing.

**Only `approved` skills can be attached.** Imported skills start as `draft`, are reviewed, and are pinned by `content_sha256`.

Render paths are unchanged:
`knowledge` → `.avel/skills/[agent]/[slug].md` · `capability` → `.avel/capabilities/[agent]/[slug].md`

Join tables: **`role_skills`** (role → skill, `role` layer only) and **`mission_skills`** (mission → skill, `stack` and `domain` layers only). They replace `agent_template_skills` and `roster_entry_skills`, which attached skills to agents and left them behind whenever roles moved between agents. At dispatch, an agent receives the mission's skills whose `recommended_for` includes one of its roles.

### SkillSource
Open catalog, not an enum. `Skill.source_id` is an FK. Ships empty; populated in-app.

*(The test: does code branch on the value? If yes it's an enum. If it's a label that grows, it's a catalog.)*

### Proposal

Anything proactive — from code or from a model — reaches the operator as a proposal and does nothing on its own. See `COMMAND-CENTER.md`, module 14.

```
id
kind                   'next_module' | 'calibration' | 'post_delivery' | 'intake_questions'
source                 'code' | 'model'
engagement_id? · mission_id?
summary                one line the operator reads in the queue
payload                jsonb — exactly what approving it would do
premise                jsonb — the facts it was based on, e.g. the gate result it followed
status                 'pending' | 'approved' | 'dismissed' | 'expired'
reason?                the operator's note on dismissing
decided_by? · decided_at?
created_at
```

**Approving a proposal starts its action through the normal path.** A `next_module` proposal still creates a dispatch that needs its estimate, its room, and its ceilings. Approval skips nothing.

**A proposal expires when its premise stops being true.** If the gate result a next-module proposal followed is reversed, the proposal becomes `expired` and cannot be approved. Stale proposals are the queue's version of a stale preview.

### KnowledgeEntry

```
id · type              pattern | decision | registry | component | reference | anti-pattern
agent_id               nullable — null = agent-agnostic
client_id              nullable — null = genuinely general, never client-specific
supersedes             self-reference
content_md
version · deleted_at · timestamps
```

**`client_id` is the one-way door.** A pattern learned on one client's codebase must not be retrievable by an agent working another client's mission. Today the vault is empty so it is harmless; once it is not, it is contractual. Nothing auto-promotes from client-scoped to general — promotion is explicit and requires the entry be rewritten to strip anything client-specific.

**No write path in V1.** The entity exists so the shape is right. Deferred past ~10 real missions; when built, provenance, candidate/promoted status, and forgetting come first, retrieval second, auto-promote never.

### Mission

```
id · engagement_id     FK → Engagement
origin                 'internal' | 'client'
type
brief                  structured
sprint_n · status
cut                    'horizontal' | 'vertical'
cut_source             'derived' | 'overridden'
cut_rationale          text — required when overridden, renders into delivery
repo_url               a DEFAULT, not the binding destination
spend_ceiling_usd?     ← nullable today; enforcement unbuilt
deleted_at · timestamps
```

`spend_ceiling_usd` is modeled now so cost governance is a gate check rather than a migration later. Currently unread by any code.

**`origin` separates benchmark from production.** Template builds run by AVEL's own roster are `internal`: the operator wrote the spec and nothing drifts, so they will look better than client work. **Never aggregate internal and client missions.** Internal answers whether a change helped; client answers what delivery costs.

**`cut` is derived, not chosen.** At mission setup the system reads the connected repository's directory structure and determines which boundary is a directory: layer or feature. That is the cut. `cut_source` defaults to `derived`.

An operator may override, and an override requires `cut_rationale` in writing, which renders into the delivery. This is the `gate_override` pattern applied one layer up, and it exists for a specific reason: the original roster defect came from applying the decomposition rule to a roster that had already been decided on. A free-choice field permits exactly that failure. A derived field with a written-rationale override does not.

**Open:** the cut is a property of a mount root rather than of a repository. A monorepo can be layer-organized on the backend and feature-organized on the frontend. A scalar bakes in a uniformity assumption. See ROSTER-V2.md.

### Playbook

```
id · mission_type (unique) · name
waves_applicable       wave[]
gates                  { gate, policy: 'mandatory' | 'warn' }[]
deliverable            'pr' | 'report' | 'recommendation'
required_fields        text[]
default_preset_id      FK → RosterPreset
version · deleted_at · timestamps
```

Gate vocabulary is closed: `phase1-close · alignment · qa · security · rollback · acceptance`.

**References a preset; never lists agents.** Squad composition is RosterPreset's; the Playbook owns process.

### RosterEntry
One agent customized for one mission.

```
id · mission_id · agent_template_id
active · waves
monitor_priority       wezterm
customized_md?
writable_paths?        overrides the template's, per mission
territory?             the part of this project the agent is scoped to — written Name · territory
estimated_tokens       integer, REQUIRED before dispatch
token_soft_ceiling     integer — warn and log, do not stop; default 1.5× estimate
token_hard_ceiling     integer — halt the dispatch; default 3× estimate
grain                  'merged' | 'default' | 'split'
absorbed_boundaries    text[] — when grain is 'merged', the boundaries it owns
timestamps
```

Whether an agent is on a mission = whether its RosterEntry exists and is active. Skills are a relation.

### CompletionReport
What an agent produced, and the evidence it consumed. Required to close a dispatch.

```
id · roster_entry_id     FK -> RosterEntry
mission_id
status                   'complete' | 'blocked' | 'failed' | 'halted'
halt_reason?             'token_hard_ceiling' | 'spend_ceiling' | 'wall_clock' — when halted
soft_ceiling_crossed     boolean — the dispatch passed its soft ceiling
actual_tokens            integer, REQUIRED to close
agent_version_sha256     SHA-256 of identity.md + depth.md at dispatch
skills_sha256            SHA-256 over the sorted stack and domain skills given at dispatch
version_source           'recorded' | 'reconstructed'
model                    the model that actually ran
artifacts_read           [{ path, sha256 }]  — every declared edge input
artifacts_written        [{ path, sha256 }]
files_touched            integer
file_types_touched       text[]              — calibration signal
rereads                  integer             — calibration signal
blockers                 [{ description, workaround, provisioning_gap: boolean }]
timestamps
```

**Two fields are required, not optional, and that is the point.** `RosterEntry.estimated_tokens` cannot be null at dispatch. `CompletionReport.actual_tokens` cannot be null at close. Cost logging has been a stated rule since the first mission and has produced zero rows across three, because a rule you have to remember keeps failing. A dispatch that cannot be created without an estimate, and a mission that cannot close without an actual, turns the cost log from a habit into a query.

**`artifacts_read` enforces the edge graph.** Every consumer records the hash of what it read. The ownership check compares each hash against the producer's `artifacts_written`. A mismatch means the consumer worked from a different version of the interface than the producer wrote — the inter-agent-misunderstanding failure, caught mechanically.

**`file_types_touched` and `rereads` calibrate grain.** The merge and split thresholds in `ROSTER-V2.md` are guesses. These two fields are how they stop being guesses.

**The token ceilings are enforced by the runner, never by the agent.** Closes F10. Before this, the estimate was required at dispatch and the actual at close, and nothing stopped a looping agent in between — cost was learned only after it was spent. The runner tracks cumulative tokens during the dispatch, warns at the soft ceiling, and halts at the hard ceiling, recording `status: 'halted'` with the reason. It also halts when the mission's attributed spend reaches `Mission.spend_ceiling_usd`, which until now was read by nothing.

**An agent never polices its own budget.** An agent asked to stop itself near a limit is an agent judging its own performance — the self-grading problem again. The ceiling lives in the runner, outside the agent's reach.

**Two levels, not one number.** A single multiple is a guess that will be wrong in both directions before there is data.

| Level | Default | Does |
|---|---|---|
| Soft | 1.5× estimate | Warns and records `soft_ceiling_crossed`. The work continues. |
| Hard | 3× estimate | Halts the dispatch. |
| Backstop | `Mission.spend_ceiling_usd` | Halts the whole mission. |

**The hard ceiling can afford to be loose because runaway loops are not subtle.** A loop does not overshoot its estimate by twenty percent; it overshoots by an order of magnitude. Three times the estimate catches every real runaway while leaving room for a task that simply ran long. The soft ceiling meanwhile produces calibration data from every run without stopping anything.

Both defaults are `[hypothesis]`. After roughly ten recorded runs, set the hard ceiling from the observed ratio of `actual_tokens` to `estimated_tokens`. Start global, and move to per-role multiples once there is enough data — a design-system dispatch and a domain dispatch will not vary alike.

**`version_source` separates measured from reconstructed.** Closes F13 as far as it can be closed. Mission 002 ran before version hashing existed, but it ran at a known commit, `31f4b44`, and the identity files at that commit are recoverable from git history. Hashing them backfills the version.

It is marked `reconstructed` rather than `recorded`, because it assumes the agent loaded the committed files and not a local edit. That assumption is probably true and cannot be verified. Every run from here forward is `recorded`.

**The version matters for attribution, not for findings.** Those are different questions, and conflating them would throw away real evidence.

A defect a mission caught is real regardless of which agent version caught it. Using that mission as a baseline to judge whether a later agent change helped is only valid when the version is known. So every run falls into one of three tiers, each used only for what it can support:

| Tier | Valid for | Not valid for |
|---|---|---|
| `recorded` · `client` | Everything, including what delivery actually costs | — |
| `recorded` · `internal` | Benchmarks, agent comparisons, calibration | Quoting delivery cost to a client |
| `reconstructed` | Qualitative findings — defects caught, blockers filed, boundary adherence | Any quantitative comparison, cost trend, or agent A/B test |

**Mission 002 is `reconstructed`.** Its findings stand: the authorization defect, the error-wrapping defect, zero boundary violations across 61 files, three blockers filed and none absorbed. It is excluded from every comparison — twice over, since it also recorded no cost. Nothing is discarded, and nothing contaminates a comparison it is unfit for.

**`agent_version_sha256` and `model` make improvements attributable.** When an agent's identity file changes between runs, the result is tied to exact agent content. Without these, a better run after an edit could be the edit, an easier task, or variance, and there is no way to tell. See `TEMPLATES.md` for the evaluation loop they enable.

### RosterPreset
A saved squad. Applying it **materializes** RosterEntries (copy-then-edit); the preset holds no mission state.

### Export

```
id · mission_id · sprint_n
idempotency_key (unique)
target_kind            'zip' | 'github_pr' | 'github_push'
connection_id          FK → Connection    what authorizes this
status                 pending → rendering → verifying → pr-open → done | failed
pr_status?
verification           see below
gate_override          { gate, justification, overridden_by, overridden_at } | null
replay_of              FK → Export, nullable — this export re-ran a past
                       mission's frozen inputs against a different model
snapshot_key           R2 object key
snapshot_sha256        content hash — the integrity check
snapshot_bytes         size
version_manifest       structured, IN POSTGRES — queryable, never inside the blob
contract_sha256        AVEL's frozen contract artifact hash
timestamps
```

Immutable after freeze; only `status` and `pr_status` advance.

**Four gate stages, in order:** verify → conform → blast radius → deliver. There is deliberately no AI review stage — no inference in the gate, permanently. See `DECISIONS-V2.md`.

**Every stage is headless.** The machine interface is primary; any human-facing view consumes it. A gate that needs a TUI cannot run in CI, which is the case that matters.

**`verification`:**

```
verification {
  build       { status: 'pass' | 'fail', ... }
  tests       { status, total, failed, ... }
  analysis    { status, findings, ... }
  coverage    { lines_pct, delta_pct }
  mutation    { score_pct, killed, survived, scope: 'changed' | 'full' }
  ownership   { status, violations: [{ agent, path }] }
  permissions { status, cells_total, cells_undefined,
                gaps: [{ role, resource, state, expected, actual }] }
  absence     { status, obligations_total, unmet:
                [{ rule, subject, detail }] }
  findings    { status, checked, matched:
                [{ finding_id, mission_id, rule, subject }] }
  conformance { status, breaking: [...] }        ← see CLIENT-CONTRACT-CONFORMANCE.md
  verified_at
  runner      which capability-type Skill produced this
  runner_chain [{ slug, attempted_at, ok }]   ordered fallbacks — a failed
                                              runner degrades to the next
                                              rather than failing the export
} | null
```

Gate passes only when: build pass · zero test failures · analysis pass · coverage delta ≥ 0 · mutation score ≥ the global floor · zero ownership violations · zero breaking conformance diffs · zero undefined permission cells · zero unmet obligations · zero matched prior findings.

**`permissions`** is the full role × resource × state matrix generated from the schema. A cell that is neither explicitly allowed nor explicitly denied is a gap, not a pass. Mission 002's authorization defect was this shape.

**`absence`** checks what the contract implies but the code lacks. Every other field in this object inspects what is present; this is the only one that inspects what is missing, which is the shape of the failure class this product exists to catch.

**`findings`** checks the work against previously confirmed defects. Deterministic list matching — no retrieval, no inference, nothing auto-promoted.

**The mutation floor is not stored on Export.** It is global, versioned, and lives in config under source control — changing it is a reviewed commit, not a per-mission field. `verification.mutation` records the *measurement*; policy lives elsewhere. `version_manifest` carries the config hash, so "what bar did this ship against" stays answerable exactly, later — same move as `contract_sha256`.

**`scope`** distinguishes an incremental run (changed files, normal export, minutes) from a full-project run (sprint ship, hours, its own job).

> **⚠ `conformance` is a placeholder.** Its inner shape depends on the client-side artifact format, which is unspecified.

### RepoPolicy

```
id · repo_url (unique, normalized) · label?
allow_direct_push_to_default   boolean, default FALSE
default_target?                'zip' | 'github_pr' | 'github_push'
deleted_at · timestamps
```

A repo with no policy row is treated as `false`. The safe behavior needs no setup; only the permissive behavior is opt-in.

### Connection

```
id · service ('github')
label                  e.g. "Meridian engagement"
scope_type             'owner' | 'repo'
scope_value            e.g. "meridian-co" or "meridian-co/app"
credential_ref         env var name or secret ref — NEVER the token
status                 'active' | 'expired' | 'revoked'
expires_at? · last_rotated_at? · revoked_at?
deleted_at · timestamps
```

- **The token is never stored in the database.** `credential_ref` names where it lives; the gateway resolves it.
- An export resolves **both** a Connection (*what authorizes this?*) and a RepoPolicy (*what am I allowed to do?*).
- **Revocation is a step in engagement close** — set `revoked_at`; the gateway refuses.

V1 reads a single token from env. The model supports many, so the second client is a row, not a migration.

### ActivityLog
Append-only. `action` and `entity_type` are **closed vocabularies**. Adding a mutation adds its action to the enum in the same change. The action prefix is a *domain*, not the entity_type (`roster.preset_applied` logs against entity_type `roster_entry`). The write happens **inside the same transaction** as the mutation.

### User
`role` reserved; middleware does not read it.

---

## Coherence

```
computeCoherence(mission, playbook) → {
  block?: { code: 'no_agents_in_first_wave', reason, wave },
  warnings: CoherenceWarning[]
}
```

**This function lives in `src/contract/`, not in the service layer.** It is pure — no database, no network, no clock — so both sides import the same implementation. The frontend calls it for live feedback on the loadout screen; the export gate calls it for permission. Shared code, single authority: a client that lies about coherence still cannot ship.

**Cut coherence is path arithmetic, not an assertion.** "Is a foundations role assigned" passes if foundations is assigned to a feature agent, which is the failure mode it was meant to catch. The checkable form:

> Under the vertical cut: a foundations role and a verification role are both assigned, and each one's writable set is disjoint from every feature agent's writable set.

Computable from the mount table. This enforces the rule that owning territory disqualifies you from judging a seam, mechanically rather than by good intentions.

**The hard block:** the mission must contain at least one active agent in the **earliest wave its playbook declares**. For `full-build` that resolves to phase1; for `discovery` it resolves to whatever that playbook starts with.

Warnings are playbook-relative — read the playbook's `gates`, so absences a playbook doesn't declare aren't flagged.

---

## Cross-cutting invariants

- **Soft delete** on anything an Export can reach. `deleted_at` + an explicit `live()` filter in every list query — Drizzle has no middleware, so it is never implicit.
- **Versioning is counter-only.** No version-history table, deliberately.
- **Determinism in the render.** No clock, no randomness, no unstable ordering in rendered bytes.
- **Zod defines shape once.** Tables derive via `drizzle-zod`; the contract imports the same schemas. One definition, three consumers.
- **Enums are pgEnums when code branches on them**; catalogs are tables when they're labels that grow.

---

## Migration order

1. `SkillSource` → `Skill` → `AgentTemplate` → `role_skills`
2. `Client` → `Engagement` → `Intake` → `Mission` → `Playbook` → `RosterPreset` → `RosterEntry` → `mission_skills` → `CompletionReport`
3. `Connection` → `RepoPolicy` → `Export`
4. `Finding` → `KnowledgeEntry` → `ActivityLog` → `User` → `Proposal`

*Correction:* this list predated `Client`, `Engagement`, `Intake`, `Finding`, and `CompletionReport`, and named join tables that no longer exist. Existing entities keep their relative order; new ones are placed after everything they reference. Re-derive the order from the foreign keys when module 0 is built rather than trusting this list.
5. Enable **pgvector** — one line, unused, so V2 retrieval needs no migration later

Forward-only. One migration per change. Never edit an applied one.
