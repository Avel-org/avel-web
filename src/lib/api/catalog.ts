import {
	type InfiniteData,
	infiniteQueryOptions,
	type QueryClient,
	queryOptions,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	type AgentTemplate,
	contract,
	type PageMeta,
	type Role,
	type SkillListItem,
	type SkillSource,
	type SkillSourceKind,
	type UpdateAgentTemplateBody,
} from "avel-server/contract";
import { type ApiClient, call, callPage } from "./client";
import type { ApiError } from "./errors";
import { queryKeys } from "./keys";
import { useApiClient } from "./provider";

/*
 * The catalog (module 4): agent templates, skills and skill sources, each a
 * paged list plus a get by slug.
 */

/** The contract's largest page: catalogs are short, so one page is the usual case. */
export const CATALOG_PAGE_SIZE = 100;

export type CatalogPage<T> = { data: T[]; meta: PageMeta };

/** Every row loaded so far, across the pages fetched. */
export function loadedRows<T>(data: InfiniteData<CatalogPage<T>>): T[] {
	return data.pages.flatMap((page) => page.data);
}

/** meta.total from the first page, when the server counted. */
export function catalogTotal<T>(
	data: InfiniteData<CatalogPage<T>> | undefined,
): number | undefined {
	return data?.pages[0]?.meta.total;
}

const nextCursor = <T>(last: CatalogPage<T>) =>
	last.meta.nextCursor ?? undefined;

// ---------------------------------------------------------------------------
// Agent templates.

export function agentTemplatesQuery(api: ApiClient, role?: readonly Role[]) {
	return infiniteQueryOptions({
		queryKey: queryKeys.catalog.agentTemplates(CATALOG_PAGE_SIZE, role),
		queryFn: ({ pageParam }) =>
			callPage(contract.agentTemplates.list, () =>
				api.agentTemplates.list({
					query: {
						limit: CATALOG_PAGE_SIZE,
						...(role === undefined ? {} : { role: [...role] }),
						...(pageParam ? { cursor: pageParam } : {}),
					},
				}),
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: nextCursor<AgentTemplate>,
	});
}

/** Every template, or with `role`, those holding any of those roles. */
export function useAgentTemplates(role?: readonly Role[]) {
	return useInfiniteQuery(agentTemplatesQuery(useApiClient(), role));
}

export function agentTemplateQuery(api: ApiClient, slug: string) {
	return queryOptions({
		queryKey: queryKeys.catalog.agentTemplate(slug),
		queryFn: () =>
			call(contract.agentTemplates.getBySlug, () =>
				api.agentTemplates.getBySlug({ params: { slug } }),
			),
	});
}

/** The live template with this slug; a stale slug answers NOT_FOUND. */
export function useAgentTemplate(slug: string) {
	return useQuery(agentTemplateQuery(useApiClient(), slug));
}

export function identityVersionQuery(
	api: ApiClient,
	id: string,
	number: number,
) {
	return queryOptions({
		queryKey: queryKeys.catalog.identityVersion(id, number),
		queryFn: () =>
			call(contract.agentTemplates.identityVersion, () =>
				api.agentTemplates.identityVersion({ params: { id, number } }),
			),
		// A version is never changed, so its text never goes stale.
		staleTime: Number.POSITIVE_INFINITY,
	});
}

/** One identity version of a template, with its text; NOT_FOUND when none has it. */
export function useIdentityVersion(id: string, number: number) {
	return useQuery(identityVersionQuery(useApiClient(), id, number));
}

export function identityVersionsQuery(api: ApiClient, id: string) {
	return queryOptions({
		queryKey: queryKeys.catalog.identityVersions(id),
		queryFn: () =>
			call(contract.agentTemplates.identityVersions, () =>
				api.agentTemplates.identityVersions({ params: { id } }),
			),
	});
}

/** A template's identity versions, newest first, without their text. */
export function useIdentityVersions(id: string) {
	return useQuery(identityVersionsQuery(useApiClient(), id));
}

/**
 * contract.identityVersions.get: one version with its text, by a full
 * sha256 or by slug@vN. A sha names one version across every template,
 * deleted ones included, so a recorded hash always resolves; slug@vN names
 * the live template's version. NOT_FOUND when nothing has it.
 */
export function identityVersionByRefQuery(api: ApiClient, ref: string) {
	return queryOptions({
		queryKey: queryKeys.catalog.identityVersionByRef(ref),
		queryFn: () =>
			call(contract.identityVersions.get, () =>
				api.identityVersions.get({ params: { ref } }),
			),
		// A version is never changed, so its text never goes stale.
		staleTime: Number.POSITIVE_INFINITY,
	});
}

/** The identity version a dispatch, report or agent page names. */
export function useIdentityVersionByRef(ref: string) {
	return useQuery(identityVersionByRefQuery(useApiClient(), ref));
}

/**
 * Regenerate a template's identity from its current inputs. Only a 201
 * (created) writes a version and an activity row, so only it refreshes the
 * template reads and the log; a 200 leaves everything as it was.
 */
export function useRegenerateIdentity() {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => regenerateIdentityRequest(api, id),
		onSuccess: (result) => afterRegenerate(queryClient, result),
	});
}

/** POST .../identity/regenerate: 201 created, or 200 unchanged or reused. */
export function regenerateIdentityRequest(api: ApiClient, id: string) {
	return call(contract.agentTemplates.regenerateIdentity, () =>
		api.agentTemplates.regenerateIdentity({ params: { id } }),
	);
}

/** Refreshes the template reads and the log, only when a version was written. */
export function afterRegenerate(
	queryClient: QueryClient,
	result: { created: boolean },
) {
	if (!result.created) return undefined;
	return Promise.all([
		queryClient.invalidateQueries({
			queryKey: queryKeys.catalog.agentTemplatesAll(),
		}),
		queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
	]);
}

// ---------------------------------------------------------------------------
// Skills.

export function skillsQuery(api: ApiClient, role?: readonly Role[]) {
	return infiniteQueryOptions({
		queryKey: queryKeys.catalog.skills(CATALOG_PAGE_SIZE, role),
		queryFn: ({ pageParam }) =>
			callPage(contract.skills.list, () =>
				api.skills.list({
					query: {
						limit: CATALOG_PAGE_SIZE,
						...(role === undefined ? {} : { role: [...role] }),
						...(pageParam ? { cursor: pageParam } : {}),
					},
				}),
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: nextCursor<SkillListItem>,
	});
}

/** Every skill, or with `role`, those recommended for any of those roles. */
export function useSkills(role?: readonly Role[]) {
	return useInfiniteQuery(skillsQuery(useApiClient(), role));
}

export function skillQuery(api: ApiClient, slug: string) {
	return queryOptions({
		queryKey: queryKeys.catalog.skill(slug),
		queryFn: () =>
			call(contract.skills.getBySlug, () =>
				api.skills.getBySlug({ params: { slug } }),
			),
	});
}

/** The live skill with this slug, with its text; a stale slug answers NOT_FOUND. */
export function useSkill(slug: string) {
	return useQuery(skillQuery(useApiClient(), slug));
}

// ---------------------------------------------------------------------------
// Skill sources.

/** contract.skillSources.list, newest first; with `kind`, that kind only. */
export function skillSourcesQuery(api: ApiClient, kind?: SkillSourceKind) {
	return infiniteQueryOptions({
		queryKey: queryKeys.catalog.skillSources(CATALOG_PAGE_SIZE, kind),
		queryFn: ({ pageParam }) =>
			callPage(contract.skillSources.list, () =>
				api.skillSources.list({
					query: {
						limit: CATALOG_PAGE_SIZE,
						...(kind === undefined ? {} : { kind }),
						...(pageParam ? { cursor: pageParam } : {}),
					},
				}),
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: nextCursor<SkillSource>,
	});
}

export function useSkillSources(kind?: SkillSourceKind) {
	return useInfiniteQuery(skillSourcesQuery(useApiClient(), kind));
}

// ---------------------------------------------------------------------------

/** A get by slug that found nothing: the link is stale, not broken. */
export function isNotFound(error: ApiError): boolean {
	return (
		error.failure.kind === "contract" && error.failure.code === "NOT_FOUND"
	);
}

/** The top bar's count from meta.total, as Clients does it. */
export function catalogCountLabel(
	total: number,
	one: string,
	many: string,
): string {
	return total === 1 ? `1 ${one}` : `${total} ${many}`;
}

// ---------------------------------------------------------------------------
// Editing an agent (module 5, step 6).

/**
 * PATCH /api/agent-templates/:id: any subset of title, description, roles,
 * waveDefaults and writablePaths. The answer is the updated template, so a
 * roles or paths change comes back with identityStale set.
 */
export function useUpdateAgentTemplate() {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			id,
			patch,
		}: {
			id: string;
			patch: UpdateAgentTemplateBody;
		}) =>
			call(contract.agentTemplates.update, () =>
				api.agentTemplates.update({ params: { id }, body: patch }),
			),
		onSuccess: () => afterAgentUpdate(queryClient),
	});
}

/**
 * Every update writes a version and an activity row, so the template reads
 * (lists, by slug, by id, access, identity versions) and the log refresh.
 * Its roles decide each roster entry's access on every mission, so those
 * read again too (audit F2).
 */
export function afterAgentUpdate(queryClient: QueryClient) {
	return Promise.all([
		queryClient.invalidateQueries({
			queryKey: queryKeys.catalog.agentTemplatesAll(),
		}),
		queryClient.invalidateQueries({
			predicate: ({ queryKey }) =>
				queryKey[0] === "missions" &&
				queryKey[1] === "roster" &&
				queryKey[3] === "access",
		}),
		queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
	]);
}
