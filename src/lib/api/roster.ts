import {
	type QueryClient,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	type AddRosterEntryBody,
	type AgentTemplate,
	contract,
	type MissionStatus,
	type RosterEntry,
	rosterEntryProblems,
	type UpdateRosterEntryBody,
	updateRosterEntryBody,
	type Wave,
} from "avel-server/contract";
import { missionKeys } from "@/components/avel/mission-data";
import { PRECONDITION_COPY } from "@/lib/error-map";
import { type ApiClient, call } from "./client";
import { rosterQuery } from "./coherence";
import type { ApiError } from "./errors";
import { queryKeys } from "./keys";
import {
	addWave,
	type CreatePresetBody,
	moveWave,
	type PresetCut,
} from "./presets";
import { useApiClient } from "./provider";

/*
 * The mission loadout's writes (contract.roster: add, update, remove). The
 * roster is read through coherence.ts's rosterQuery, the one cache entry the
 * coherence pane reads too, so every write here is in coherence at once.
 * Every write is refused unless the mission is a draft (422
 * mission_not_editable).
 */

/** The global phases (contract WAVES; E is Operate), named for the board. */
export const WAVE_NAME: Record<Wave, string> = {
	A: "Foundations",
	B: "Builders",
	C: "Verification",
	D: "Quality",
	E: "Operate",
};

/** "A · Foundations". */
export const waveTitle = (wave: Wave) => `${wave} · ${WAVE_NAME[wave]}`;

/** The mission's live roster, oldest first: coherence's own cache entry. */
export function useRoster(missionId: string) {
	return useQuery(rosterQuery(useApiClient(), missionId));
}

/** Why the roster cannot change, or null when it can. */
export function rosterReadOnlyReason(status: MissionStatus): string | null {
	if (status === "draft") return null;
	const copy = PRECONDITION_COPY.mission_not_editable;
	return `${copy.what} ${copy.next}`;
}

/** Every roster write for one mission shares this key, so each sees the others. */
const writeKey = (missionId: string) => ["roster", "write", missionId] as const;

/**
 * After a write: the answer goes into the cached roster, so coherence
 * recomputes with no round trip, then the mission (its Team counts) and the
 * activity log (roster.* rows) are read again, and the roster too once no
 * other write to it is in flight: a read landing between two writes would
 * show the first without the second.
 */
export function settleRosterWrite(
	queryClient: QueryClient,
	missionId: string,
	edit: (roster: RosterEntry[]) => RosterEntry[],
) {
	queryClient.setQueryData<RosterEntry[]>(
		queryKeys.roster.list(missionId),
		(roster) => (roster ? edit(roster) : roster),
	);
	// This write is still counted while it settles.
	const alone =
		queryClient.isMutating({ mutationKey: writeKey(missionId) }) <= 1;
	return Promise.all([
		alone
			? queryClient.invalidateQueries({
					queryKey: queryKeys.roster.list(missionId),
				})
			: undefined,
		queryClient.invalidateQueries({ queryKey: missionKeys.detail(missionId) }),
		queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
	]);
}

/** The roster in the cache now: what the next write builds on. */
export function cachedRoster(
	queryClient: QueryClient,
	missionId: string,
): RosterEntry[] | undefined {
	return queryClient.getQueryData<RosterEntry[]>(
		queryKeys.roster.list(missionId),
	);
}

export type AddRosterEntryVars = {
	body: AddRosterEntryBody;
	/** The catalog's template, when the caller has it: see onMutate. */
	template?: AgentTemplate;
};

/** Adds an entry from a template. A template once per territory, else 409. */
export function addRosterEntryOptions(
	api: ApiClient,
	queryClient: QueryClient,
	missionId: string,
) {
	return {
		mutationKey: writeKey(missionId),
		mutationFn: ({ body }: AddRosterEntryVars) =>
			call(contract.roster.add, () =>
				api.roster.add({ params: { missionId }, body }),
			),
		// Coherence reads each entry's template by id. Seeded from the catalog
		// before the answer lands, so the verdict never drops back to loading
		// while a template it has never read is fetched.
		onMutate: ({ template }: AddRosterEntryVars) => {
			if (!template) return;
			const key = queryKeys.roster.template(template.id);
			if (queryClient.getQueryData(key) === undefined)
				queryClient.setQueryData(key, template);
		},
		onSuccess: (entry: RosterEntry) =>
			settleRosterWrite(queryClient, missionId, (roster) => [...roster, entry]),
	};
}

export function useAddRosterEntry(missionId: string) {
	return useMutation(
		addRosterEntryOptions(useApiClient(), useQueryClient(), missionId),
	);
}

export type UpdateRosterEntryVars = {
	entryId: string;
	patch: UpdateRosterEntryBody;
};

/**
 * Patches one entry, optimistically: the patch is in the cached roster
 * before the request goes, so a second move builds on the first instead of
 * on the roster as it was, and a refusal puts the entry back.
 */
export function updateRosterEntryOptions(
	api: ApiClient,
	queryClient: QueryClient,
	missionId: string,
) {
	const key = queryKeys.roster.list(missionId);
	return {
		mutationKey: writeKey(missionId),
		mutationFn: ({ entryId, patch }: UpdateRosterEntryVars) =>
			call(contract.roster.update, () =>
				api.roster.update({ params: { missionId, entryId }, body: patch }),
			),
		onMutate: ({ entryId, patch }: UpdateRosterEntryVars) => {
			const before = cachedRoster(queryClient, missionId)?.find(
				(e) => e.id === entryId,
			);
			// A read in flight would land over the patch.
			void queryClient.cancelQueries({ queryKey: key });
			queryClient.setQueryData<RosterEntry[]>(key, (roster) =>
				roster?.map((e) =>
					e.id === entryId ? ({ ...e, ...patch } as RosterEntry) : e,
				),
			);
			return { before };
		},
		onError: (
			_error: ApiError,
			_vars: UpdateRosterEntryVars,
			context: { before: RosterEntry | undefined } | undefined,
		) => {
			const before = context?.before;
			if (before)
				queryClient.setQueryData<RosterEntry[]>(key, (roster) =>
					roster?.map((e) => (e.id === before.id ? before : e)),
				);
			return queryClient.invalidateQueries({ queryKey: key });
		},
		onSuccess: (entry: RosterEntry) =>
			settleRosterWrite(queryClient, missionId, (roster) =>
				roster.map((e) => (e.id === entry.id ? entry : e)),
			),
	};
}

export function useUpdateRosterEntry(missionId: string) {
	return useMutation(
		updateRosterEntryOptions(useApiClient(), useQueryClient(), missionId),
	);
}

/** Removes one entry from the mission. */
export function removeRosterEntryOptions(
	api: ApiClient,
	queryClient: QueryClient,
	missionId: string,
) {
	return {
		mutationKey: writeKey(missionId),
		mutationFn: (entryId: string) =>
			call(contract.roster.remove, () =>
				api.roster.remove({ params: { missionId, entryId } }),
			),
		onSuccess: (_removed: unknown, entryId: string) =>
			settleRosterWrite(queryClient, missionId, (roster) =>
				roster.filter((e) => e.id !== entryId),
			),
	};
}

export function useRemoveRosterEntry(missionId: string) {
	return useMutation(
		removeRosterEntryOptions(useApiClient(), useQueryClient(), missionId),
	);
}

// Pure functions below: no React, no network, so they are tested directly.

/**
 * The waves a chip move sends, built on the entry as the cache has it now
 * (so on any move still in flight): `to` replaces `from`, or with `copy` is
 * added beside it. Null when there is nothing to send.
 */
export function chipWaves(
	roster: readonly RosterEntry[] | undefined,
	entryId: string,
	from: Wave,
	to: Wave,
	copy = false,
): Wave[] | null {
	const entry = roster?.find((e) => e.id === entryId);
	if (!entry || from === to || entry.waves.includes(to)) return null;
	return copy ? addWave(entry.waves, to) : moveWave(entry.waves, from, to);
}

/** An entry as the board names it: "Atlas · Booking", or the name alone. */
export function entryName(entry: RosterEntry): string {
	return entry.territory
		? `${entry.agentTemplate.name} · ${entry.territory}`
		: entry.agentTemplate.name;
}

/** The fields the entry editor holds, as text. */
const ENTRY_FIELDS = [
	"customizedMd",
	"territory",
	"estimatedTokens",
	"tokenSoftCeiling",
	"tokenHardCeiling",
] as const;

export type EntryField = (typeof ENTRY_FIELDS)[number];

export type EntryDraft = Record<EntryField, string>;

export function entryDraftOf(entry: RosterEntry): EntryDraft {
	const text = (n: number | null) => (n === null ? "" : String(n));
	return {
		customizedMd: entry.customizedMd ?? "",
		territory: entry.territory ?? "",
		estimatedTokens: text(entry.estimatedTokens),
		tokenSoftCeiling: text(entry.tokenSoftCeiling),
		tokenHardCeiling: text(entry.tokenHardCeiling),
	};
}

/** Empty is null; anything else is sent as typed, for the contract to judge. */
function sentValue(field: EntryField, text: string): string | number | null {
	if (field === "customizedMd") return text === "" ? null : text;
	if (field === "territory") return text.trim() === "" ? null : text.trim();
	return text.trim() === "" ? null : Number(text.trim());
}

/**
 * The PATCH body for the editor: only the fields that differ from the
 * entry, or null when none does (an empty patch is a 400).
 */
export function entryPatchOf(
	entry: RosterEntry,
	draft: EntryDraft,
): UpdateRosterEntryBody | null {
	const patch: Record<string, string | number | null> = {};
	for (const field of ENTRY_FIELDS) {
		const value = sentValue(field, draft[field]);
		if (value !== entry[field]) patch[field] = value;
	}
	return Object.keys(patch).length > 0
		? (patch as UpdateRosterEntryBody)
		: null;
}

const ENTRY_COPY: Record<string, string> = {
	customizedMd:
		"Keep the instructions to 20,000 characters, or leave them empty.",
	territory: "Keep the territory to 200 characters, or leave it empty.",
	estimatedTokens: "Give a whole number of tokens above 0, or leave it empty.",
	tokenSoftCeiling:
		"Give a whole number of tokens above 0, no lower than the estimate, or leave it empty.",
	tokenHardCeiling:
		"Give a whole number of tokens above 0, no lower than the estimate or the soft ceiling, or leave it empty.",
	waves: "Choose at least one wave.",
};

/**
 * The editor's field for an issue path: its first segment, when the editor
 * holds that field. Anything else (the refine's "at least one field", a
 * boundary rule the editor does not edit) goes to the refusal row.
 */
export function entryFieldOf(
	path: readonly (string | number)[],
): EntryField | null {
	const first = path[0];
	return (ENTRY_FIELDS as readonly unknown[]).includes(first)
		? (first as EntryField)
		: null;
}

/** Copy for a refused issue, by path; the validator's message is for logs. */
export function rosterIssueCopy(issue: {
	path: readonly (string | number)[];
}): string {
	const first = issue.path[0];
	return (
		(typeof first === "string" ? ENTRY_COPY[first] : undefined) ??
		"A value here isn't accepted."
	);
}

/**
 * What the server would refuse in the editor, per field: the patch checked
 * with the contract's updateRosterEntryBody, and the whole entry as it would
 * stand checked with the contract's rosterEntryProblems (estimate ≤ soft ≤
 * hard). Nothing when nothing changed.
 */
export function entryProblems(
	entry: RosterEntry,
	draft: EntryDraft,
): Partial<Record<EntryField, string>> {
	const patch = entryPatchOf(entry, draft);
	if (patch === null) return {};
	const problems: Partial<Record<EntryField, string>> = {};
	const put = (path: readonly (string | number)[]) => {
		const field = entryFieldOf(path);
		if (field !== null && !(field in problems))
			problems[field] = rosterIssueCopy({ path });
	};
	const parsed = updateRosterEntryBody.safeParse(patch);
	if (!parsed.success) {
		for (const issue of parsed.error.issues) put(issue.path);
		return problems;
	}
	const whole = { ...entry, ...parsed.data };
	for (const issue of rosterEntryProblems({
		grain: whole.grain,
		absorbedBoundaries: whole.absorbedBoundaries,
		estimatedTokens: whole.estimatedTokens ?? null,
		tokenSoftCeiling: whole.tokenSoftCeiling ?? null,
		tokenHardCeiling: whole.tokenHardCeiling ?? null,
	}))
		put(issue.path);
	return problems;
}

/**
 * The roster as a new preset: each active entry's template, waves,
 * territory, paths and estimate. Idle entries are left out, since applying a
 * preset makes every agent active.
 */
export function presetBodyFromRoster(
	roster: readonly RosterEntry[],
	fields: { name: string; description: string; cut: PresetCut },
): CreatePresetBody {
	const description = fields.description.trim();
	return {
		name: fields.name.trim(),
		...(description === "" ? {} : { description }),
		cut: fields.cut,
		agents: roster
			.filter((e) => e.active)
			.map((e) => ({
				agentTemplateId: e.agentTemplate.id,
				waves: e.waves,
				territory: e.territory,
				writablePaths: e.writablePaths,
				estimatedTokens: e.estimatedTokens,
			})),
	};
}

/** The entry's waves with one taken away; null when it is the last. */
export function withoutWave(waves: readonly Wave[], wave: Wave): Wave[] | null {
	const rest = waves.filter((w) => w !== wave);
	return rest.length > 0 ? rest : null;
}
