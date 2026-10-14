import type {
	DispatchStatus,
	HaltReason,
	VersionSource,
} from "avel-server/contract";

/**
 * Plain names for a dispatch's state, keyed on the contract's closed enums:
 * a value the server adds fails the build until it has a name here. A
 * report's status is a subset of the dispatch's, so it reads from the same map.
 */
export const DISPATCH_STATUS_LABEL = {
	queued: "Waiting to start",
	running: "Running",
	complete: "Complete",
	blocked: "Blocked",
	failed: "Failed",
	halted: "Halted",
} as const satisfies Record<DispatchStatus, string>;

/** Why a dispatch halted: a limit the runner enforces, or the operator. */
export const HALT_REASON_LABEL = {
	token_hard_ceiling: "Token limit reached",
	spend_ceiling: "Spend limit reached",
	wall_clock: "Time limit reached",
	operator: "Stopped by the operator",
} as const satisfies Record<HaltReason, string>;

/** Whether a report's agent version was hashed at the run or rebuilt later. */
export const VERSION_SOURCE_LABEL = {
	recorded: "Recorded at the run",
	reconstructed: "Rebuilt from history",
} as const satisfies Record<VersionSource, string>;
