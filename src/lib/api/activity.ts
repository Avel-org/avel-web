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
