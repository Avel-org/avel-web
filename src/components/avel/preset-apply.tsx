import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
	type CoherenceResult,
	computeCoherence,
	type MissionListItem,
	type Preset,
} from "avel-server/contract";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiClient } from "@/lib/api";
import { rosterQuery } from "@/lib/api/coherence";
import type { ApiError } from "@/lib/api/errors";
import { usePlaybook } from "@/lib/api/playbooks";
import {
	agentCount,
	appliedCoherenceInput,
	applyLabel,
	CUT_LABEL,
	loadedPresets,
	missingTemplateIds,
	useApplyPreset,
	usePresets,
} from "@/lib/api/presets";
import { PRECONDITION_COPY } from "@/lib/error-map";
import { ActionModal } from "./action-modal";
import { type MissionListParams, missionListQuery } from "./mission-data";
import { OptionCards } from "./option-cards";
import { CoherenceView, useCoherenceInput } from "./playbook-coherence";
import { agentName, fieldText } from "./preset-compare";
import { type Names, useAllTemplates } from "./preset-detail";
import { ErrorState, Surface, type SurfaceQuery } from "./surface";
import { useOpenGeneration } from "./use-open-generation";
import { type Change, WhatChanges } from "./what-changes";

// Short nouns, so v3's pills: "1 · Mission", "2 · Replace or add".
const STEPS = ["Mission", "Replace or add"] as const;
const PRESET_STEPS = ["Team", "Replace or add"] as const;

/** What the preview reads of the mission: its roster, cut and playbook. */
type ApplyTarget = Pick<MissionListItem, "id" | "cut" | "type">;

/** Draft missions only: applying refuses any other (422 mission_not_editable). */
export const draftMissions = (
	origin: MissionListParams["origin"],
): MissionListParams => ({
	origin,
	q: "",
	sort: "lastActivity",
	includeArchived: false,
	status: ["draft"],
});

/** Fetches every page of an infinite list, one after another. */
function useAllPages(query: {
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	fetchNextPage: () => unknown;
}) {
	const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
	useEffect(() => {
		if (hasNextPage && !isFetchingNextPage) fetchNextPage();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);
}

/** A mission as the picker names it: type and sprint, then whose. */
export function missionLabel(m: MissionListItem): string {
	const whose = m.client ? m.client.name : "Internal";
	return `${m.type} · sprint ${m.sprintN} · ${whose}`;
}

/**
 * Apply a preset to a draft mission (Stepper): pick the mission, then see
 * the roster it makes and coherence before and after, the contract's own
 * computeCoherence over both. A roster that already has agents can only be
 * replaced (422 roster_not_empty otherwise), and replacing removes them with
 * no way back, so it is asked for and the button turns destructive.
 */
export function ApplyPresetModal({
	preset,
	open,
	onOpenChange,
	names,
}: {
	preset: Preset | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	names: Names;
}) {
	const generation = useOpenGeneration(open);
	if (preset === null) return null;
	return (
		<ApplyPresetSteps
			key={`${preset.id}:${generation}`}
			preset={preset}
			open={open}
			onOpenChange={onOpenChange}
			names={names}
		/>
	);
}

export function ApplyPresetSteps({
	preset,
	open = true,
	onOpenChange = () => {},
	names,
	initialMission,
}: {
	preset: Preset;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	names: Names;
	/** For a test: start on the preview of this mission. */
	initialMission?: MissionListItem;
}) {
	const api = useApiClient();
	const client = useInfiniteQuery(
		missionListQuery(api, draftMissions("client")),
	);
	const internal = useInfiniteQuery(
		missionListQuery(api, draftMissions("internal")),
	);
	useAllPages(client);
	useAllPages(internal);
	const missions = [
		...(client.data?.pages.flatMap((p) => p.data) ?? []),
		...(internal.data?.pages.flatMap((p) => p.data) ?? []),
	];
	// Every draft is listed before any is offered, so none is hidden past a page.
	const missionsLoading =
		client.status === "pending" ||
		internal.status === "pending" ||
		client.hasNextPage ||
		internal.hasNextPage;
	const [step, setStep] = useState(initialMission ? 1 : 0);
	const [missionId, setMissionId] = useState(initialMission?.id ?? "");
	const [replace, setReplace] = useState(false);
	const apply = useApplyPreset();
	const mission =
		missions.find((m) => m.id === missionId) ??
		(initialMission?.id === missionId ? initialMission : undefined);
	const roster = useQuery({
		...rosterQuery(api, missionId),
		enabled: missionId !== "",
	});
	const occupied = (roster.data?.length ?? 0) > 0;
	const n = preset.agents.length;

	const reason =
		step === 0
			? missionId === ""
				? "Pick a draft mission first."
				: undefined
			: roster.status !== "success"
				? "Reading the mission's roster."
				: occupied && !replace
					? `This roster already has ${roster.data.length} ${roster.data.length === 1 ? "agent" : "agents"}. Choose to replace them, or go back and pick another mission.`
					: n === 0
						? "This team has no agents to apply."
						: undefined;

	const changes: Change[] = [
		...preset.agents.map(
			(agent): Change => ({
				label: `Add · ${agentName(agent, names)}`,
				kind: "add",
				to: fieldText(agent, "waves"),
				mono: true,
			}),
		),
		...(replace && roster.data
			? roster.data.map(
					(entry): Change => ({
						label: `Remove · ${entry.agentTemplate.name}${entry.territory ? ` · ${entry.territory}` : ""}`,
						kind: "remove",
						from: entry.waves.join(" · ") || "No waves",
						mono: true,
					}),
				)
			: []),
	];

	return (
		<ActionModal
			open={open}
			onOpenChange={(next) => {
				if (!next) apply.reset();
				onOpenChange(next);
			}}
			size="stepper"
			title="Apply team"
			description={`${preset.name}, v${preset.version}: its agents become the mission's roster entries, a copy the mission can then edit.`}
			dirty={missionId !== ""}
			steps={STEPS}
			stepStyle="pills"
			step={step}
			onBack={() => setStep(0)}
			submitLabel={step === 0 ? "Preview" : applyLabel(n)}
			pendingLabel="Applying"
			destructive={step === 1 && replace}
			submitDisabledReason={reason}
			onSubmit={() => {
				if (step === 0) {
					setStep(1);
					return;
				}
				apply.mutate(
					{ missionId, presetId: preset.id, replace },
					{
						onSuccess: (entries) => {
							onOpenChange(false);
							toast.success(
								`${applyLabel(entries.length).replace("Apply", "Applied")} to ${mission ? missionLabel(mission) : "the mission"}.`,
							);
						},
					},
				);
			}}
			pending={apply.isPending}
			error={apply.error}
			changes={
				step === 1 ? (
					<WhatChanges data-testid="preset-apply-changes" changes={changes} />
				) : undefined
			}
			data-testid="preset-apply"
		>
			{step === 0 ? (
				<MissionPicker
					missions={missions}
					loading={missionsLoading}
					rosterCount={roster.data?.length}
					value={missionId}
					onChange={(id) => {
						setMissionId(id);
						setReplace(false);
					}}
				/>
			) : mission ? (
				<Preview
					preset={preset}
					mission={mission}
					names={names}
					occupied={occupied}
					rosterCount={roster.data?.length ?? 0}
					replace={replace}
					onReplace={setReplace}
				/>
			) : null}
		</ActionModal>
	);
}

/**
 * The same apply from the mission's side (the loadout): pick a preset, then
 * the same preview, replace choice and request as from /presets.
 */
export function ApplyToMissionModal({
	mission,
	open,
	onOpenChange,
	names,
}: {
	mission: ApplyTarget;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	names: Names;
}) {
	const generation = useOpenGeneration(open);
	// Not opened yet: nothing to read. After, it stays mounted to animate out.
	if (generation === 0) return null;
	return (
		<ApplyToMissionSteps
			key={generation}
			mission={mission}
			open={open}
			onOpenChange={onOpenChange}
			names={names}
		/>
	);
}

export function ApplyToMissionSteps({
	mission,
	open = true,
	onOpenChange = () => {},
	names,
	initialPreset,
}: {
	mission: ApplyTarget;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	names: Names;
	/** For a test: start on the preview of this preset. */
	initialPreset?: Preset;
}) {
	const api = useApiClient();
	const list = usePresets();
	useAllPages(list);
	const presets = list.data ? loadedPresets(list.data) : [];
	const presetsLoading = list.status === "pending" || list.hasNextPage;
	const [step, setStep] = useState(initialPreset ? 1 : 0);
	const [presetId, setPresetId] = useState(initialPreset?.id ?? "");
	const [replace, setReplace] = useState(false);
	const apply = useApplyPreset();
	const preset =
		presets.find((p) => p.id === presetId) ??
		(initialPreset?.id === presetId ? initialPreset : undefined);
	const roster = useQuery(rosterQuery(api, mission.id));
	const occupied = (roster.data?.length ?? 0) > 0;
	const n = preset?.agents.length ?? 0;

	const reason =
		step === 0 || !preset
			? presetId === ""
				? "Pick a team first."
				: undefined
			: roster.status !== "success"
				? "Reading the mission's roster."
				: occupied && !replace
					? `This roster already has ${roster.data.length} ${roster.data.length === 1 ? "agent" : "agents"}. Choose to replace them, or go back and pick another team.`
					: n === 0
						? "This team has no agents to apply."
						: undefined;

	const changes: Change[] = preset
		? [
				...preset.agents.map(
					(agent): Change => ({
						label: `Add · ${agentName(agent, names)}`,
						kind: "add",
						to: fieldText(agent, "waves"),
						mono: true,
					}),
				),
				...(replace && roster.data
					? roster.data.map(
							(entry): Change => ({
								label: `Remove · ${entry.agentTemplate.name}${entry.territory ? ` · ${entry.territory}` : ""}`,
								kind: "remove",
								from: entry.waves.join(" · ") || "No waves",
								mono: true,
							}),
						)
					: []),
			]
		: [];

	return (
		<ActionModal
			open={open}
			onOpenChange={(next) => {
				if (!next) apply.reset();
				onOpenChange(next);
			}}
			size="stepper"
			title="Apply team"
			description="A team's agents become this mission's roster entries, a copy the mission can then edit."
			dirty={presetId !== ""}
			steps={PRESET_STEPS}
			stepStyle="pills"
			step={step}
			onBack={() => setStep(0)}
			submitLabel={step === 0 ? "Preview" : applyLabel(n)}
			pendingLabel="Applying"
			destructive={step === 1 && replace}
			submitDisabledReason={reason}
			onSubmit={async () => {
				if (step === 0) {
					setStep(1);
					return;
				}
				if (!preset) return;
				try {
					const entries = await apply.mutateAsync({
						missionId: mission.id,
						presetId: preset.id,
						replace,
					});
					onOpenChange(false);
					toast.success(
						`${applyLabel(entries.length).replace("Apply", "Applied")} from ${preset.name}.`,
					);
				} catch {
					// The refusal is on apply.error, shown in the modal.
				}
			}}
			pending={apply.isPending}
			error={apply.error}
			changes={
				step === 1 ? (
					<WhatChanges data-testid="preset-apply-changes" changes={changes} />
				) : undefined
			}
			data-testid="loadout-apply"
		>
			{step === 0 || !preset ? (
				<PresetPicker
					presets={presets}
					loading={presetsLoading}
					rosterCount={roster.data?.length}
					error={list.status === "error"}
					value={presetId}
					onChange={(id) => {
						setPresetId(id);
						setReplace(false);
					}}
				/>
			) : (
				<Preview
					preset={preset}
					mission={mission}
					names={names}
					occupied={occupied}
					rosterCount={roster.data?.length ?? 0}
					replace={replace}
					onReplace={setReplace}
				/>
			)}
		</ActionModal>
	);
}

function PresetPicker({
	presets,
	loading,
	rosterCount,
	error,
	value,
	onChange,
}: {
	presets: Preset[];
	loading: boolean;
	/** The mission's roster, once read. */
	rosterCount: number | undefined;
	error: boolean;
	value: string;
	onChange: (id: string) => void;
}) {
	if (error) {
		return (
			<p
				data-testid="loadout-apply-presets-error"
				className="type-small text-text-muted"
			>
				The teams could not be read. Close and try again.
			</p>
		);
	}
	if (loading) {
		return (
			<div
				data-testid="loadout-apply-presets-loading"
				className="flex flex-col gap-2"
			>
				<Skeleton className="h-9 w-full" />
				<Skeleton className="h-9 w-full" />
			</div>
		);
	}
	if (presets.length === 0) {
		return (
			<p
				data-testid="loadout-apply-no-presets"
				className="type-small text-text-muted"
			>
				There are no teams yet. Save this roster as one, or make one in Teams.
			</p>
		);
	}
	return (
		<OptionCards
			legend="Teams"
			data-testid="loadout-apply-presets"
			value={value}
			onChange={onChange}
			options={presets.map((p) => ({
				value: p.id,
				title: p.name,
				meta: (
					<>
						<span>{CUT_LABEL[p.cut]}</span>
						<span>{agentCount(p.agents.length)}</span>
						<span className="type-mono">{`v${p.version}`}</span>
					</>
				),
				detail:
					p.id === value
						? `Its ${agentCount(p.agents.length)} join this mission's roster${rosterCount ? `, which has ${agentCount(rosterCount)} now` : ""}.`
						: undefined,
				"data-testid": `loadout-apply-preset-${p.id}`,
			}))}
		/>
	);
}

function MissionPicker({
	missions,
	loading,
	rosterCount,
	value,
	onChange,
}: {
	missions: MissionListItem[];
	loading: boolean;
	/** The chosen mission's roster, once read. */
	rosterCount: number | undefined;
	value: string;
	onChange: (id: string) => void;
}) {
	if (loading) {
		return (
			<div
				data-testid="preset-apply-missions-loading"
				className="flex flex-col gap-2"
			>
				<Skeleton className="h-9 w-full" />
				<Skeleton className="h-9 w-full" />
			</div>
		);
	}
	if (missions.length === 0) {
		return (
			<p
				data-testid="preset-apply-no-missions"
				className="type-small text-text-muted"
			>
				There are no draft missions. A team applies only to a draft.
			</p>
		);
	}
	return (
		<OptionCards
			legend="Draft missions"
			data-testid="preset-apply-missions"
			value={value}
			onChange={onChange}
			options={missions.map((m) => ({
				value: m.id,
				title: m.type,
				meta: (
					<>
						<span>{m.client ? m.client.name : "Internal"}</span>
						<span>{`Sprint ${m.sprintN}`}</span>
						<span>{CUT_LABEL[m.cut]}</span>
					</>
				),
				// The list carries no roster count: it is read for the one chosen.
				detail:
					m.id === value
						? rosterCount === undefined
							? "Reading its roster."
							: rosterCount === 0
								? "Its roster is empty: the team's agents will be its first."
								: `Its roster has ${agentCount(rosterCount)}. Next, choose to replace them.`
						: undefined,
				"data-testid": `preset-apply-mission-${m.id}`,
			}))}
		/>
	);
}

/** Coherence now and after applying, side by side. */
function Preview({
	preset,
	mission,
	names,
	occupied,
	rosterCount,
	replace,
	onReplace,
}: {
	preset: Preset;
	mission: ApplyTarget;
	names: Names;
	occupied: boolean;
	rosterCount: number;
	replace: boolean;
	onReplace: (replace: boolean) => void;
}) {
	const { before, after, missing } = useCoherencePair(mission, preset, replace);
	return (
		<div className="flex flex-col gap-4">
			{/* A team applies only to an empty roster (422 roster_not_empty),
			    so Add is offered only there, and Replace only where there is
			    something to replace. Replace is never chosen for the operator. */}
			<div data-testid={occupied ? "preset-apply-replace" : "preset-apply-add"}>
				<OptionCards
					legend="Replace or add"
					data-testid="preset-apply-mode"
					columns={2}
					value={occupied ? (replace ? "replace" : "") : "add"}
					onChange={(mode) => onReplace(mode === "replace")}
					options={[
						{
							value: "add",
							title: "Add to the roster",
							detail: `The team's ${agentCount(preset.agents.length)} become the roster's entries.`,
							disabledReason: occupied
								? `${PRECONDITION_COPY.roster_not_empty.what} A team applies only to an empty roster.`
								: undefined,
							"data-testid": "preset-apply-add-box",
						},
						{
							value: "replace",
							title: "Replace the roster",
							detail: `The ${agentCount(rosterCount)} on it now are removed, then the team's ${agentCount(preset.agents.length)} are added. This can't be undone.`,
							irreversible: true,
							disabledReason: occupied
								? undefined
								: "The roster is empty: there is nothing to replace.",
							"data-testid": "preset-apply-replace-box",
						},
					]}
				/>
			</div>
			<div className="grid gap-4 md:grid-cols-2">
				<section
					data-testid="preset-apply-before"
					className="flex flex-col gap-2"
				>
					<h3 className="type-small font-medium text-foreground">
						Coherence now
					</h3>
					<CoherenceRegion
						testid="preset-apply-coherence-before"
						query={before}
					/>
				</section>
				<section
					data-testid="preset-apply-after"
					className="flex flex-col gap-2"
				>
					<h3 className="type-small font-medium text-foreground">
						After applying
					</h3>
					{occupied && !replace ? (
						<p className="type-small text-text-muted">
							Choose to replace the roster to see the result.
						</p>
					) : missing.length > 0 ? (
						<MissingTemplates ids={missing} />
					) : (
						<CoherenceRegion
							testid="preset-apply-coherence-after"
							query={after}
						/>
					)}
				</section>
			</div>
			<p className="type-caption text-text-subtle">
				{`${names.status === "success" ? "" : "Agent names are loading. "}Coherence is the same check the export gate runs.`}
			</p>
		</div>
	);
}

/**
 * A preset agent whose template the catalog no longer holds: there is
 * nothing to preview it from, and the server refuses the apply
 * (agent_template_not_found). Said, never left pending.
 */
export function MissingTemplates({ ids }: { ids: readonly string[] }) {
	const copy = PRECONDITION_COPY.agent_template_not_found;
	return (
		<div data-testid="preset-apply-missing" className="flex flex-col gap-1">
			<p className="type-small text-foreground">
				{`${ids.length === 1 ? "An agent this team uses isn't" : `${ids.length} agents this team uses aren't`} in All agents. The server would refuse this apply.`}
			</p>
			<p className="type-small text-text-muted">{copy.next}</p>
		</div>
	);
}

function CoherenceRegion({
	testid,
	query,
}: {
	testid: string;
	query: SurfaceQuery<CoherenceResult, ApiError>;
}) {
	return (
		<Surface
			data-testid={testid}
			query={query}
			isEmpty={() => false}
			empty={null}
			loading={
				<div className="flex flex-col gap-2">
					<Skeleton className="h-4 w-48" />
					<Skeleton className="h-4 w-36" />
				</div>
			}
			error={ErrorState}
		>
			{(result) => <CoherenceView result={result} />}
		</Surface>
	);
}

/**
 * Coherence for the roster as it is and as applying would leave it, both by
 * the contract's computeCoherence against the mission's playbook. The after
 * side adds the preset's agents, with kind, roles and paths from the
 * catalog, after the current entries unless they are replaced.
 */
function useCoherencePair(
	mission: ApplyTarget,
	preset: Preset,
	replace: boolean,
): {
	before: SurfaceQuery<CoherenceResult, ApiError>;
	after: SurfaceQuery<CoherenceResult, ApiError>;
	/** Templates the catalog lacks, once it is all loaded: nothing to preview. */
	missing: string[];
} {
	const input = useCoherenceInput(mission);
	const playbook = usePlaybook(mission.type);
	const templates = useAllTemplates();
	if (input.status === "error")
		return { before: input, after: input, missing: [] };
	if (playbook.status === "error") {
		const error = {
			status: "error" as const,
			error: playbook.error,
			refetch: playbook.refetch,
			isFetching: playbook.isFetching,
		};
		return { before: error, after: error, missing: [] };
	}
	if (
		input.status !== "success" ||
		playbook.status !== "success" ||
		templates.status !== "success"
	) {
		return {
			before: { status: "pending" },
			after: { status: "pending" },
			missing: [],
		};
	}
	const rules = {
		wavesApplicable: playbook.data.wavesApplicable,
		gates: playbook.data.gates,
	};
	const applied = appliedCoherenceInput(
		input.data,
		preset.agents,
		templates.byId,
		replace,
	);
	return {
		before: { status: "success", data: computeCoherence(input.data, rules) },
		after: applied
			? { status: "success", data: computeCoherence(applied, rules) }
			: { status: "pending" },
		missing: missingTemplateIds(preset.agents, templates.byId),
	};
}
