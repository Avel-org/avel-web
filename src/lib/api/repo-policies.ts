import {
	type InfiniteData,
	infiniteQueryOptions,
	type QueryClient,
	useInfiniteQuery,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import {
	contract,
	type RepoPolicy,
	type setRepoPolicyBody,
} from "avel-server/contract";
import type { z } from "zod";
import { type ApiClient, call, callPage } from "./client";
import { queryKeys } from "./keys";
import { useApiClient } from "./provider";

/*
 * Repository policies (module 11, 2026-10-24): what each repository allows.
 * A repository with no policy allows no direct push to its default branch,
 * so the safe behaviour needs no setup and only the permissive one is a
 * row. Set creates or updates by repository; there is no delete.
 */

export const REPO_POLICIES_PAGE_SIZE = 50;

export type RepoPoliciesPage = Awaited<
	ReturnType<typeof fetchRepoPoliciesPage>
>;

function fetchRepoPoliciesPage(api: ApiClient, cursor: string | undefined) {
	return callPage(contract.repoPolicies.list, () =>
		api.repoPolicies.list({
			query: {
				limit: REPO_POLICIES_PAGE_SIZE,
				...(cursor ? { cursor } : {}),
			},
		}),
	);
}

/** contract.repoPolicies.list, newest first, a page at a time. */
export function repoPoliciesQuery(api: ApiClient) {
	return infiniteQueryOptions({
		queryKey: queryKeys.repoPolicies.list(REPO_POLICIES_PAGE_SIZE),
		queryFn: ({ pageParam }) => fetchRepoPoliciesPage(api, pageParam),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
	});
}

export function useRepoPolicies() {
	return useInfiniteQuery(repoPoliciesQuery(useApiClient()));
}

export function loadedRepoPolicies(
	data: InfiniteData<RepoPoliciesPage> | undefined,
): RepoPolicy[] {
	return data?.pages.flatMap((page) => page.data) ?? [];
}

/**
 * A GitHub repository URL as the server stores it: https://github.com/
 * owner/repo, lowercased, with no trailing slash or .git. Null for anything
 * that is not a GitHub repository.
 */
export function normalizeRepoUrl(url: string): string | null {
	const m =
		/^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/.exec(
			url.trim(),
		);
	return m ? `https://github.com/${m[1]}/${m[2]}`.toLowerCase() : null;
}

/** The loaded policy for a repository, or null when it has none. */
export function policyFor(
	policies: readonly RepoPolicy[],
	repoUrl: string | null | undefined,
): RepoPolicy | null {
	const key = repoUrl ? normalizeRepoUrl(repoUrl) : null;
	if (key === null) return null;
	return policies.find((p) => normalizeRepoUrl(p.repoUrl) === key) ?? null;
}

export type SetRepoPolicyBody = z.input<typeof setRepoPolicyBody>;

/** A set changes one policy and logs a row: the policies and the log read again. */
export function afterRepoPolicySet(queryClient: QueryClient) {
	return Promise.all([
		queryClient.invalidateQueries({ queryKey: queryKeys.repoPolicies.all() }),
		queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
	]);
}

/** PUT /api/repo-policies: creates or updates one repository's policy. */
export function setRepoPolicyRequest(api: ApiClient, body: SetRepoPolicyBody) {
	return call(contract.repoPolicies.set, () => api.repoPolicies.set({ body }));
}

export function useSetRepoPolicy() {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: SetRepoPolicyBody) => setRepoPolicyRequest(api, body),
		onSuccess: () => afterRepoPolicySet(queryClient),
	});
}
