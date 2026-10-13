import { queryOptions, useQuery } from "@tanstack/react-query";
import {
	contract,
	type StartingState,
	type Template,
	type TemplateScope,
} from "avel-server/contract";
import { type ApiClient, call } from "./client";
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

/** A commit as the board shows it: its first eight characters. */
export function shortSha(sha: string): string {
	return sha.slice(0, 8);
}

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
