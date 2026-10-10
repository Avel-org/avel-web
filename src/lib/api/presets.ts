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
	createPresetBody,
	FIRM_ROLES,
	type PageMeta,
	type Preset,
	type PresetAgent,
	type Role,
	type updatePresetBody,
	type Wave,
} from "avel-server/contract";
import type { z } from "zod";
import { type ApiClient, call, callPage } from "./client";
import { ApiError } from "./errors";
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

/** "1 preset", "12 presets", or as matches while a search or filter is set. */
export function presetCountLabel(total: number, filtered: boolean): string {
	if (filtered)
		return total === 1 ? "1 preset matches" : `${total} presets match`;
	return total === 1 ? "1 preset" : `${total} presets`;
}

/** "1 agent", "6 agents". */
export function agentCount(n: number): string {
	return n === 1 ? "1 agent" : `${n} agents`;
}

export const CUT_LABEL: Record<PresetCut, string> = {
	horizontal: "Horizontal",
	vertical: "Vertical",
};

/** The first group of a uuid: enough to tell rows apart, never the whole id. */
export function shortId(id: string): string {
	return id.slice(0, 8);
}

/**
 * What a preset agent's template is called. A PresetAgent carries only the
 * template's id, so the name comes from the catalog. An id the catalog does
 * not hold (a template removed since the preset was saved) is "Unknown
 * template" with its short id, never a bare uuid.
 */
export type TemplateLabel =
	| { known: true; name: string; slug: string }
	| { known: false; shortId: string };

export function templateLabel(
	id: string,
	templates: ReadonlyMap<string, Pick<AgentTemplate, "name" | "slug">>,
): TemplateLabel {
	const template = templates.get(id);
	return template
		? { known: true, name: template.name, slug: template.slug }
		: { known: false, shortId: shortId(id) };
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
function invalidatePresets(queryClient: ReturnType<typeof useQueryClient>) {
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
		onSuccess: () => invalidatePresets(queryClient),
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
		onSuccess: () => invalidatePresets(queryClient),
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

/** The key of an issue's path, cut at its last named field, or null. */
function keyOf(path: readonly (string | number)[]): ProblemKey | null {
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

/** Field problems the server answered with (400 VALIDATION_FAILED). */
export function presetFieldErrors(error: unknown): Record<ProblemKey, string> {
	if (!(error instanceof ApiError)) return {};
	const { failure } = error;
	if (failure.kind !== "contract" || failure.code !== "VALIDATION_FAILED") {
		return {};
	}
	const errors: Record<ProblemKey, string> = {};
	for (const issue of failure.details?.body ?? []) {
		const key = keyOf(issue.path);
		if (key !== null) errors[key] = copyOf(key);
	}
	return errors;
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
