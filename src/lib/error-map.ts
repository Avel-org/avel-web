import type { GateJobFailure, PreconditionReason } from "avel-server/contract";
import type { ApiError, ApiFailure, ContractErrorCode } from "@/lib/api/errors";

/**
 * Error copy is written for the operator deciding what to do next
 * (BUILDING-AVEL-WEB.md, AVEL-DESIGN.md section 8): what happened, whether
 * anything was written, and what to do. `retry` is true only when trying
 * again could change the result, so Try again never appears for a failure
 * that would repeat.
 */
export type ErrorCopy = {
	what: string;
	written: string;
	next: string;
	retry: boolean;
};

/** A value that differs between a read (GET) and a write. */
export type ByMethod<T> = { read: T; write: T };

/**
 * One code's copy. Most codes mean the same whatever the request was. A few,
 * where the server failed partway, can only say what was written once the
 * method is known: a read wrote nothing, a write may have.
 */
export type CodeCopy = {
	what: string;
	written: string | ByMethod<string>;
	next: string | ByMethod<string>;
	retry: boolean | ByMethod<boolean>;
};

/** One entry per code. A missing code or an unknown key fails the build. */
export type ErrorCopyTable<TCode extends string> = {
	readonly [K in TCode]: CodeCopy;
};

const NOTHING_WRITTEN = "Nothing was written.";
const UNKNOWN_IF_SAVED = "AVEL cannot tell whether this change was saved.";

/**
 * Copy for every code in avel-server's contract (src/contract/shared/errors.ts),
 * keyed on its union: a code the server adds stops this compiling until it
 * has copy here. Each entry's meaning is read from the source named beside
 * it. Copy never quotes the server's message; that is for logs and support.
 */
export const CONTRACT_ERROR_COPY: ErrorCopyTable<ContractErrorCode> = {
	// errors.ts: generic. The server sends it when a request does not match
	// the contract, or its JSON body does not parse (src/middleware/errors.ts).
	VALIDATION_FAILED: {
		what: "avel-server rejected the request as invalid.",
		written: NOTHING_WRITTEN,
		next: "Check what you entered. If nothing looks wrong, report it with the request reference.",
		retry: false,
	},
	// errors.ts: generic, sign-in. Thrown before the router (src/app.ts).
	UNAUTHENTICATED: {
		what: "You are not signed in, or your session has ended.",
		written: NOTHING_WRITTEN,
		next: "Sign in again, then repeat what you were doing.",
		retry: false,
	},
	// errors.ts and src/middleware/auth.ts: a live session whose GitHub id is
	// no longer on the operator allowlist. The sign-in gate takes over on it.
	NOT_OPERATOR: {
		what: "This account no longer has access to this Command Center.",
		written: NOTHING_WRITTEN,
		next: "Sign out. An admin can restore access by adding the account back.",
		retry: false,
	},
	// errors.ts: generic, for a per-resource denial (and the sign-in origin
	// guard). Not the operator check: that is NOT_OPERATOR.
	FORBIDDEN: {
		what: "Your account is not allowed to do this.",
		written: NOTHING_WRITTEN,
		next: "Ask an admin for access if you need it.",
		retry: false,
	},
	// errors.ts: generic. Also the answer for a route the server does not have.
	NOT_FOUND: {
		what: "This could not be found. It may have been removed, or the link is wrong.",
		written: NOTHING_WRITTEN,
		next: "Go back and open it again from its list.",
		retry: false,
	},
	// errors.ts: generic. No doc defines which conflicts raise it, so the copy
	// says only what a 409 conflict means.
	CONFLICT: {
		what: "This conflicts with the current state on the server.",
		written: NOTHING_WRITTEN,
		next: "Reload to see the latest state, then make your change again.",
		retry: false,
	},
	// errors.ts: generic. Anything unexpected; the server reports it with the
	// request id and sends no detail (src/middleware/errors.ts).
	INTERNAL: {
		what: "avel-server hit an unexpected error.",
		written: { read: NOTHING_WRITTEN, write: UNKNOWN_IF_SAVED },
		next: {
			read: "Try again. If it repeats, report it with the request reference.",
			write:
				"Check whether the change was saved before you repeat it, and report it with the request reference.",
		},
		retry: { read: true, write: false },
	},
	// DATA-CONTRACTS-V2.md, export.create (409): the idempotency key was
	// already used, so this is the same request arriving twice.
	IDEMPOTENCY_REPLAY: {
		what: "This export was already requested.",
		written: "The first request was recorded. This one wrote nothing new.",
		next: "Open the existing export instead of starting another.",
		retry: false,
	},
	// DATA-CONTRACTS-V2.md, export.create (422); BLAST-RADIUS.md's pre-flight
	// lists the preconditions.
	PRECONDITION_FAILED: {
		what: "Something this action requires is not in place yet.",
		written: NOTHING_WRITTEN,
		next: "Check the preconditions on the pre-flight screen, complete what is missing, then try again.",
		retry: false,
	},
	// BLAST-RADIUS.md, error cases: 404 from GitHub.
	REPO_NOT_FOUND: {
		what: "GitHub has no repository at this address. It may be missing or renamed.",
		written: NOTHING_WRITTEN,
		next: "Check the repository URL, or export as a zip instead.",
		retry: false,
	},
	// BLAST-RADIUS.md: 403 from GitHub, or the token lacks scope.
	REPO_NO_ACCESS: {
		what: "The connection used for this does not have access to the repository.",
		written: NOTHING_WRITTEN,
		next: "Check the connection's scope in Settings, under Connections, and grant what it needs.",
		retry: false,
	},
	// BLAST-RADIUS.md: the Connection is no longer active.
	CONNECTION_REVOKED: {
		what: "The connection for this repository is no longer active.",
		written: NOTHING_WRITTEN,
		next: "Reconnect the account in Settings, under Connections, then try again.",
		retry: false,
	},
	// BLAST-RADIUS.md: a push to the default branch where the repository's
	// policy forbids it. Blocked by policy, not by an error.
	POLICY_FORBIDS_TARGET: {
		what: "This repository's policy does not allow pushing to its default branch.",
		written: NOTHING_WRITTEN,
		next: "Deliver as a pull request instead.",
		retry: false,
	},
	// BLAST-RADIUS.md: the named ref does not exist.
	BRANCH_NOT_FOUND: {
		what: "The branch named for this delivery does not exist.",
		written: NOTHING_WRITTEN,
		next: "Check the branch name. A pull request can compare against the base branch instead.",
		retry: false,
	},
	// BLAST-RADIUS.md: the repository has no commits. The doc calls this "not
	// an error"; the server still sends it as one (reported upstream).
	EMPTY_REPOSITORY: {
		what: "The repository has no commits yet, so everything in this delivery would be new.",
		written: NOTHING_WRITTEN,
		next: "Preview again to deliver everything as new files.",
		retry: false,
	},
	// BLAST-RADIUS.md: the tree is truncated even when scoped to the paths.
	TREE_TOO_LARGE: {
		what: "The repository is too large to compare safely.",
		written: NOTHING_WRITTEN,
		next: "Export as a zip instead.",
		retry: false,
	},
	// BLAST-RADIUS.md: a violation is present. Not overridable.
	BLAST_RADIUS_VIOLATION: {
		what: "This delivery would write where it is not permitted to.",
		written: NOTHING_WRITTEN,
		next: "Review the violations listed. They cannot be overridden.",
		retry: false,
	},
	// BLAST-RADIUS.md: the base commit moved since the preview.
	PREVIEW_STALE: {
		what: "The repository changed after this preview was made.",
		written: NOTHING_WRITTEN,
		next: "Preview again to see what the delivery would change now.",
		retry: false,
	},
	// BLAST-RADIUS.md: a push without a preview. A backend guard the
	// interface should never reach.
	PREVIEW_REQUIRED: {
		what: "A direct push needs a preview first.",
		written: NOTHING_WRITTEN,
		next: "Run the pre-flight preview, then deliver from it.",
		retry: false,
	},
	// BLAST-RADIUS.md: the real render's hash differs from the preview's. An
	// architectural failure, not a user error.
	DETERMINISM_VIOLATION: {
		what: "The delivery did not match its preview: the same inputs produced different files. This is a failure in AVEL, not in your work.",
		written: "Nothing was delivered.",
		next: "Report it with the request reference.",
		retry: false,
	},
	// BLAST-RADIUS.md: a 5xx, rate limit or timeout from GitHub. Retryable.
	EXTERNAL_GITHUB: {
		what: "GitHub did not answer in time, or is limiting requests.",
		written: {
			read: NOTHING_WRITTEN,
			write: "AVEL cannot tell how far GitHub got before it stopped answering.",
		},
		next: {
			read: "Try again in a moment. If GitHub is limiting requests, wait for the limit to reset.",
			write:
				"Check the repository on GitHub, then try again once GitHub is answering.",
		},
		retry: true,
	},
	// errors.ts only (no doc yet): GitHub refused the request, and unlike
	// EXTERNAL_GITHUB, retrying the same request will not help.
	GITHUB_REJECTED: {
		what: "GitHub refused the request.",
		written: "GitHub did not apply it.",
		next: "Check the repository's settings and permissions on GitHub. Trying again unchanged will not help.",
		retry: false,
	},
	// DATA-CONTRACTS-V2.md, Dispatch: an agent's token after its dispatch
	// stopped running. Agents meet it; the operator only sees it relayed.
	DISPATCH_CLOSED: {
		what: "This agent's run has ended, so its access no longer works.",
		written: NOTHING_WRITTEN,
		next: "Start a new dispatch if the work needs to continue.",
		retry: false,
	},
	// DATA-CONTRACTS-V2.md, Dispatch: the agent's families do not allow the
	// route's verb (ROLES.md, what each family may do through the API).
	AGENT_NOT_PERMITTED: {
		what: "This agent isn't allowed to do this.",
		written: NOTHING_WRITTEN,
		next: "Agents act only within their roles. Do it yourself, or give it to an agent whose role covers it.",
		retry: false,
	},
};

/**
 * Why a background gate run ended without a run (avel-server
 * src/contract/gate-job.ts, GATE_JOB_FAILURES, 2026-10-23). Keyed on its
 * union, so a failure the server adds stops this compiling until it has
 * copy. precondition_failed carries a PreconditionReason, whose own copy
 * says which; this entry speaks when there is none. The job's message is
 * for logs and never shown.
 */
export const GATE_JOB_FAILURE_COPY = {
	precondition_failed: {
		what: "Something the gate needs stopped holding before it ran.",
		written: "No gate run was recorded.",
		next: "Fix what it names, then run the gate again.",
		retry: false,
	},
	integration_moved: {
		// While queued or while running: the commit the POST saw, which its
		// overrides are bound to, is no longer the mission's (2026-10-23).
		what: "The mission's code changed after the gate was asked to run, so this run would no longer judge it as it stands.",
		written: "No gate run was recorded.",
		next: "Run the gate again to judge the mission as it stands.",
		retry: true,
	},
	interrupted: {
		what: "avel-server stopped while the gate was running.",
		written: "No gate run was recorded.",
		next: "Run the gate again.",
		retry: true,
	},
	timed_out: {
		what: "The gate ran past its two-hour limit and was stopped.",
		written: "No gate run was recorded.",
		next: "Run it again. If it times out again, a check is likely stuck.",
		retry: true,
	},
	internal: {
		what: "The gate run failed inside AVEL. This is not a verdict on the work.",
		written: "No gate run was recorded.",
		next: "Run the gate again. If it fails again, report it.",
		retry: true,
	},
} as const satisfies Record<GateJobFailure, CodeCopy>;

/**
 * PRECONDITION_FAILED's copy per reason (contract PRECONDITION_REASONS), each
 * read from the route that raises it. Keyed on the contract's union, so a
 * reason the server adds fails this build until it has copy. These replace
 * the generic entry, whose pre-flight wording fits none of them.
 */
export const PRECONDITION_COPY = {
	// avel-server src/routes/clients.ts: closing a client whose engagements
	// are still active.
	client_has_active_engagements: {
		what: "This client still has active engagements.",
		written: "Nothing was changed.",
		next: "Close its active engagements first, then close the client.",
		retry: false,
	},
	// src/routes/engagements.ts: a new engagement for a client that no longer
	// exists.
	client_not_found: {
		what: "This client no longer exists.",
		written: NOTHING_WRITTEN,
		next: "Reload the client list and choose an existing client.",
		retry: false,
	},
	// src/routes/engagements.ts: a new engagement for a closed client. A
	// client can be reopened: its status accepts active again.
	client_closed: {
		what: "This client is closed, so it cannot take a new engagement.",
		written: NOTHING_WRITTEN,
		next: "Reopen the client if it should take new work, or choose an active client.",
		retry: false,
	},
	// src/routes/intake.ts (module 1): a new intake for an engagement that no
	// longer exists.
	engagement_not_found: {
		what: "This engagement no longer exists.",
		written: NOTHING_WRITTEN,
		next: "Reload the client and choose an existing engagement.",
		retry: false,
	},
	// src/routes/intake.ts, connections.ts and mission-lifecycle.ts: a new
	// intake, connection or mission start under an engagement that is closed.
	engagement_closed: {
		what: "This engagement is closed, so it can't take new work.",
		written: NOTHING_WRITTEN,
		next: "Choose an active engagement, or start a new one for this work.",
		retry: false,
	},
	// src/routes/intake.ts: the mechanical check failed at propose or approve.
	// details.issues lists what failed; the intake screen shows each one.
	intake_check_failed: {
		what: "This intake did not pass its check.",
		written: NOTHING_WRITTEN,
		next: "Fix each issue listed, then try again.",
		retry: false,
	},
	// Approval while Canon, the project briefer, still has open questions on
	// the intake (2026-10-19). details.issues names each one, in order, at
	// ["canonQuestions", <questionId>] with the question's header as message.
	// A second triage of the same finding (2026-10-19): someone confirmed or
	// dismissed it first.
	finding_not_open: {
		what: "This finding has already been triaged.",
		written: NOTHING_WRITTEN,
		next: "Refresh to see whether it was confirmed or dismissed.",
		retry: false,
	},
	// The gate (POST /api/missions/:id/gate, 2026-10-19). Each places its
	// issues on the dispatches or paths they name.
	dispatches_running: {
		what: "A dispatch is still queued or running, so there is nothing settled to judge.",
		written: NOTHING_WRITTEN,
		next: "Let each listed dispatch finish, or halt it, then run the gate.",
		retry: false,
	},
	integration_conflict: {
		what: "Two finished dispatches changed the same file, so their work can't be combined to judge.",
		written: NOTHING_WRITTEN,
		next: "Resolve each listed file in one of the dispatches, then run the gate.",
		retry: false,
	},
	nothing_to_judge: {
		what: "No dispatch on this mission has finished, so there is nothing to judge.",
		written: NOTHING_WRITTEN,
		next: "Run a dispatch to completion, then run the gate.",
		retry: false,
	},
	dispatch_commit_missing: {
		what: "A finished dispatch has no recorded result commit, so its work can't be judged.",
		written: NOTHING_WRITTEN,
		next: "Dispatch that work again, then run the gate.",
		retry: false,
	},
	// Canon, the project briefer (2026-10-19).
	intake_not_draft: {
		what: "Canon works only on a draft intake.",
		written: NOTHING_WRITTEN,
		next: "Revise the intake back to draft to brief it with Canon.",
		retry: false,
	},
	canon_session_open: {
		what: "A Canon session is already open on this intake.",
		written: NOTHING_WRITTEN,
		next: "Resume that session, or close it first.",
		retry: false,
	},
	canon_session_not_open: {
		what: "This Canon session has ended.",
		written: NOTHING_WRITTEN,
		next: "Open a new session to keep briefing.",
		retry: false,
	},
	canon_mode_unavailable: {
		what: "That mode is not available in this chat.",
		written: NOTHING_WRITTEN,
		next: "Draft needs an intake, and fetch is not built yet. Switch to ask.",
		retry: false,
	},
	canon_session_final: {
		what: "This session hit its hard token limit, so it can't be reopened.",
		written: NOTHING_WRITTEN,
		next: "Open a new session.",
		retry: false,
	},
	canon_turn_running: {
		what: "Canon is still answering.",
		written: NOTHING_WRITTEN,
		next: "Wait for its reply, or halt the session.",
		retry: true,
	},
	canon_question_not_open: {
		what: "This question has already been answered, acknowledged or dismissed.",
		written: NOTHING_WRITTEN,
		next: "Refresh to see how it was settled.",
		retry: false,
	},
	client_memory_not_proposed: {
		what: "Only a proposed memory can be kept.",
		written: NOTHING_WRITTEN,
		next: "Refresh to see whether it was already kept or removed.",
		retry: false,
	},
	client_memory_removed: {
		what: "This memory was removed, so it can't be edited.",
		written: NOTHING_WRITTEN,
		next: "Write a new memory instead.",
		retry: false,
	},
	intake_questions_open: {
		what: "Canon still has open questions on this intake.",
		written: NOTHING_WRITTEN,
		next: "Answer, acknowledge or dismiss each question, then approve again.",
		retry: false,
	},
	// Brief sources (2026-10-21): approval waits on the operator confirming
	// or rejecting every passage Canon cited.
	brief_sources_unconfirmed: {
		what: "Some of this brief's sources haven't been checked.",
		written: NOTHING_WRITTEN,
		next: "Confirm or reject each source on the brief, then approve again.",
		retry: false,
	},
	// src/routes/intake.ts: approval while the repository's cut has not been
	// derived. Every approval gets this until repo read (module 2) exists.
	intake_cut_not_derived: {
		what: "This intake can't be approved yet: the repository hasn't been read.",
		written: NOTHING_WRITTEN,
		next: "Use Read repository on this intake to derive the cut, then approve again.",
		retry: false,
	},
	// src/routes/skills.ts (module 4): creating a skill, or moving it, names a
	// source that is missing or deleted.
	skill_source_not_found: {
		what: "That skill source no longer exists.",
		written: NOTHING_WRITTEN,
		next: "Reload the sources and choose an existing one.",
		retry: false,
	},
	// src/routes/skill-sources.ts: deleting a source live skills still come from.
	skill_source_in_use: {
		what: "Skills still come from this source.",
		written: NOTHING_WRITTEN,
		next: "Move its skills to another source first. A retired skill keeps its source, so a source with one stays.",
		retry: false,
	},
	// src/routes/skills.ts: grants or io shape sent that do not fit the skill's
	// stored type (only capabilities carry them).
	skill_capability_mismatch: {
		what: "Grants and io shape belong only to capability skills.",
		written: NOTHING_WRITTEN,
		next: "Change the skill's type, or remove the grants and io shape.",
		retry: false,
	},
	// The reasons below arrive with module 4's roster writes (step 6), copy
	// written against avel-server's announced firing rules. A missing mission
	// answers 404, not mission_not_editable; duplicates answer 409.
	spend_ceiling_not_raised: {
		what: "An active mission's spend limit can only go up.",
		written: NOTHING_WRITTEN,
		next: "Set a limit above the current one. Lowering it below what is spent would stop every running dispatch.",
		retry: false,
	},
	mission_not_editable: {
		what: "This mission can no longer be changed.",
		written: NOTHING_WRITTEN,
		next: "Only a draft mission's roster, skills, plan and spend limit can change. An active mission's spend limit can still go up.",
		retry: false,
	},
	agent_template_not_found: {
		what: "That agent no longer exists.",
		written: NOTHING_WRITTEN,
		next: "Reload All agents and choose an existing one.",
		retry: false,
	},
	template_not_rosterable: {
		what: "Firm agents like Canon, Trace and Uno work between missions, so they can't join a mission's roster.",
		written: NOTHING_WRITTEN,
		next: "Choose an agent with mission roles instead.",
		retry: false,
	},
	preset_not_found: {
		what: "That team no longer exists.",
		written: NOTHING_WRITTEN,
		next: "Reload the teams and choose an existing one.",
		retry: false,
	},
	roster_not_empty: {
		what: "This mission's roster already has agents.",
		written: NOTHING_WRITTEN,
		next: "Apply the team again choosing to replace the roster, or remove its agents first.",
		retry: false,
	},
	skill_not_found: {
		what: "That skill no longer exists.",
		written: NOTHING_WRITTEN,
		next: "Reload the skills and choose an existing one.",
		retry: false,
	},
	// src/routes/intakes.ts read-repo (module 2), checked after the intake's
	// own state and the repo URL's form: the connection that would read it.
	connection_not_found: {
		what: "That connection doesn't exist for this engagement.",
		written: NOTHING_WRITTEN,
		next: "Choose a connection that belongs to this engagement, or add one.",
		retry: false,
	},
	connection_expired: {
		what: "This connection has expired.",
		written: NOTHING_WRITTEN,
		next: "Rotate its credential in Connections, then read the repository again.",
		retry: false,
	},
	connection_scope_mismatch: {
		what: "This connection doesn't cover that repository.",
		written: NOTHING_WRITTEN,
		next: "Use a connection scoped to the repository's owner or to the repository itself.",
		retry: false,
	},
	connection_credential_missing: {
		what: "The credential this connection names isn't set on avel-server.",
		written: NOTHING_WRITTEN,
		next: "Set the environment variable the connection names on avel-server, then try again.",
		retry: false,
	},
	// Approve, after the repository read: the brief must name the repository
	// that was read, and its conventions must agree with themselves.
	intake_repo_mismatch: {
		what: "This intake's repository hasn't been read, or a different one was named.",
		written: NOTHING_WRITTEN,
		next: "Read the repository, and approve with the same repository URL.",
		retry: false,
	},
	intake_conventions_low_confidence: {
		what: "The repository's conventions disagree with themselves, so none can be relied on.",
		written: NOTHING_WRITTEN,
		next: "Settle each convention listed, in the repository or by acknowledging it, then approve again.",
		retry: false,
	},
	skill_not_attachable: {
		what: "This skill can't be attached to a mission.",
		written: NOTHING_WRITTEN,
		next: "Only approved stack and domain skills attach to a mission. Role skills come with the agent.",
		retry: false,
	},
	// src/routes/mission-plan.ts (module 3): the plan edits, or drops, part of
	// the brief approved at intake. details.issues lists each change. A plan
	// may only add requirements, criteria and modules.
	plan_changes_approved_brief: {
		what: "This plan changes the brief that was approved at intake.",
		written: NOTHING_WRITTEN,
		next: "Keep the approved summary, requirements and criteria as they are. Add new ones instead, then save again.",
		retry: false,
	},
	// src/routes/playbooks.ts (module 3): the default preset has no agent in
	// the earliest wave the playbook declares, or the playbook declares none.
	preset_misses_first_wave: {
		what: "The default team has no agent in this playbook's first wave.",
		written: NOTHING_WRITTEN,
		next: "Turn on a wave the team staffs, or choose a team with an agent in the first wave, then publish again.",
		retry: false,
	},
	// src/routes/playbooks.ts: a live mission of this type is active or
	// halted, and its playbook cannot change under it.
	playbook_in_use: {
		what: "A mission of this type is active or halted, so its playbook can't change now.",
		written: NOTHING_WRITTEN,
		next: "Finish or archive that mission first, then publish again.",
		retry: false,
	},
	// src/routes/roster.ts: an access override names no tool row the agent
	// has, names a row twice, or widens a mode. details.issues lists each one.
	access_override_invalid: {
		what: "Some of these access changes don't apply to this agent.",
		written: NOTHING_WRITTEN,
		next: "Access can only be narrowed, once per tool, on tools the agent has. Attach a stack skill first, then try again.",
		retry: false,
	},
	// src/routes/mission-plan.ts: a templated mission's template must be the
	// one its type names.
	template_type_mismatch: {
		what: "This template doesn't match the mission's type.",
		written: NOTHING_WRITTEN,
		next: "Choose the template this mission was created from, or clear the template, then save again.",
		retry: false,
	},
	// src/routes/agent-templates.ts regenerate: the operator is a person, so
	// it has no identity file to write.
	identity_role_unsupported: {
		what: "The operator is a person, so it has no identity to generate.",
		written: NOTHING_WRITTEN,
		next: "Regenerate an agent instead. The operator's choices are made by you, not written down for a model.",
		retry: false,
	},
	// src/routes/agent-templates.ts regenerate: a generated file is over the
	// token cap (details.cap). details.file names it and details.tokens gives its size.
	identity_over_token_cap: {
		what: "This agent's identity is longer than its token limit.",
		written: NOTHING_WRITTEN,
		next: "Give the agent fewer roles, or shorten the approved role skills it carries, then regenerate.",
		retry: false,
	},
	// src/routes/agent-templates.ts PATCH: a role run by code, or the
	// operator's foundations mixed with another role. details.issues names each.
	agent_role_not_assignable: {
		what: "Some of these roles can't be given to an agent.",
		written: NOTHING_WRITTEN,
		next: "Remove the automated roles, and keep Project setup on the operator alone, then save again.",
		retry: false,
	},
	// src/routes/agent-templates.ts PATCH: the roles span more than one side,
	// so the agent would check its own work. details.sides lists them.
	agent_roles_cross_sides: {
		what: "These roles would have this agent checking its own work.",
		written: NOTHING_WRITTEN,
		next: "Keep its roles on one side: writing code, writing tests, reviewing, or the independent check. Give the others to another agent.",
		retry: false,
	},
	// Module 6, mission start (draft to active) and halt. details.issues
	// lists what the plan check or the coherence check found;
	// details.rosterEntryIds names the agents at fault.
	mission_not_draft: {
		what: "This mission has already started.",
		written: NOTHING_WRITTEN,
		next: "Only a draft mission can be started. Reload to see where it stands.",
		retry: false,
	},
	mission_not_active: {
		what: "This mission isn't running.",
		written: NOTHING_WRITTEN,
		next: "Start the mission first. A halted or finished mission takes no new dispatches.",
		retry: false,
	},
	plan_check_failed: {
		what: "The mission's plan doesn't pass its check.",
		written: NOTHING_WRITTEN,
		next: "Fix each issue listed in the plan, then start the mission again.",
		retry: false,
	},
	coherence_blocked: {
		what: "The roster has a gap or a clash that blocks this mission.",
		written: NOTHING_WRITTEN,
		next: "Resolve each blocking item listed on the roster, then start the mission again.",
		retry: false,
	},
	estimate_missing: {
		what: "Some agents have no token estimate.",
		written: NOTHING_WRITTEN,
		next: "Give each agent listed an estimate on the roster, then try again.",
		retry: false,
	},
	spend_ceiling_missing: {
		what: "This mission has no spend limit.",
		written: NOTHING_WRITTEN,
		next: "Set one on the mission's Spend panel, then start it again.",
		retry: false,
	},
	spend_ceiling_reached: {
		what: "This mission has reached its spend limit.",
		written: NOTHING_WRITTEN,
		next: "Raise the mission's spend limit if the work should go on.",
		retry: false,
	},
	// Module 6, dispatch create, start and halt.
	roster_entry_not_found: {
		what: "That agent isn't on this mission's roster.",
		written: NOTHING_WRITTEN,
		next: "Reload the roster and choose an agent on it.",
		retry: false,
	},
	roster_entry_inactive: {
		what: "That agent isn't active on this mission's roster.",
		written: NOTHING_WRITTEN,
		next: "Make the agent active on the roster, or choose another.",
		retry: false,
	},
	agent_identity_missing: {
		what: "This agent has no generated identity yet.",
		written: NOTHING_WRITTEN,
		next: "Regenerate the agent's identity on its page, then try again.",
		retry: false,
	},
	dispatch_not_queued: {
		what: "This dispatch has already started or ended.",
		written: NOTHING_WRITTEN,
		next: "Reload to see where it stands.",
		retry: false,
	},
	dispatch_not_running: {
		what: "This dispatch isn't running.",
		written: NOTHING_WRITTEN,
		next: "Reload to see where it stands. Only a running dispatch can be halted.",
		retry: false,
	},
	// details.model names the model with no price.
	model_price_unknown: {
		what: "AVEL has no price for this model, so it can't hold the run to the spend limit.",
		written: NOTHING_WRITTEN,
		next: "Choose a model AVEL has a price for, or add its price to avel-server.",
		retry: false,
	},
	// The harness can't take the run now, or failed to start it.
	harness_unavailable: {
		what: "The agent runner can't take this agent right now.",
		written: NOTHING_WRITTEN,
		next: "Wait for a running dispatch to finish, or try again in a moment. If it repeats, report it with the request reference.",
		retry: true,
	},
	// Waves (avel-server, decided 2026-10-22). At create: the dispatch's wave.
	wave_required: {
		what: "This agent is in more than one wave, so the dispatch needs one.",
		written: NOTHING_WRITTEN,
		next: "Choose the wave this dispatch runs in.",
		retry: false,
	},
	// details.wave is the wave asked for; the entry may have none at all.
	wave_not_on_roster_entry: {
		what: "This agent isn't in that wave on the roster.",
		written: NOTHING_WRITTEN,
		next: "Choose one of the agent's waves, or add the wave to its roster entry.",
		retry: false,
	},
	// details.wave is switched off in the live playbook for the mission's type.
	wave_not_applicable: {
		what: "The mission's playbook doesn't run that wave.",
		written: NOTHING_WRITTEN,
		next: "Choose a wave the playbook runs, or switch the wave on in the playbook.",
		retry: false,
	},
	// At start: details.wave is the earliest wave still open, and
	// details.dispatchIds its queued and running dispatches, oldest first.
	earlier_wave_open: {
		what: "An earlier wave is still open, so this dispatch can't start yet.",
		written: NOTHING_WRITTEN,
		next: "Start this one once the listed dispatches have finished.",
		retry: false,
	},
	// avel-server step 7: the room's source can't be found, so retrying
	// won't help. details.issues names the case by path: ["intake"] (not
	// exactly one approved intake), ["source","template"] or ["source","repo"]
	// (AVEL_SOURCES_DIR unset, the clone missing, or the commit not in it).
	source_unavailable: {
		what: "AVEL can't find the code this agent would work on.",
		written: NOTHING_WRITTEN,
		next: "Give the mission exactly one approved intake, set AVEL_SOURCES_DIR on avel-server, and clone the template or repository there at a state that has the mission's commit. Then start the dispatch again.",
		retry: false,
	},
	// avel-server step 9b: dispatch create and start refuse a requirement in
	// the briefRef with no Done-when check (missions started before the plan
	// rule). details.issues names each requirement.
	requirement_unchecked: {
		what: "A requirement this agent would work on has no check that shows it's done.",
		written: NOTHING_WRITTEN,
		next: "Add a check for each requirement listed in the mission's plan, under How it's checked, then queue or start the dispatch again.",
		retry: false,
	},
	// The source exists, but the agent's worktree couldn't be created.
	// Worktree rooms have no capacity limit.
	room_unavailable: {
		what: "AVEL couldn't set up this agent's room.",
		written: NOTHING_WRITTEN,
		next: "Try again in a moment. If it repeats, report it with the request reference.",
		retry: true,
	},
	// Module 8, completion reports. Agents meet these; the operator sees them
	// relayed in a report or the activity.
	report_dispatch_mismatch: {
		what: "This report names a different run than the agent's own.",
		written: NOTHING_WRITTEN,
		next: "An agent can file a report only for its own run. Report it with the request reference.",
		retry: false,
	},
	// details.issues lists each file outside the agent's writable paths.
	writes_outside_mount: {
		what: "The agent changed files outside the paths it may write.",
		written: NOTHING_WRITTEN,
		next: "Review the files listed. Give them to the agent that owns them, or widen this agent's writable paths.",
		retry: false,
	},
	// Modules 10 and 11, slice 1 (2026-10-22): export preview and create. A
	// refusal writes no export. Only verified work ships, whatever overrides
	// the run carries.
	gate_not_run: {
		what: "The gate hasn't judged this mission, so there is nothing to export.",
		written: NOTHING_WRITTEN,
		next: "Run the gate, then preview the export.",
		retry: false,
	},
	gate_run_not_latest: {
		what: "The gate ran again after you looked, so this isn't the latest run.",
		written: NOTHING_WRITTEN,
		next: "Review the latest gate run, then export it.",
		retry: false,
	},
	gate_pass_not_verified: {
		what: "The gate passed this work but didn't verify it, and only verified work ships.",
		written: NOTHING_WRITTEN,
		next: "See what the gate couldn't check, close those gaps, and run the gate again.",
		retry: false,
	},
	gate_failed: {
		what: "The gate failed this work, so it can't ship.",
		written: NOTHING_WRITTEN,
		next: "Fix what the gate blocked on, then run the gate again.",
		retry: false,
	},
	preview_mission_mismatch: {
		what: "That preview belongs to another mission.",
		written: NOTHING_WRITTEN,
		next: "Preview this mission's export, then deliver from that preview.",
		retry: false,
	},
	preview_target_mismatch: {
		what: "That preview was made for a different target.",
		written: NOTHING_WRITTEN,
		next: "Preview again for the target you're delivering to.",
		retry: false,
	},
	package_hash_version_mismatch: {
		what: "That preview was hashed under an older package format.",
		written: NOTHING_WRITTEN,
		next: "Preview again, then deliver from the new preview.",
		retry: false,
	},
	integration_commit_moved: {
		what: "The work no longer rebuilds to the commit the gate judged.",
		written: NOTHING_WRITTEN,
		next: "Run the gate again, so it judges the work as it is now.",
		retry: false,
	},
	// The package_* reasons: the work holds something a package can't carry.
	// details.issues names each path.
	package_symlink: {
		what: "The work adds a symbolic link, which a package can't carry.",
		written: NOTHING_WRITTEN,
		next: "Replace each listed link with a file, then run the gate again.",
		retry: false,
	},
	package_submodule: {
		what: "The work adds a git submodule, which a package can't carry.",
		written: NOTHING_WRITTEN,
		next: "Remove each listed submodule, then run the gate again.",
		retry: false,
	},
	package_mode_only: {
		what: "The work changes only a file's permissions, which a package can't carry.",
		written: NOTHING_WRITTEN,
		next: "Revert the permission change on each listed file, then run the gate again.",
		retry: false,
	},
	package_unsupported_mode: {
		what: "A file in the work has a mode a package can't carry.",
		written: NOTHING_WRITTEN,
		next: "Make each listed file a regular or executable file, then run the gate again.",
		retry: false,
	},
	package_path_not_utf8: {
		what: "A file in the work has a name that isn't valid text.",
		written: NOTHING_WRITTEN,
		next: "Rename each listed file, then run the gate again.",
		retry: false,
	},
	package_reserved_path: {
		what: "The work writes inside .avel/, which AVEL keeps for the receipt.",
		written: NOTHING_WRITTEN,
		next: "Move each listed file out of .avel/, then run the gate again.",
		retry: false,
	},
	package_unsafe_path: {
		what: "A file in the work has a path a package can't safely write.",
		written: NOTHING_WRITTEN,
		next: "Rename each listed file, then run the gate again.",
		retry: false,
	},
	package_duplicate_path: {
		what: "Two files in the work would land on the same path.",
		written: NOTHING_WRITTEN,
		next: "Rename one of each listed pair, then run the gate again.",
		retry: false,
	},
	package_too_large: {
		what: "The work is too large to package.",
		written: NOTHING_WRITTEN,
		next: "Split the work across missions, or remove large generated files, then run the gate again.",
		retry: false,
	},
	export_target_repo_missing: {
		what: "This mission has no client repository to deliver to.",
		written: NOTHING_WRITTEN,
		next: "Export it as a zip instead.",
		retry: false,
	},
	// Push delivery (2026-10-24): the target branch is the repository's
	// default, and its policy does not allow a direct push there. A repo
	// with no policy never allows it.
	direct_push_not_allowed: {
		what: "This repository's policy doesn't allow a direct push to its default branch.",
		written: NOTHING_WRITTEN,
		next: "Push to another branch, deliver it as a pull request, or allow direct pushes in Settings, Repositories.",
		retry: false,
	},
	// PUT /api/repo-policies: allowing a direct push to the default branch
	// needs its own confirmation.
	direct_push_unconfirmed: {
		what: "Allowing a direct push to the default branch needs to be confirmed.",
		written: "The policy was not changed.",
		next: "Confirm that pushes may go straight to the default branch, then save again.",
		retry: false,
	},
	// PUT /api/skills/:id/roles: stack and domain skills go on missions.
	skill_not_role_layer: {
		what: "Only a role skill attaches to roles.",
		written: NOTHING_WRITTEN,
		next: "Attach a stack or domain skill to a mission instead.",
		retry: false,
	},
	// POST /api/exports/:id/refresh reads only a github_pr export that is
	// delivering or has its pull request open.
	export_not_pr_open: {
		what: "This export has no open pull request to check.",
		written: NOTHING_WRITTEN,
		next: "Reload to see where it stands. Only a GitHub pull request still open or being opened can be checked.",
		retry: false,
	},
} as const satisfies Record<PreconditionReason, CodeCopy>;

/**
 * contract.roster.attachSkill's 409 CONFLICT: the skill is already on the
 * mission, most likely attached from another tab. Its generic copy would
 * send the operator to reload for a change that is in fact already made.
 */
export const SKILL_ALREADY_ATTACHED: ErrorCopy = {
	what: "This skill is already on the mission.",
	written: "Nothing new was written. The skill stays attached once.",
	next: "The list now shows it attached. Nothing else to do.",
	retry: false,
};

/** Copy for an error from avel-server's contract. */
export function describeError(error: ApiError): ErrorCopy {
	const { failure } = error;
	// Narrowing on the code types its details (the contract's union).
	if (failure.kind === "contract" && failure.code === "PRECONDITION_FAILED") {
		return resolve(
			PRECONDITION_COPY[failure.details.reason],
			failure.method === "GET",
		);
	}
	return describeWith(CONTRACT_ERROR_COPY)(error);
}

/**
 * Builds the describer over any code table. Exported so the mechanism can be
 * tested with a contract that has codes, while the real one has none.
 */
export function describeWith<TCode extends string>(
	table: ErrorCopyTable<TCode>,
): (error: ApiError<TCode>) => ErrorCopy {
	return ({ failure }) => describeFailure(failure, table);
}

function describeFailure<TCode extends string>(
	failure: ApiFailure<TCode>,
	table: ErrorCopyTable<TCode>,
): ErrorCopy {
	// A read changes nothing on the server, so its failure can say so. For a
	// write, the client cannot know whether the change landed before the
	// connection dropped, and the copy says that instead of guessing.
	const isRead = failure.method === "GET";
	switch (failure.kind) {
		case "contract": {
			// The code, as the table's key. For a generic vocabulary TypeScript
			// cannot see `code` through the union of envelope bodies; every
			// variant has one.
			const code = (failure as unknown as { code: TCode }).code;
			return resolve(table[code], isRead);
		}
		case "unreachable":
			return {
				what: "avel-server did not answer.",
				written: isRead
					? "Nothing was written."
					: "AVEL cannot tell whether this change was saved.",
				next: isRead
					? "Check that avel-server is running, then try again."
					: "Check whether the change was saved before you try again.",
				retry: isRead,
			};
		case "unexpected-status":
			return {
				what: `avel-server answered ${failure.status}, which its contract does not define for this request.`,
				written: isRead
					? "Nothing was written."
					: "AVEL cannot tell whether this change was saved.",
				next:
					failure.status >= 500
						? "This is a server failure. Try again, and report it if it repeats."
						: "avel-server and this app disagree about the contract. Update the pinned contract or the server.",
				retry: isRead && failure.status >= 500,
			};
		case "invalid-response":
			return {
				what: "avel-server's answer did not match its contract.",
				written: isRead
					? "Nothing was written."
					: "avel-server answered, so the change may have been saved.",
				next: "avel-server and this app disagree about the contract. Update the pinned contract or the server.",
				retry: false,
			};
		default:
			return unhandled(failure);
	}
}

/** A code's copy for one request: read or write, where it differs. */
function resolve(entry: CodeCopy, isRead: boolean): ErrorCopy {
	const pick = <T>(value: T | ByMethod<T>): T =>
		typeof value === "object" && value !== null && "read" in value
			? isRead
				? value.read
				: value.write
			: (value as T);
	return {
		what: entry.what,
		written: pick(entry.written),
		next: pick(entry.next),
		retry: pick(entry.retry),
	};
}

function unhandled(failure: never): never {
	throw new Error(`No copy for API failure ${JSON.stringify(failure)}`);
}
