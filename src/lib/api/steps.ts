/*
 * Reads of append-only, seq-ordered rows: a Canon session's messages and
 * steps, and a dispatch's steps. Each re-read starts after the last row
 * held instead of downloading the whole run again.
 */

/**
 * The rows held, then every page after the last seq held, until the read
 * reaches the route's lastSeq.
 */
export async function readAfterSeq<T extends { seq: number }>(
	held: readonly T[],
	page: (afterSeq: number) => Promise<{ data: T[]; meta: { lastSeq: number } }>,
): Promise<T[]> {
	const rows: T[] = [...held];
	let afterSeq = held.at(-1)?.seq ?? 0;
	// A page at a time; a run ends far before this many pages.
	for (let i = 0; i < 50; i++) {
		const next = await page(afterSeq);
		rows.push(...next.data);
		const last = next.data.at(-1)?.seq ?? afterSeq;
		if (next.data.length === 0 || last >= next.meta.lastSeq) break;
		afterSeq = last;
	}
	return rows;
}
