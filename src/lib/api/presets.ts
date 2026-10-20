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
	type CoherenceInput,
	contract,
	createPresetBody,
	FIRM_ROLES,
	type PageMeta,
	type Preset,
	type PresetAgent,
	type PresetApplication,
	type Role,
	type updatePresetBody,
	WAVES,
	type Wave,
} from "avel-server/contract";
import type { z } from "zod";
import { type ApiClient, call, callPage } from "./client";
import { presetCoherenceInput } from "./coherence";
import { queryKeys } from "./keys";
import { useApiClient } from "./provider";

/*
 * The preset reads (module 4): a paged list, searchable by name and
 * filterable by cut, and a get by id; then create and update, typed from
 * the contract's bodies. Applying a preset is a roster write
 * (contract.roster.applyPreset) and belongs to the mission loadout.
 */

export const PRESETS_PAGE_SIZE = 50;

/** The longest search contract.presets.list accepts (searchQuery). */
export const PRESET_SEARCH_MAX = 200;

/** A preset's cut, as the contract infers it. */
export type PresetCut = Preset["cut"];

export type PresetPage = { data: Preset[]; meta: PageMeta };

/**
 * The search to send, or undefined to send none. The server answers 400 to
 * an empty or over-long `q`, so the text is trimmed, left out when empty,
 * and cut to the limit.
 */
export function presetSearchText(text: string | undefined): string | undefined {
	const trimmed = (text ?? "").trim().slice(0, PRESET_SEARCH_MAX).trim();
	return trimmed === "" ? undefined : trimmed;
}

/**
 * contract.presets.list, newest first, a page at a time. `q` searches the
 * name; `cut` keeps presets of that cut. meta.total counts the matches.
 */
export function presetsQuery(api: ApiClient, search?: string, cut?: PresetCut) {
	const q = presetSearchText(search);
	return infiniteQueryOptions({
		queryKey: queryKeys.presets.list(PRESETS_PAGE_SIZE, { q, cut }),
		queryFn: ({ pageParam }) =>
			callPage(contract.presets.list, () =>
				api.presets.list({
					query: {
						limit: PRESETS_PAGE_SIZE,
						...(q === undefined ? {} : { q }),
						...(cut === undefined ? {} : { cut }),
						...(pageParam ? { cursor: pageParam } : {}),
					},
				}),
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
	});
}

export function usePresets(search?: string, cut?: PresetCut) {
	return useInfiniteQuery(presetsQuery(useApiClient(), search, cut));
}

/**
 * contract.presets.get: the selected preset, fetched by id, so a selected
 * preset is a link whatever the list's search or paging. A preset that is
 * gone, or soft-deleted, answers 404 NOT_FOUND.
 */
export function presetQuery(api: ApiClient, id: string) {
	return queryOptions({
		queryKey: queryKeys.presets.detail(id),
		queryFn: () =>
			call(contract.presets.get, () => api.presets.get({ params: { id } })),
	});
}

export function usePreset(id: string) {
	return useQuery(presetQuery(useApiClient(), id));
}

/** Every preset loaded so far, across the pages fetched. */
export function loadedPresets(data: InfiniteData<PresetPage>): Preset[] {
	return data.pages.flatMap((page) => page.data);
}

/** "1 team", "12 teams", or as matches while a search or filter is set. */
export function presetCountLabel(total: number, filtered: boolean): string {
	if (filtered) return total === 1 ? "1 team matches" : `${total} teams match`;
	return total === 1 ? "1 team" : `${total} teams`;
}

/** "1 agent", "6 agents". */
export function agentCount(n: number): string {
	return n === 1 ? "1 agent" : `${n} agents`;
}

export const CUT_LABEL: Record<PresetCut, string> = {
	horizontal: "By layer",
	vertical: "By feature",
};

/**
 * What a preset agent's template is called. A PresetAgent carries only the
 * template's id, so the name comes from the catalog. An id the catalog does
 * not hold (a template removed since the preset was saved) is "Unknown
 * agent", with its id kept behind Copy, never shown.
 */
export type TemplateLabel =
	| { known: true; name: string; slug: string }
	| { known: false; id: string };

export function templateLabel(
	id: string,
	templates: ReadonlyMap<string, Pick<AgentTemplate, "name" | "slug">>,
): TemplateLabel {
	const template = templates.get(id);
	return template
		? { known: true, name: template.name, slug: template.slug }
		: { known: false, id };
}

// ---------------------------------------------------------------------------
// Writes.

export type CreatePresetBody = z.input<typeof createPresetBody>;
export type UpdatePresetBody = z.input<typeof updatePresetBody>;
type AgentBody = CreatePresetBody["agents"][number];

/**
 * Every preset write adds a row to the activity log (preset.created,
 * preset.updated), so the log refreshes with the lists.
 */
export function afterPresetWrite(queryClient: QueryClient) {
	return Promise.all([
		queryClient.invalidateQueries({ queryKey: queryKeys.presets.all() }),
		queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
	]);
}

/** Creates a preset at version 1, then refreshes every presets list. */
export function useCreatePreset() {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: CreatePresetBody) =>
			call(contract.presets.create, () => api.presets.create({ body })),
		onSuccess: () => afterPresetWrite(queryClient),
	});
}

/** Patches a preset, which adds 1 to its version. Send only what changed. */
export function useUpdatePreset() {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, patch }: { id: string; patch: UpdatePresetBody }) =>
			call(contract.presets.update, () =>
				api.presets.update({ params: { id }, body: patch }),
			),
		onSuccess: () => afterPresetWrite(queryClient),
	});
}

// Pure functions below: no React, no network, so they are tested directly.

/**
 * A template holding any Firm role never sits on a mission roster (422
 * template_not_rosterable), so a preset cannot offer it either.
 */
export function isRosterable(template: Pick<AgentTemplate, "roles">): boolean {
	return !template.roles.some((role) =>
		(FIRM_ROLES as readonly Role[]).includes(role),
	);
}

/** One agent as the form holds it: text for every typed field. */
export type AgentDraft = {
	agentTemplateId: string;
	waves: Wave[];
	territory: string;
	/** One path per line. */
	writablePaths: string;
	estimatedTokens: string;
};

export type PresetDraft = {
	name: string;
	description: string;
	cut: PresetCut;
	agents: AgentDraft[];
};

export function agentDraftOf(agent?: PresetAgent): AgentDraft {
	return {
		agentTemplateId: agent?.agentTemplateId ?? "",
		waves: agent?.waves ?? [],
		territory: agent?.territory ?? "",
		writablePaths: agent?.writablePaths?.join("\n") ?? "",
		estimatedTokens:
			agent?.estimatedTokens == null ? "" : String(agent.estimatedTokens),
	};
}

export function presetDraftOf(preset?: Preset): PresetDraft {
	return {
		name: preset?.name ?? "",
		description: preset?.description ?? "",
		cut: preset?.cut ?? "vertical",
		agents: (preset?.agents ?? []).map((agent) => agentDraftOf(agent)),
	};
}

/**
 * The agent as the contract takes it. Empty text is null (the template's
 * paths, no territory, no estimate). A token count that is not a number is
 * sent as NaN, so the contract's own schema refuses it with the field's copy.
 */
export function agentBodyOf(draft: AgentDraft): AgentBody {
	const tokens = draft.estimatedTokens.trim();
	const paths = draft.writablePaths
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "");
	return {
		agentTemplateId: draft.agentTemplateId,
		waves: draft.waves,
		territory: draft.territory.trim() === "" ? null : draft.territory.trim(),
		writablePaths: paths.length === 0 ? null : paths,
		estimatedTokens: tokens === "" ? null : Number(tokens),
	};
}

export function createBodyOf(draft: PresetDraft): CreatePresetBody {
	const description = draft.description.trim();
	return {
		name: draft.name.trim(),
		description: description === "" ? null : description,
		cut: draft.cut,
		agents: draft.agents.map(agentBodyOf),
	};
}

/** Where a message belongs: "name", or "agents.0.waves" for one agent's field. */
export type ProblemKey = string;

const PROBLEM_COPY: Record<string, string> = {
	name: "Give it a name of 1 to 200 characters.",
	description: "Keep the description to 500 characters, or leave it empty.",
	agentTemplateId: "Choose a template.",
	waves: "Choose at least one wave.",
	territory: "Keep the territory to 200 characters, or leave it empty.",
	writablePaths: "Give each path on its own line, up to 500 characters.",
	estimatedTokens: "Give a whole number of tokens above 0, or leave it empty.",
};

/**
 * The key of an issue's path, cut at its last named field ("name",
 * "agents.0.waves"), or null when no field of the form holds it. The preset
 * form's fieldOf.
 */
export function keyOf(path: readonly (string | number)[]): ProblemKey | null {
	for (let end = path.length - 1; end >= 0; end--) {
		const part = path[end];
		if (typeof part === "string") {
			return part in PROBLEM_COPY ? path.slice(0, end + 1).join(".") : null;
		}
	}
	return null;
}

function copyOf(key: ProblemKey): string {
	return PROBLEM_COPY[key.split(".").at(-1) ?? ""] ?? "";
}

/**
 * Copy for a refused issue. The validator's own message is for logs, never
 * shown: a field gets this form's copy, anything else a plain line, as the
 * client form does.
 */
export function presetIssueCopy(issue: {
	path: readonly (string | number)[];
}): string {
	const key = keyOf(issue.path);
	return key === null ? "A value here isn't accepted." : copyOf(key);
}

/**
 * What the contract would refuse, checked with its own createPresetBody so
 * the form and the server cannot disagree, plus the one rule the server
 * checks across agents: a template once per territory (409 CONFLICT).
 */
export function presetProblems(draft: PresetDraft): Record<ProblemKey, string> {
	const problems: Record<ProblemKey, string> = {};
	const parsed = createPresetBody.safeParse(createBodyOf(draft));
	if (!parsed.success) {
		for (const issue of parsed.error.issues) {
			const key = keyOf(issue.path);
			if (key !== null && !(key in problems)) problems[key] = copyOf(key);
		}
	}
	const seen = new Set<string>();
	draft.agents.forEach((agent, i) => {
		if (agent.agentTemplateId === "") return;
		const pair = `${agent.agentTemplateId}:${agent.territory.trim()}`;
		const key = `agents.${i}.territory`;
		if (seen.has(pair) && !(key in problems)) {
			problems[key] =
				"This template is already in the preset for this territory.";
		}
		seen.add(pair);
	});
	return problems;
}

/** An agent's fields in one fixed order, so two agents compare by value. */
function agentKey(agent: AgentBody | PresetAgent): string {
	return JSON.stringify([
		agent.agentTemplateId,
		agent.waves,
		agent.territory,
		agent.writablePaths,
		agent.estimatedTokens,
	]);
}

/**
 * Only what changed, or null when nothing did: an empty patch is a 400.
 * `agents` replaces the whole list, so it is sent whole when any agent changed.
 */
export function changedPresetFields(
	preset: Preset,
	draft: PresetDraft,
): UpdatePresetBody | null {
	const body = createBodyOf(draft);
	const patch: UpdatePresetBody = {};
	if (body.name !== preset.name) patch.name = body.name;
	const description = body.description ?? null;
	if (description !== preset.description) patch.description = description;
	if (body.cut !== preset.cut) patch.cut = body.cut;
	const agents = body.agents.map(agentKey).join();
	if (agents !== preset.agents.map(agentKey).join()) patch.agents = body.agents;
	return Object.keys(patch).length === 0 ? null : patch;
}

/** The version a save produces: every update adds 1. */
export function nextVersion(preset: Pick<Preset, "version">): number {
	return preset.version + 1;
}

// ---------------------------------------------------------------------------
// The squad board.

/**
 * A preset's agents by wave, A to E: an agent sits in every wave it works
 * in. Agents with no wave (the read shape allows none) are kept apart, so
 * nothing silently disappears from the grid.
 */
export function waveGrid(agents: readonly PresetAgent[]): {
	columns: Array<{ wave: Wave; agents: PresetAgent[] }>;
	noWave: PresetAgent[];
} {
	return {
		columns: WAVES.map((wave) => ({
			wave,
			agents: agents.filter((a) => a.waves.includes(wave)),
		})),
		noWave: agents.filter((a) => a.waves.length === 0),
	};
}

/**
 * What identifies an agent within a preset: its template and territory,
 * since a template sits at most once per territory (409 CONFLICT).
 */
export function presetAgentKey(
	agent: Pick<PresetAgent, "agentTemplateId" | "territory">,
): string {
	return `${agent.agentTemplateId}:${agent.territory ?? ""}`;
}

/** The fields compared for an agent both presets hold, in display order. */
export const DIFF_FIELDS = [
	"waves",
	"writablePaths",
	"estimatedTokens",
] as const satisfies readonly (keyof PresetAgent)[];

export type DiffField = (typeof DIFF_FIELDS)[number];

export type PresetDiff = {
	/** Agents only the first preset has. */
	onlyA: PresetAgent[];
	/** Agents only the second preset has. */
	onlyB: PresetAgent[];
	/** Agents both have, with the fields that differ. */
	changed: Array<{ a: PresetAgent; b: PresetAgent; fields: DiffField[] }>;
	/** Agents both have, alike in every compared field. */
	same: PresetAgent[];
	/** Whether the cuts differ: applying either gives a different kind of roster. */
	cutDiffers: boolean;
};

const sameValue = (x: unknown, y: unknown) =>
	JSON.stringify(x) === JSON.stringify(y);

/**
 * Two presets' squads, side by side: agents matched by template and
 * territory, then compared field by field. Order follows the first preset,
 * then the second's extras, so the diff reads like the presets do.
 */
export function presetDiff(
	a: Pick<Preset, "cut" | "agents">,
	b: Pick<Preset, "cut" | "agents">,
): PresetDiff {
	const inB = new Map(b.agents.map((agent) => [presetAgentKey(agent), agent]));
	const inA = new Set(a.agents.map(presetAgentKey));
	const diff: PresetDiff = {
		onlyA: [],
		onlyB: b.agents.filter((agent) => !inA.has(presetAgentKey(agent))),
		changed: [],
		same: [],
		cutDiffers: a.cut !== b.cut,
	};
	for (const agent of a.agents) {
		const other = inB.get(presetAgentKey(agent));
		if (!other) {
			diff.onlyA.push(agent);
			continue;
		}
		const fields = DIFF_FIELDS.filter(
			(field) => !sameValue(agent[field], other[field]),
		);
		if (fields.length === 0) diff.same.push(agent);
		else diff.changed.push({ a: agent, b: other, fields });
	}
	return diff;
}

/** The last few changes to a preset: its detail's Activity tab, one page. */
export const PRESET_ACTIVITY_LIMIT = 20;

/**
 * contract.activity.list for one preset: preset.created and preset.updated
 * (entity type roster_preset). Applying a preset logs against the roster
 * entries it made (roster.preset_applied), so it is on the mission, not here.
 */
export function presetActivityQuery(api: ApiClient, id: string) {
	return queryOptions({
		queryKey: queryKeys.presets.activity(id, PRESET_ACTIVITY_LIMIT),
		queryFn: () =>
			callPage(contract.activity.list, () =>
				api.activity.list({
					query: {
						entityType: "roster_preset",
						entityId: id,
						limit: PRESET_ACTIVITY_LIMIT,
					},
				}),
			),
	});
}

export function usePresetActivity(id: string) {
	return useQuery(presetActivityQuery(useApiClient(), id));
}

// ---------------------------------------------------------------------------
// Applying a preset to a mission.

/**
 * Applies a preset to a draft mission: its agents become roster entries
 * (copy-then-edit). A roster with entries is refused (422 roster_not_empty)
 * unless `replace`, which removes them first. The mission's roster and
 * detail change, and the apply is logged, so all three refresh.
 */
export function useApplyPreset() {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			missionId,
			presetId,
			replace,
		}: {
			missionId: string;
			presetId: string;
			replace: boolean;
		}) =>
			call(contract.roster.applyPreset, () =>
				api.roster.applyPreset({
					params: { missionId },
					body: { presetId, replace },
				}),
			),
		onSuccess: (_roster, { missionId }) =>
			afterPresetApplied(queryClient, missionId),
	});
}

/** An apply changes the mission's roster and detail, and is logged. */
export function afterPresetApplied(
	queryClient: QueryClient,
	missionId: string,
) {
	return Promise.all([
		queryClient.invalidateQueries({
			queryKey: queryKeys.roster.list(missionId),
		}),
		queryClient.invalidateQueries({
			queryKey: queryKeys.missions.detail(missionId),
		}),
		queryClient.invalidateQueries({
			queryKey: queryKeys.roster.byTemplateAll(),
		}),
		queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
		queryClient.invalidateQueries({ queryKey: queryKeys.presets.all() }),
	]);
}

/** "Apply 6 agents", "Apply 1 agent": what the stepper's button does. */
export function applyLabel(n: number): string {
	return n === 1 ? "Apply 1 agent" : `Apply ${n} agents`;
}

/**
 * The CoherenceInput the roster would have after applying: the preset's
 * agents as active entries, after the current ones unless they are
 * replaced. Paths resolve through the contract's resolveWritablePaths. Null
 * when a preset agent's template is not in the catalog: there is nothing to
 * read its kind and roles from, and the server will refuse it anyway.
 */
export function appliedCoherenceInput(
	before: CoherenceInput,
	agents: readonly PresetAgent[],
	templates: ReadonlyMap<
		string,
		Pick<AgentTemplate, "kind" | "roles" | "writablePaths">
	>,
	replace: boolean,
): CoherenceInput | null {
	return presetCoherenceInput({ cut: before.cut, agents }, templates, {
		before,
		replace,
	});
}

// ---------------------------------------------------------------------------
// Moving agents between waves on the board.

/**
 * An agent's waves after its chip moves from one wave to another: `from` is
 * replaced by `to`, a wave it already works in is not repeated, and the
 * result keeps A to E order. Moving onto its own wave changes nothing.
 */
export function moveWave(waves: readonly Wave[], from: Wave, to: Wave): Wave[] {
	const next = new Set(waves.filter((w) => w !== from));
	next.add(to);
	return WAVES.filter((w) => next.has(w));
}

/** The wave beside this one, left (-1) or right (1), or null at either end. */
export function adjacentWave(wave: Wave, step: -1 | 1): Wave | null {
	return WAVES[WAVES.indexOf(wave) + step] ?? null;
}

/** An agent's waves with one more, in A to E order. */
export function addWave(waves: readonly Wave[], wave: Wave): Wave[] {
	return WAVES.filter((w) => w === wave || waves.includes(w));
}

// ---------------------------------------------------------------------------
// Where a preset was applied.

const APPLICATIONS_PAGE_SIZE = 50;

/** contract.presets.applications: newest first, a page at a time. */
export function presetApplicationsQuery(api: ApiClient, id: string) {
	return infiniteQueryOptions({
		queryKey: queryKeys.presets.presetApplications(id, APPLICATIONS_PAGE_SIZE),
		queryFn: ({ pageParam }) =>
			callPage(contract.presets.applications, () =>
				api.presets.applications({
					params: { id },
					query: {
						limit: APPLICATIONS_PAGE_SIZE,
						...(pageParam ? { cursor: pageParam } : {}),
					},
				}),
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
	});
}

export function usePresetApplications(id: string) {
	return useInfiniteQuery(presetApplicationsQuery(useApiClient(), id));
}

/**
 * The preset's version now, when an application used an older one: the
 * mission has that version's squad, not this one's. Null when current.
 */
export function staleSince(
	application: Pick<PresetApplication, "presetVersion">,
	preset: Pick<Preset, "version">,
): number | null {
	return application.presetVersion < preset.version ? preset.version : null;
}

/** The preset agents' template ids the catalog does not hold, each once. */
export function missingTemplateIds(
	agents: readonly Pick<PresetAgent, "agentTemplateId">[],
	templates: ReadonlyMap<string, unknown>,
): string[] {
	return [
		...new Set(
			agents.map((a) => a.agentTemplateId).filter((id) => !templates.has(id)),
		),
	];
}
