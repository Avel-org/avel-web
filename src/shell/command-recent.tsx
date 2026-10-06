import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

/**
 * The last few things opened from the command menu, per viewer, in this
 * browser only. useStoredState holds one value from a fixed list, and this
 * is a short list of entries, so it has its own store with the same guards:
 * storage can be missing or throw, and whatever it returns is untrusted, so
 * every entry is checked on read and a bad one is dropped, never thrown.
 */
export const RECENT_KEY = "avel.command.recent";
export const RECENT_LIMIT = 5;

const recentEntry = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("page"),
		to: z.string().startsWith("/"),
		label: z.string().min(1).max(200),
	}),
	z.object({
		kind: z.literal("mission"),
		id: z.string().uuid(),
		origin: z.enum(["client", "internal"]),
		label: z.string().min(1).max(200),
	}),
]);

export type RecentEntry = z.infer<typeof recentEntry>;

/** One identity per entry, so opening the same thing again moves it up. */
export function recentId(entry: RecentEntry): string {
	return entry.kind === "page" ? `page:${entry.to}` : `mission:${entry.id}`;
}

/** Parses stored text into valid entries, newest first, at most the limit. */
export function parseRecent(raw: string | null): RecentEntry[] {
	if (raw === null) return [];
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => recentEntry.safeParse(item))
		.flatMap((result) => (result.success ? [result.data] : []))
		.slice(0, RECENT_LIMIT);
}

/** `entry` first, any earlier copy of it removed, cut to the limit. */
export function pushRecent(
	list: readonly RecentEntry[],
	entry: RecentEntry,
): RecentEntry[] {
	const id = recentId(entry);
	return [entry, ...list.filter((e) => recentId(e) !== id)].slice(
		0,
		RECENT_LIMIT,
	);
}

/**
 * The recent list and a way to add to it. The server renders an empty list;
 * the stored one applies after mount.
 */
export function useRecent(): [RecentEntry[], (entry: RecentEntry) => void] {
	const [list, setList] = useState<RecentEntry[]>([]);

	useEffect(() => {
		try {
			setList(parseRecent(window.localStorage.getItem(RECENT_KEY)));
		} catch {
			// Storage unavailable: start empty.
		}
	}, []);

	const add = useCallback((entry: RecentEntry) => {
		setList((current) => {
			const next = pushRecent(current, entry);
			try {
				window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
			} catch {
				// Storage unavailable: the list lasts for this page only.
			}
			return next;
		});
	}, []);

	return [list, add];
}
