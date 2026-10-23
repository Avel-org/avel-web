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

/** The route each kind of sample stands in for, named in its pill. */
export const MISSING_ROUTE = {
	haltReason: "a halt reason on the mission",
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
