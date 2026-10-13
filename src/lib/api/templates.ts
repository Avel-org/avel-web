import {
	infiniteQueryOptions,
	queryOptions,
	useInfiniteQuery,
	useQuery,
} from "@tanstack/react-query";
import {
	contract,
	type MissionListItem,
	type StartingState,
	type Template,
	type TemplateScope,
} from "avel-server/contract";
import { type ApiClient, call, callPage } from "./client";
import { queryKeys } from "./keys";
import { useApiClient } from "./provider";

/*
 * AVEL project templates: the repositories a mission is built from. Read
 * from each repository by avel-server; no table holds them. The list is
 * unpaginated, since the allowlist is configuration under source control.
 */

export function templatesQuery(api: ApiClient) {
	return queryOptions({
		queryKey: queryKeys.templates.list(),
		queryFn: () => call(contract.templates.list, () => api.templates.list()),
	});
}

/** Every template in the allowlist, in allowlist order. */
export function useTemplates() {
	return useQuery(templatesQuery(useApiClient()));
}

export function templateQuery(api: ApiClient, slug: string) {
	return queryOptions({
		queryKey: queryKeys.templates.detail(slug),
		queryFn: () =>
			call(contract.templates.get, () =>
				api.templates.get({ params: { slug } }),
			),
	});
}

/** One template; a slug outside the allowlist answers NOT_FOUND. */
export function useTemplate(slug: string) {
	return useQuery(templateQuery(useApiClient(), slug));
}

/** Each scope in words. Keyed on the contract's enum. */
export const SCOPE_LABEL = {
	"full-stack": "Full stack",
	frontend: "Frontend",
	backend: "Backend",
	integration: "Integration",
	data: "Data",
	automation: "Automation",
	migration: "Migration",
	audit: "Audit",
} as const satisfies Record<TemplateScope, string>;

/** Each starting state in words. Keyed on the contract's enum. */
export const STARTING_STATE_LABEL = {
	greenfield: "Greenfield",
	brownfield: "Brownfield",
} as const satisfies Record<StartingState, string>;

/** The template's own name, or its slug when the manifest could not be read. */
export function templateName(template: Pick<Template, "name" | "slug">) {
	return template.name ?? template.slug;
}

/** "1 template", "3 templates". */
export function templateCountLabel(total: number): string {
	return total === 1 ? "1 template" : `${total} templates`;
}

/** "No missions", "1 mission", "4 missions". */
export function missionCountLabel(n: number): string {
	if (n === 0) return "No missions";
	return n === 1 ? "1 mission" : `${n} missions`;
}

/** Each scope in one sentence, from docs/TEMPLATES.md, The eight scopes. */
export const SCOPE_SUMMARY = {
	"full-stack": "Schema through UI.",
	frontend: "A UI over an API the client already has.",
	backend: "Contract first, with no UI. The contract is the deliverable.",
	integration: "Connects systems that already exist.",
	data: "Pipelines, reporting and dashboards over existing data.",
	automation: "Scheduled jobs, workflows and triggers.",
	migration:
		"Moves one system to another, with proof the data arrived complete.",
	audit: "A condition report. It produces no code.",
} as const satisfies Record<TemplateScope, string>;

/** What a starting state means for the repository a mission starts in. */
export const STARTING_STATE_SENTENCE = {
	greenfield: "Starts from an empty repository.",
	brownfield: "Starts from an existing codebase.",
} as const satisfies Record<StartingState, string>;

// ---------------------------------------------------------------------------
// The missions built from one template: missions.list scoped by templateRef
// (avel-server ed4c9e5), one list per origin, since origin is required and
// the two are never listed together. Keyed under "missions", so a mission
// write that invalidates every mission query reads these again.

/** A mission's origin: the list route requires one. */
export type MissionOrigin = MissionListItem["origin"];

/** How many missions a template's page lists per origin before Load more. */
export const TEMPLATE_MISSIONS_PAGE = 20;

export const templateMissionKeys = {
	list: (slug: string, origin: MissionOrigin) =>
		[
			"missions",
			"byTemplate",
			slug,
			{ origin, limit: TEMPLATE_MISSIONS_PAGE },
		] as const,
} as const;

/**
 * One origin's missions built from this template, most recent activity
 * first (the list's default sort), paged by cursor. meta.total is the
 * count, the same on every page.
 */
export function templateMissionsQuery(
	api: ApiClient,
	slug: string,
	origin: MissionOrigin,
) {
	return infiniteQueryOptions({
		queryKey: templateMissionKeys.list(slug, origin),
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) =>
			callPage(contract.missions.list, () =>
				api.missions.list({
					query: {
						origin,
						templateRef: slug,
						sort: "lastActivity",
						// templates.missionCount counts archived missions too, so the lists do.
						includeArchived: "true",
						limit: TEMPLATE_MISSIONS_PAGE,
						cursor: pageParam,
					},
				}),
			),
		getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
	});
}

export function useTemplateMissions(slug: string, origin: MissionOrigin) {
	return useInfiniteQuery(templateMissionsQuery(useApiClient(), slug, origin));
}
