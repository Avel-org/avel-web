import {
	type InfiniteData,
	infiniteQueryOptions,
	queryOptions,
	useInfiniteQuery,
	useQuery,
} from "@tanstack/react-query";
import {
	type AgentTemplate,
	contract,
	type PageMeta,
	type Role,
	type SkillListItem,
	type SkillSource,
	type SkillSourceKind,
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
