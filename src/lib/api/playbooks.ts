import {
	infiniteQueryOptions,
	queryOptions,
	useInfiniteQuery,
	useQuery,
} from "@tanstack/react-query";
import { contract, type Playbook } from "avel-server/contract";
import { type CatalogPage, loadedRows } from "./catalog";
import { type ApiClient, call, callPage } from "./client";
import { queryKeys } from "./keys";
import { useApiClient } from "./provider";

/*
 * The playbook reads (module 3): a paged list, and the live playbook for one
 * mission type. Read-only: playbook writes are not specced.
 */

/** The contract's largest page: there is one playbook per mission type, so few. */
export const PLAYBOOK_PAGE_SIZE = 100;

export type PlaybookPage = CatalogPage<Playbook>;

/** Every playbook loaded so far, across the pages fetched. */
export const loadedPlaybooks = loadedRows<Playbook>;

export function playbooksQuery(api: ApiClient) {
	return infiniteQueryOptions({
		queryKey: queryKeys.playbooks.list(PLAYBOOK_PAGE_SIZE),
		queryFn: ({ pageParam }) =>
			callPage(contract.playbooks.list, () =>
				api.playbooks.list({
					query: {
						limit: PLAYBOOK_PAGE_SIZE,
						...(pageParam ? { cursor: pageParam } : {}),
					},
				}),
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last: PlaybookPage) => last.meta.nextCursor ?? undefined,
	});
}

export function usePlaybooks() {
	return useInfiniteQuery(playbooksQuery(useApiClient()));
}

export function playbookQuery(api: ApiClient, missionType: string) {
	return queryOptions({
		queryKey: queryKeys.playbooks.byType(missionType),
		queryFn: () =>
			call(contract.playbooks.getForType, () =>
				api.playbooks.getForType({ params: { missionType } }),
			),
	});
}

/** The live playbook for a mission type; a type with none answers NOT_FOUND. */
export function usePlaybook(missionType: string) {
	return useQuery(playbookQuery(useApiClient(), missionType));
}
