import { queryOptions } from "@tanstack/react-query";
import {
	type AgentTemplate,
	type CoherenceInput,
	type CoherenceResult,
	contract,
	type MissionDetail,
	type Preset,
	type PresetAgent,
	type RosterEntry,
	resolveWritablePaths,
} from "avel-server/contract";
import { type ApiClient, call } from "./client";
import { queryKeys } from "./keys";

/*
 * What computeCoherence reads for one mission (contract/shared/coherence.ts):
 * the mission's cut, and each roster entry with its template's kind and
 * roles and its resolved writable paths. The function itself is the
 * contract's; nothing here decides coherence.
 */

export function rosterQuery(api: ApiClient, missionId: string) {
	return queryOptions({
		queryKey: queryKeys.roster.list(missionId),
		queryFn: () =>
			call(contract.roster.list, () =>
				api.roster.list({ params: { missionId } }),
			),
	});
}

export function templateQuery(api: ApiClient, id: string) {
	return queryOptions({
		queryKey: queryKeys.roster.template(id),
		queryFn: () =>
			call(contract.agentTemplates.get, () =>
				api.agentTemplates.get({ params: { id } }),
			),
	});
}

/**
 * The templates whose paths the roster inherits: only entries with no
 * override of their own need one, each template once.
 */
export function inheritedTemplateIds(roster: readonly RosterEntry[]): string[] {
	return [
		...new Set(
			roster
				.filter((entry) => entry.writablePaths === null)
				.map((entry) => entry.agentTemplate.id),
		),
	];
}

/**
 * The contract's CoherenceInput, from the roster and the templates it
 * inherits paths from. Paths resolve through the contract's
 * resolveWritablePaths, never a merge of our own. Null while a template an
 * entry inherits from is not loaded.
 */
export function coherenceInputFor(
	cut: MissionDetail["cut"],
	roster: readonly RosterEntry[],
	templates: ReadonlyMap<string, Pick<AgentTemplate, "writablePaths">>,
): CoherenceInput | null {
	const entries: CoherenceInput["roster"] = [];
	for (const entry of roster) {
		// An entry with its own paths never reads the template's, so it needs
		// none loaded; the empty stand-in is never returned.
		const template =
			entry.writablePaths === null
				? templates.get(entry.agentTemplate.id)
				: { writablePaths: [] };
		if (!template) return null;
		const writablePaths = resolveWritablePaths(entry, template);
		entries.push({
			id: entry.id,
			active: entry.active,
			waves: entry.waves,
			kind: entry.agentTemplate.kind,
			roles: entry.agentTemplate.roles,
			writablePaths,
		});
	}
	return { cut, roster: entries };
}

/**
 * A preset as if it were a mission's roster: every agent active, in its
 * saved waves, with its template's kind and roles and its resolved paths,
 * under the preset's cut. Run through computeCoherence against a playbook,
 * this is the client-side form of avel-server's preset_misses_first_wave.
 *
 * With `onto`, it is the roster after applying the preset to a mission: the
 * preset's agents after the mission's current entries, or in place of them
 * when `replace`, under the mission's cut. Null while a template is not
 * loaded: there is nothing to read its kind and roles from.
 */
export function presetCoherenceInput(
	preset: { cut: Preset["cut"]; agents: readonly PresetAgent[] },
	templates: ReadonlyMap<
		string,
		Pick<AgentTemplate, "kind" | "roles" | "writablePaths">
	>,
	onto?: { before: CoherenceInput; replace: boolean },
): CoherenceInput | null {
	const roster: CoherenceInput["roster"] = [];
	for (const agent of preset.agents) {
		const template = templates.get(agent.agentTemplateId);
		if (!template) return null;
		roster.push({
			// A preset agent has no entry id; its template's stands in.
			id: agent.agentTemplateId,
			active: true,
			waves: agent.waves,
			kind: template.kind,
			roles: template.roles,
			writablePaths: resolveWritablePaths(agent, template),
		});
	}
	if (!onto) return { cut: preset.cut, roster };
	return {
		cut: onto.before.cut,
		roster: [...(onto.replace ? [] : onto.before.roster), ...roster],
	};
}

/** A coherence result in one word: blocked, warned, or clear. */
export function verdictOf(result: CoherenceResult): "block" | "warn" | "clear" {
	if (result.block) return "block";
	return result.warnings.length > 0 ? "warn" : "clear";
}
