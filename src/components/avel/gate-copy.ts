import type {
	DECIDE_RULES,
	FindingSeverity,
	GATE_RESULTS,
	IGNORED_OVERRIDE_WHYS,
	REASON_EFFECTS,
} from "avel-server/contract";
import type { StatusTone } from "./status-pill";

/*
 * The gate's words (module 9). Each table is keyed on the contract's own
 * list with `satisfies`, so a rule, effect or result the server adds fails
 * this build until it has words, and one it removes fails until they go.
 * The copy says what the rule found, never more than the receipt states.
 */

type Rule = (typeof DECIDE_RULES)[number];
type Effect = (typeof REASON_EFFECTS)[number];
type Result = (typeof GATE_RESULTS)[number];
type IgnoredWhy = (typeof IGNORED_OVERRIDE_WHYS)[number];

/** Each rule decide() applies, in words. */
export const RULE_WORDS = {
	stale_commit: "Judged at an older commit than the mission's integration",
	checkpoint_violation: "A dispatch wrote where it may not",
	checkpoint_unproven: "A dispatch's writes could not be checked",
	prior_finding_failed: "An earlier finding still fails",
	judge_open: "A judge's finding is still open",
	judge_confirmed: "A judge's finding was confirmed",
	unlisted_gate: "The gate isn't in this mission's playbook",
	mandatory_failed: "A mandatory gate failed",
	mandatory_not_run: "A mandatory gate has no evidence",
	degraded_not_run: "Its check isn't installed yet",
	warn_failed: "A warn gate failed",
	warn_not_run: "A warn gate has no evidence",
	passed: "Passed",
} as const satisfies Record<Rule, string>;

/** What a reason did to its gate. */
export const EFFECT_WORDS = {
	block: "Blocks",
	overridden: "Overridden",
	warn: "Warns",
	pass: "Passes",
	ignored: "Ignored",
} as const satisfies Record<Effect, string>;

/** A result as its pill says it, and its tone: never the accent. */
export const RESULT = {
	verified: { label: "Verified", tone: "pass" },
	// Nothing blocks, but something warned, was overridden or wasn't
	// checked. Only verified work ships, so warn.
	pass: { label: "Pass", tone: "warn" },
	fail: { label: "Fail", tone: "block" },
} as const satisfies Record<Result, { label: string; tone: StatusTone }>;

/** Why an override sent with the run was not applied. */
export const IGNORED_WHY = {
	wrong_commit:
		"Written for another commit: an override holds for the commit it names.",
	no_rationale: "It had no rationale.",
	no_such_blocker: "Nothing it names was blocking at this commit.",
	not_overridable: "The reason it names can't be overridden.",
} as const satisfies Record<IgnoredWhy, string>;

/** A finding's severity as its pill: critical and high block, medium warns. */
export const SEVERITY = {
	critical: { label: "Critical", tone: "block" },
	high: { label: "High", tone: "block" },
	medium: { label: "Medium", tone: "warn" },
	low: { label: "Low", tone: "pending" },
} as const satisfies Record<
	FindingSeverity,
	{ label: string; tone: StatusTone }
>;
