import type { PreconditionReason } from "avel-server/contract";
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
};

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
	// src/routes/intake.ts: a new intake for an engagement that is not active.
	engagement_closed: {
		what: "This engagement is closed, so it cannot take a new intake.",
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
	// src/routes/intake.ts: approval while the repository's cut has not been
	// derived. Every approval gets this until repo read (module 2) exists.
	intake_cut_not_derived: {
		what: "This intake can't be approved yet: the repository hasn't been read.",
		written: NOTHING_WRITTEN,
		next: "Wait for the repository read to derive the cut, then approve again.",
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
		next: "Retire or move its skills first, then delete the source.",
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
	mission_not_editable: {
		what: "This mission can no longer be changed.",
		written: NOTHING_WRITTEN,
		next: "Only a draft mission's roster, skills and plan can change.",
		retry: false,
	},
	agent_template_not_found: {
		what: "That agent template no longer exists.",
		written: NOTHING_WRITTEN,
		next: "Reload the catalog and choose an existing agent.",
		retry: false,
	},
	template_not_rosterable: {
		what: "Firm agents like Canon, Trace and Uno work between missions, so they can't join a mission's roster.",
		written: NOTHING_WRITTEN,
		next: "Choose an agent with mission roles instead.",
		retry: false,
	},
	preset_not_found: {
		what: "That preset no longer exists.",
		written: NOTHING_WRITTEN,
		next: "Reload the presets and choose an existing one.",
		retry: false,
	},
	roster_not_empty: {
		what: "This mission's roster already has agents.",
		written: NOTHING_WRITTEN,
		next: "Apply the preset again choosing to replace the roster, or remove its agents first.",
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
		what: "The default preset has no agent in this playbook's first wave.",
		written: NOTHING_WRITTEN,
		next: "Turn on a wave the preset staffs, or choose a preset with an agent in the first wave, then publish again.",
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
