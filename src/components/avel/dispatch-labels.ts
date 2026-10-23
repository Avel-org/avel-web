import type {
	DispatchStatus,
	HaltReason,
	VersionSource,
} from "avel-server/contract";
import type { StatusTone } from "./status-pill";

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

/**
 * Each status as a tone, read as the export statuses are (ruling 27): in
 * motion is pending, waiting on a person is warn, done is pass, failed is
 * block, and halted is stale: stopped at a limit or by the operator, with
 * nothing in the system broken.
 */
export const DISPATCH_STATUS_TONE = {
	queued: "pending",
	running: "pending",
	blocked: "warn",
	complete: "pass",
	failed: "block",
	halted: "stale",
} as const satisfies Record<DispatchStatus, StatusTone>;

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
