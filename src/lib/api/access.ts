import { queryOptions, useQuery } from "@tanstack/react-query";
import {
	type AccessOverride,
	type AgentAccess,
	type AgentRosterEntry,
	contract,
	type GrantRow,
} from "avel-server/contract";
import { type ApiClient, call } from "./client";
import { queryKeys } from "./keys";
import { useApiClient } from "./provider";
import { useUpdateRosterEntry } from "./roster";

/*
 * An agent's access (DATA-CONTRACTS-V2.md, Access): derived on the server by
 * accessFor, never computed here, so the page cannot disagree with it. Two
 * reads: the template's own, from its roles alone, and one roster entry's on
 * its mission, with the mission's skills and the entry's overrides. Nothing
 * is enforced until module 7, and every surface says so.
 */

export function templateAccessQuery(api: ApiClient, templateId: string) {
	return queryOptions({
		queryKey: queryKeys.catalog.agentAccess(templateId),
		queryFn: () =>
			call(contract.agentTemplates.access, () =>
				api.agentTemplates.access({ params: { id: templateId } }),
			),
	});
}

export function useTemplateAccess(templateId: string) {
	return useQuery(templateAccessQuery(useApiClient(), templateId));
}

export function entryAccessQuery(
	api: ApiClient,
	missionId: string,
	entryId: string,
) {
	return queryOptions({
		queryKey: queryKeys.roster.access(missionId, entryId),
		queryFn: () =>
			call(contract.roster.access, () =>
				api.roster.access({ params: { missionId, entryId } }),
			),
	});
}

export function useEntryAccess(missionId: string, entryId: string) {
	return useQuery(entryAccessQuery(useApiClient(), missionId, entryId));
}

/**
 * The access the Tools tab shows: one roster entry's on its mission when one
 * is chosen, else the template's own. One read, so the tab's count and its
 * table never disagree. The other read stays idle.
 */
export function useShownAccess(
	templateId: string,
	entry: Pick<AgentRosterEntry, "missionId" | "entryId"> | undefined,
) {
	const api = useApiClient();
	const own = useQuery({
		...templateAccessQuery(api, templateId),
		enabled: entry === undefined,
	});
	const onMission = useQuery({
		...entryAccessQuery(api, entry?.missionId ?? "", entry?.entryId ?? ""),
		enabled: entry !== undefined,
	});
	return entry === undefined ? own : onMission;
}

export function templateRosterEntriesQuery(api: ApiClient, templateId: string) {
	return queryOptions({
		queryKey: queryKeys.roster.byTemplate(templateId),
		queryFn: () =>
			call(contract.agentTemplates.rosterEntries, () =>
				api.agentTemplates.rosterEntries({ params: { id: templateId } }),
			),
	});
}

/** Where this template sits: its live entries on live missions, newest first. */
export function useTemplateRosterEntries(templateId: string) {
	return useQuery(templateRosterEntriesQuery(useApiClient(), templateId));
}

/**
 * Writes one entry's overrides, the whole list at once. The roster write
 * settles the roster's key, which the entry's access sits under, so the
 * table reads the server's answer again.
 */
export function useSetAccessOverrides(missionId: string) {
	const update = useUpdateRosterEntry(missionId);
	return {
		...update,
		set: (entryId: string, overrides: readonly AccessOverride[]) =>
			update.mutate({
				entryId,
				patch: {
					accessOverrides: overrides.length === 0 ? null : [...overrides],
				},
			}),
	};
}

// Pure functions below: no React, no network, so they are tested directly.

/**
 * The overrides an entry holds now, as the access read reports them. Stale
 * ones are left out: the server refuses an override that names no row, so
 * the next write drops them.
 */
export function overridesOf(access: AgentAccess): AccessOverride[] {
	return access.rows.flatMap((row): AccessOverride[] =>
		// An override only narrows, so a row away from its derived mode is
		// held at none or read.
		row.kind === "grant" &&
		row.mode !== row.derivedMode &&
		row.mode !== "write_held"
			? [{ skillId: row.skillId, grant: row.grant, mode: row.mode }]
			: [],
	);
}

const sameRow = (a: AccessOverride, row: GrantRow) =>
	a.skillId === row.skillId && a.grant === row.grant;

/**
 * The override list after one row is set to `mode`. Back to its derived mode
 * drops the row's override, since an override only ever narrows. A mode that
 * would widen is never sent: the server refuses it, and so does this.
 */
export function withRowMode(
	current: readonly AccessOverride[],
	row: GrantRow,
	mode: GrantRow["mode"],
): AccessOverride[] {
	const rest = current.filter((o) => !sameRow(o, row));
	if (mode === row.derivedMode) return rest;
	if (mode === "write_held") return rest;
	return [...rest, { skillId: row.skillId, grant: row.grant, mode }];
}
