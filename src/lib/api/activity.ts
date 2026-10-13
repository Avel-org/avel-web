import {
	type InfiniteData,
	infiniteQueryOptions,
	queryOptions,
	useInfiniteQuery,
	useQueries,
} from "@tanstack/react-query";
import {
	type ActivityActorKind,
	type ActivityEntityType,
	type ActivityEntry,
	contract,
} from "avel-server/contract";
import { type ApiClient, callPage } from "./client";
import { queryKeys } from "./keys";
import { useApiClient } from "./provider";

export const ACTIVITY_PAGE_SIZE = 50;

/**
 * The filters the Activity page offers, each single-valued as the contract
 * takes them. Unset means unfiltered.
 */
export type ActivityFilters = {
	entityType?: ActivityEntityType;
	actorKind?: ActivityActorKind;
};

/**
 * contract.activity.list, newest first (at desc, then id desc), a page at a
 * time. A new filter set is a new key, so its list starts with no cursor;
 * meta.total counts the rows the filters keep.
 */
/** Only the filters that are set: the same object feeds the key and the request. */
function setFilters(filters: ActivityFilters): ActivityFilters {
	return {
		...(filters.entityType === undefined
			? {}
			: { entityType: filters.entityType }),
		...(filters.actorKind === undefined
			? {}
			: { actorKind: filters.actorKind }),
	};
}

export function activityQuery(api: ApiClient, filters: ActivityFilters) {
	// The key and the request read one cleaned filter set, so a filter can
	// never reach the server without also changing the cache entry, which
	// would let one filter set's cursor continue another's list.
	const set = setFilters(filters);
	return infiniteQueryOptions({
		queryKey: queryKeys.activity.list(ACTIVITY_PAGE_SIZE, set),
		queryFn: ({ pageParam }) =>
			callPage(contract.activity.list, () =>
				api.activity.list({
					query: {
						limit: ACTIVITY_PAGE_SIZE,
						...set,
						...(pageParam ? { cursor: pageParam } : {}),
					},
				}),
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
	});
}

export function useActivity(filters: ActivityFilters) {
	return useInfiniteQuery(activityQuery(useApiClient(), filters));
}

/** How many of an agent's latest entries its page shows. */
export const AGENT_ACTIVITY_LIMIT = 8;

/** One entity's latest entries, newest first: one page, no cursor. */
export function entityActivityQuery(
	api: ApiClient,
	entityType: ActivityEntityType,
	entityId: string,
) {
	return queryOptions({
		queryKey: queryKeys.activity.entity(
			entityType,
			entityId,
			AGENT_ACTIVITY_LIMIT,
		),
		queryFn: () =>
			callPage(contract.activity.list, () =>
				api.activity.list({
					query: { limit: AGENT_ACTIVITY_LIMIT, entityType, entityId },
				}),
			),
	});
}

/**
 * What happened to an agent's places on missions: the latest entries of each
 * of its roster entries, merged newest first. The log keys rows by entity,
 * not by template, so this reads one small page per entry.
 */
export function useEntriesActivity(entryIds: readonly string[]) {
	const api = useApiClient();
	return useQueries({
		queries: entryIds.map((id) => entityActivityQuery(api, "roster_entry", id)),
		combine: (results) => ({
			status: results.some((r) => r.status === "error")
				? ("error" as const)
				: results.every((r) => r.status === "success")
					? ("success" as const)
					: ("pending" as const),
			error: results.find((r) => r.error)?.error ?? null,
			retry: () => {
				for (const r of results) if (r.status === "error") r.refetch();
			},
			retrying: results.some((r) => r.isFetching),
			entries: newestFirst(results.flatMap((r) => r.data?.data ?? [])).slice(
				0,
				AGENT_ACTIVITY_LIMIT,
			),
		}),
	});
}

/** Newest first, by time then id, as the log orders itself. */
export function newestFirst(
	entries: readonly ActivityEntry[],
): ActivityEntry[] {
	return [...entries].sort((a, b) =>
		a.at === b.at ? b.id.localeCompare(a.id) : b.at.localeCompare(a.at),
	);
}

/** Every entry loaded so far, across the pages fetched. */
export function loadedActivity(
	data: InfiniteData<{ data: ActivityEntry[] }>,
): ActivityEntry[] {
	return data.pages.flatMap((page) => page.data);
}

/**
 * The count for the top bar, from meta.total: "12 entries", or under a
 * filter "3 entries match", since total then counts only what the filters keep.
 */
export function activityCountLabel(total: number, filtered: boolean): string {
	if (!filtered) return total === 1 ? "1 entry" : `${total} entries`;
	return total === 1 ? "1 entry matches" : `${total} entries match`;
}
