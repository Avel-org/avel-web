import {
	type InfiniteData,
	infiniteQueryOptions,
	queryOptions,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	type AgentTemplate,
	contract,
	createSkillSourceBody,
	type PageMeta,
	type Role,
	type SkillLayer,
	type SkillListItem,
	type SkillSource,
	type SkillSourceKind,
	type updateSkillSourceBody,
} from "avel-server/contract";
import type { z } from "zod";
import { type ApiClient, call, callPage } from "./client";
import type { ApiError } from "./errors";
import { queryKeys } from "./keys";
import { useApiClient } from "./provider";

/*
 * The catalog (module 4): agent templates, skills and skill sources, each a
 * paged list plus a get by slug, and the skill source writes (create,
 * update, remove), which the sources shelf uses.
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

/**
 * How many sources of one kind there are: one row of contract.skillSources.list
 * for its meta.total, the count on the shelf's kind tab.
 */
export function skillSourceCountQuery(api: ApiClient, kind: SkillSourceKind) {
	return queryOptions({
		queryKey: queryKeys.catalog.skillSourceCount(kind),
		queryFn: async () => {
			const page = await callPage(contract.skillSources.list, () =>
				api.skillSources.list({ query: { kind, limit: 1 } }),
			);
			return page.meta.total ?? null;
		},
	});
}

export function useSkillSourceCount(kind: SkillSourceKind) {
	return useQuery(skillSourceCountQuery(useApiClient(), kind));
}

/**
 * How many of one source's skills sit in one layer: one row of
 * contract.skills.list for its meta.total, a segment of the layer bar.
 */
export function sourceLayerCountQuery(
	api: ApiClient,
	sourceId: string,
	layer: SkillLayer,
) {
	return queryOptions({
		queryKey: queryKeys.catalog.sourceLayerCount(sourceId, layer),
		queryFn: async () => {
			const page = await callPage(contract.skills.list, () =>
				api.skills.list({ query: { sourceId, layer, limit: 1 } }),
			);
			return page.meta.total ?? null;
		},
	});
}

export function useSourceLayerCount(sourceId: string, layer: SkillLayer) {
	return useQuery(sourceLayerCountQuery(useApiClient(), sourceId, layer));
}

/** contract.skills.list for one source: its detail's chips, a page at a time. */
export function sourceSkillsQuery(api: ApiClient, sourceId: string) {
	return infiniteQueryOptions({
		queryKey: queryKeys.catalog.sourceSkills(sourceId, CATALOG_PAGE_SIZE),
		queryFn: ({ pageParam }) =>
			callPage(contract.skills.list, () =>
				api.skills.list({
					query: {
						sourceId,
						limit: CATALOG_PAGE_SIZE,
						...(pageParam ? { cursor: pageParam } : {}),
					},
				}),
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: nextCursor<SkillListItem>,
	});
}

export function useSourceSkills(sourceId: string) {
	return useInfiniteQuery(sourceSkillsQuery(useApiClient(), sourceId));
}

// ---------------------------------------------------------------------------
// Skill source writes. Each one logs to the activity log and changes the
// catalog's counts, so both refresh.

export type CreateSkillSourceBody = z.input<typeof createSkillSourceBody>;
export type UpdateSkillSourceBody = z.input<typeof updateSkillSourceBody>;

function useCatalogWrite() {
	const queryClient = useQueryClient();
	return () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all() }),
			queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
		]);
}

export function useCreateSkillSource() {
	const api = useApiClient();
	const refresh = useCatalogWrite();
	return useMutation({
		mutationFn: (body: CreateSkillSourceBody) =>
			call(contract.skillSources.create, () =>
				api.skillSources.create({ body }),
			),
		onSuccess: refresh,
	});
}

/** Patches a source. Send only what changed: an empty patch is a 400. */
export function useUpdateSkillSource() {
	const api = useApiClient();
	const refresh = useCatalogWrite();
	return useMutation({
		mutationFn: ({ id, patch }: { id: string; patch: UpdateSkillSourceBody }) =>
			call(contract.skillSources.update, () =>
				api.skillSources.update({ params: { id }, body: patch }),
			),
		onSuccess: refresh,
	});
}

/**
 * Removes a source. The server refuses while any live skill comes from it
 * (422 skill_source_in_use); it never deletes or moves the skills.
 */
export function useRemoveSkillSource() {
	const api = useApiClient();
	const refresh = useCatalogWrite();
	return useMutation({
		mutationFn: (id: string) =>
			call(contract.skillSources.remove, () =>
				api.skillSources.remove({ params: { id } }),
			),
		onSuccess: refresh,
	});
}

// Pure functions below: no React, no network, so they are tested directly.

/** A source as the form holds it: text for every field. */
export type SourceDraft = {
	name: string;
	kind: SkillSourceKind;
	url: string;
	license: string;
};

export function sourceDraftOf(source?: SkillSource): SourceDraft {
	return {
		name: source?.name ?? "",
		kind: source?.kind ?? "vendor",
		url: source?.url ?? "",
		license: source?.license ?? "",
	};
}

/** The create body: trimmed, an empty URL or license sent as null. */
export function sourceBodyOf(draft: SourceDraft): CreateSkillSourceBody {
	const url = draft.url.trim();
	const license = draft.license.trim();
	return {
		name: draft.name.trim(),
		kind: draft.kind,
		url: url === "" ? null : url,
		license: license === "" ? null : license,
	};
}

/** Only what changed, or null when nothing did. */
export function changedSourceFields(
	source: SkillSource,
	draft: SourceDraft,
): UpdateSkillSourceBody | null {
	const body = sourceBodyOf(draft);
	const patch: UpdateSkillSourceBody = {};
	if (body.name !== source.name) patch.name = body.name;
	if (body.kind !== source.kind) patch.kind = body.kind;
	if ((body.url ?? null) !== source.url) patch.url = body.url ?? null;
	if ((body.license ?? null) !== source.license) {
		patch.license = body.license ?? null;
	}
	return Object.keys(patch).length === 0 ? null : patch;
}

const SOURCE_FIELD_COPY: Record<keyof SourceDraft, string> = {
	name: "Give it a name of 1 to 200 characters.",
	kind: "Choose internal, vendor or community.",
	url: "Give a full web address, such as https://example.com, or leave it empty.",
	license: "Keep the license to 200 characters, or leave it empty.",
};

/** The field an issue is on, when it is one of the form's. */
export function sourceFieldOf(
	path: readonly (string | number)[],
): keyof SourceDraft | null {
	const field = path[0];
	return typeof field === "string" && field in SOURCE_FIELD_COPY
		? (field as keyof SourceDraft)
		: null;
}

/** Copy for a refused field; anything else a plain line. */
export function sourceIssueCopy(issue: {
	path: readonly (string | number)[];
}): string {
	const field = sourceFieldOf(issue.path);
	return field === null
		? "A value here isn't accepted."
		: SOURCE_FIELD_COPY[field];
}

/** What the contract's own body refuses, by field, before sending. */
export function sourceProblems(
	draft: SourceDraft,
): Partial<Record<keyof SourceDraft, string>> {
	const parsed = createSkillSourceBody.safeParse(sourceBodyOf(draft));
	if (parsed.success) return {};
	const problems: Partial<Record<keyof SourceDraft, string>> = {};
	for (const issue of parsed.error.issues) {
		const field = sourceFieldOf(issue.path);
		if (field !== null) problems[field] ??= SOURCE_FIELD_COPY[field];
	}
	return problems;
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
