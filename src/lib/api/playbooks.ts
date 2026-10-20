import {
	infiniteQueryOptions,
	type QueryClient,
	queryOptions,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	type CreatePlaybookBody,
	contract,
	type Playbook,
	type UpdatePlaybookBody,
} from "avel-server/contract";
import { type CatalogPage, loadedRows } from "./catalog";
import { type ApiClient, call, callPage } from "./client";
import { queryKeys } from "./keys";
import { useApiClient } from "./provider";

/*
 * The playbooks (module 3): a paged list, the live playbook for one mission
 * type, every version it was written at, and the write that replaces it.
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

export function playbookVersionsQuery(api: ApiClient, missionType: string) {
	return queryOptions({
		queryKey: queryKeys.playbooks.versions(missionType),
		queryFn: () =>
			call(contract.playbooks.versions, () =>
				api.playbooks.versions({ params: { missionType } }),
			),
	});
}

/** Every version, newest first; just the current one when never rewritten. */
export function usePlaybookVersions(missionType: string) {
	return useQuery(playbookVersionsQuery(useApiClient(), missionType));
}

/**
 * What a write does once the server accepts it. `onSaved` runs here, in the
 * mutation's own onSuccess, never in a per-call one: writing the new version
 * into the cache re-keys the builder, which unmounts the modal that called
 * mutate(), and a per-call onSuccess dies with it. The mutation's survives.
 */
type Saved = { onSaved?: (saved: Playbook) => void };

/**
 * Replaces the live playbook (a full replace; version + 1). The answer is
 * the new playbook, so it goes straight into the cache; the lists, the
 * versions and the activity log refresh.
 */
export function updatePlaybookOptions(
	api: ApiClient,
	queryClient: QueryClient,
	missionType: string,
	{ onSaved }: Saved = {},
) {
	return {
		mutationFn: (body: UpdatePlaybookBody) =>
			call(contract.playbooks.update, () =>
				api.playbooks.update({ params: { missionType }, body }),
			),
		onSuccess: (saved: Playbook) => {
			onSaved?.(saved);
			queryClient.setQueryData(queryKeys.playbooks.byType(missionType), saved);
			return Promise.all([
				queryClient.invalidateQueries({
					queryKey: queryKeys.playbooks.lists(),
				}),
				queryClient.invalidateQueries({
					queryKey: queryKeys.playbooks.versions(missionType),
				}),
				...afterPlaybookShown(queryClient),
				queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
			]);
		},
	};
}

export function useUpdatePlaybook(missionType: string, saved: Saved = {}) {
	return useMutation(
		updatePlaybookOptions(useApiClient(), useQueryClient(), missionType, saved),
	);
}

/**
 * Creates a playbook (version 1). A live one for the same mission type is
 * 409 CONFLICT. The new playbook goes into its type's cache, so its builder
 * opens on it without another read.
 */
export function createPlaybookOptions(
	api: ApiClient,
	queryClient: QueryClient,
	{ onSaved }: Saved = {},
) {
	return {
		mutationFn: (body: CreatePlaybookBody) =>
			call(contract.playbooks.create, () => api.playbooks.create({ body })),
		onSuccess: (saved: Playbook) => {
			onSaved?.(saved);
			queryClient.setQueryData(
				queryKeys.playbooks.byType(saved.missionType),
				saved,
			);
			return Promise.all([
				queryClient.invalidateQueries({
					queryKey: queryKeys.playbooks.lists(),
				}),
				queryClient.invalidateQueries({
					queryKey: queryKeys.playbooks.versions(saved.missionType),
				}),
				...afterPlaybookShown(queryClient),
				queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
			]);
		},
	};
}

/**
 * Where a playbook shows beyond its own pages: a mission's detail names it
 * and its readiness checks it, and the templates show it (audit F2).
 */
function afterPlaybookShown(queryClient: QueryClient) {
	return [
		queryClient.invalidateQueries({ queryKey: queryKeys.missions.all() }),
		queryClient.invalidateQueries({ queryKey: queryKeys.templates.all() }),
	];
}

export function useCreatePlaybook(saved: Saved = {}) {
	return useMutation(
		createPlaybookOptions(useApiClient(), useQueryClient(), saved),
	);
}
