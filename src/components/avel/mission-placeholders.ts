/**
 * Sample data for the mission page (AVEL-DESIGN.md ruling 29), where
 * avel-server has no route yet. Every type here is local and every value is
 * invented; each is replaced by the contract's own shape, and deleted, when
 * its route lands. Nothing here is sent anywhere, and nothing here is ever
 * written into a real field.
 *
 * Values derive from the mission id, so one mission always shows the same
 * samples: a page that reshuffled on every visit would look like live data.
 */

import type { Gate } from "avel-server/contract";

/** The route each kind of sample stands in for, named in its pill. */
export const MISSING_ROUTE = {
	exports: "exports.list",
	haltReason: "a halt reason on the mission",
	stages: "per-stage mission progress",
} as const;

export type MissingRoute = (typeof MISSING_ROUTE)[keyof typeof MISSING_ROUTE];

/** FNV-1a over the id: a stable, well-spread seed. */
function seedOf(id: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < id.length; i++) {
		hash ^= id.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

/** A deterministic sequence of numbers in [0, 1) from the id. */
function sequence(id: string): () => number {
	let state = seedOf(id) || 1;
	return () => {
		// xorshift32
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return (state >>> 0) / 0x1_0000_0000;
	};
}

const pick = <T>(next: () => number, items: readonly T[]): T =>
	items[Math.floor(next() * items.length)] as T;

/** Plan, Assemble and Execute: the stages before an export exists. */
export type SampleStageState = "done" | "current" | "waiting";
export type SampleStages = {
	plan: SampleStageState;
	assemble: SampleStageState;
	execute: SampleStageState;
};

/**
 * The early stages. Once a mission has an export, all three are behind it;
 * before that, one of them is current.
 */
export function sampleStages(id: string, hasExport: boolean): SampleStages {
	if (hasExport) return { plan: "done", assemble: "done", execute: "done" };
	const current = pick(sequence(id), [0, 1, 2] as const);
	const at = (i: number): SampleStageState =>
		i < current ? "done" : i === current ? "current" : "waiting";
	return { plan: at(0), assemble: at(1), execute: at(2) };
}

/** A gate's verdict, as an export's gate summary would show it. */
export type SampleGate = {
	name: Gate;
	verdict: "pass" | "warn" | "block";
	attested: boolean;
};

export type SampleExport = {
	id: string;
	status: "done" | "failed" | "closed";
	targetKind: "zip" | "github_pr" | "github_push";
	/** Hours it spent in its final status. */
	hoursInStage: number;
	gates: SampleGate[];
};

// Real names from the contract's closed gate vocabulary; only the verdicts
// are invented.
const SAMPLE_GATES = [
	"phase1-close",
	"alignment",
	"qa",
	"security",
] as const satisfies readonly Gate[];

/** Two or three earlier exports, newest first. */
export function sampleExports(id: string): SampleExport[] {
	const next = sequence(`${id}:exports`);
	const count = 2 + Math.floor(next() * 2);
	return Array.from({ length: count }, (_, i) => ({
		id: `sample-${i + 1}`,
		status: pick(next, ["done", "done", "failed", "closed"] as const),
		targetKind: pick(next, ["github_pr", "zip", "github_push"] as const),
		hoursInStage: 1 + Math.floor(next() * 47),
		gates: SAMPLE_GATES.map((name) => ({
			name,
			verdict: pick(next, ["pass", "pass", "pass", "warn", "block"] as const),
			attested: next() < 0.25,
		})),
	}));
}

/**
 * Why the runner halted the mission. The words are DATA-CONTRACTS-V2.md's
 * halt_reason values (CompletionReport); which applies is invented.
 */
export const HALT_REASONS = {
	token_hard_ceiling: "The token hard ceiling was reached.",
	spend_ceiling: "The spend ceiling was reached.",
	wall_clock: "The wall-clock limit was reached.",
} as const;

export function sampleHaltReason(id: string): string {
	return pick(sequence(`${id}:halt`), Object.values(HALT_REASONS));
}
