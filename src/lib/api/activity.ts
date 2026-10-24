import {
	type InfiniteData,
	infiniteQueryOptions,
	useInfiniteQuery,
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
	/** One mission's rows: its page's Full log. */
	missionId?: string;
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
		...(filters.missionId === undefined
			? {}
			: { missionId: filters.missionId }),
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

/** How many of an agent's latest entries its page shows, and loads at a time. */
export const AGENT_ACTIVITY_LIMIT = 8;

/** How many entries a client's Activity tab loads at a time. */
export const CLIENT_ACTIVITY_PAGE_SIZE = 20;

/** The most ids one `entityId` filter takes (the contract's limit). */
export const MAX_ENTITY_IDS = 100;

/** The next page's cursor, or undefined at the end of the list. */
const nextCursor = (last: { meta: { nextCursor?: string | null } }) =>
	last.meta.nextCursor ?? undefined;

/**
 * contract.activity.list for several entities of one type, newest first, a
 * page at a time: one request for all of them, `entityId` sent as a list
 * (ts-rest writes it indexed, entityId[0]=…&entityId[1]=…, which the server
 * reads as the repeated form). The ids are sorted, so the key and the
 * request read the same list, and capped at the contract's 100.
 */
export function entitiesActivityQuery(
	api: ApiClient,
	entityType: ActivityEntityType,
	entityIds: readonly string[],
	limit = AGENT_ACTIVITY_LIMIT,
) {
	const ids = [...entityIds].sort().slice(0, MAX_ENTITY_IDS);
	return infiniteQueryOptions({
		queryKey: queryKeys.activity.entities(entityType, ids, limit),
		queryFn: ({ pageParam }) =>
			callPage(contract.activity.list, () =>
				api.activity.list({
					query: {
						limit,
						entityType,
						entityId: ids,
						...(pageParam ? { cursor: pageParam } : {}),
					},
				}),
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: nextCursor,
		// No ids, no rows: an empty list is not sent, since the server would
		// read it as no filter at all.
		enabled: ids.length > 0,
	});
}

/** An agent's roster entries' activity, one read for all of them. */
export function useEntriesActivity(entryIds: readonly string[]) {
	return useInfiniteQuery(
		entitiesActivityQuery(useApiClient(), "roster_entry", entryIds),
	);
}

/**
 * contract.activity.list for one client, newest first, a page at a time:
 * the rows on the client, its engagements and their missions, the same rows
 * Client.lastActivityAt reads.
 */
export function clientActivityQuery(api: ApiClient, clientId: string) {
	return infiniteQueryOptions({
		queryKey: queryKeys.activity.client(clientId, CLIENT_ACTIVITY_PAGE_SIZE),
		queryFn: ({ pageParam }) =>
			callPage(contract.activity.list, () =>
				api.activity.list({
					query: {
						limit: CLIENT_ACTIVITY_PAGE_SIZE,
						clientId,
						...(pageParam ? { cursor: pageParam } : {}),
					},
				}),
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: nextCursor,
	});
}

export function useClientActivity(clientId: string) {
	return useInfiniteQuery(clientActivityQuery(useApiClient(), clientId));
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
