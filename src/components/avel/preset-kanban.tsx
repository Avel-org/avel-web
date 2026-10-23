import { useBlocker } from "@tanstack/react-router";
import {
	type AgentTemplate,
	type Preset,
	ROLE_LABELS,
	type Role,
	WAVES,
	type Wave,
} from "avel-server/contract";
import {
	Columns3,
	Grid3x3,
	PanelRightOpen,
	Rocket,
	Trash2,
} from "lucide-react";
import {
	type KeyboardEvent,
	type ReactNode,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { ApiError } from "@/lib/api";
import { usePlaybooks } from "@/lib/api/playbooks";
import {
	type AgentDraft,
	addWave,
	adjacentWave,
	agentBodyOf,
	agentDraftOf,
	CUT_LABEL,
	changedPresetFields,
	moveWave,
	nextVersion,
	type PresetCut,
	type PresetDraft,
	presetDraftOf,
	presetIssueCopy,
	presetProblems,
	useUpdatePreset,
} from "@/lib/api/presets";
import { useStoredState } from "@/lib/stored";
import { ActionModal } from "./action-modal";
import {
	CanvasHint,
	CanvasSurface,
	DetailsSheet,
	useCanvasHint,
} from "./canvas";
import { Field } from "./client-form";
import { CodeView } from "./code-view";
import { agentName } from "./preset-compare";
import {
	COVERAGE_HINT,
	type ComposerRequirements,
	CoverageGrid,
	composerRequirements,
	NO_REQUIREMENTS,
} from "./preset-coverage-grid";
import { type Names, useAllTemplates } from "./preset-detail";
import { useFlip } from "./preset-flip";
import { presetChanges } from "./preset-form";
import {
	AgentTray,
	type DragSource,
	dropProblem,
	type LaneRow,
	placeBefore,
	positionText,
	WaveLane,
} from "./preset-lanes";
import { PresetCoverage, PresetHistory, PresetUsedBy } from "./preset-sections";
import { type ViewOption, ViewToggle } from "./view-toggle";
import { type Change, WhatChanges } from "./what-changes";

/** Why Apply waits while the board has unsaved changes. */
export const APPLY_WAITS =
	"Save or discard your changes first: applying uses the saved team.";

/** An agent row with a key of its own: the board adds and removes rows. */
type Row = { uid: number; draft: AgentDraft };

/** A chip: one agent in one wave. An agent in two waves has two chips. */
type ChipRef = { uid: number; wave: Wave };

/**
 * The board's own drag type. Not text/plain: a browser follows dropped text
 * as a link when it lands outside a drop zone.
 */
const DRAG_TYPE = "application/x-avel-agent";

/** The canvas's two lenses on one draft. */
type Lens = "lanes" | "coverage";
const LENSES = ["lanes", "coverage"] as const;

/** The canvas's one view control: the two lenses (ruling 55: no table). */
const LENS_OPTIONS = [
	{ id: "lanes", label: "Lanes", icon: Columns3 },
	{ id: "coverage", label: "Coverage", icon: Grid3x3 },
] as const satisfies readonly ViewOption<Lens>[];

/** The first-time hint and the tray, remembered per viewer. */

/**
 * How the board works, said once at the canvas's top until dismissed.
 */
/**
 * A drop on a Coverage cell adds the agent to the cell's wave; it shows in
 * that cell only if the agent holds the cell's role, so a drop on a role the
 * agent lacks is refused rather than landing somewhere else.
 */
export function coverageDropProblem(
	template: Pick<AgentTemplate, "name" | "roles"> | undefined,
	role: Role,
): string | null {
	if (!template || template.roles.includes(role)) return null;
	return `${template.name} doesn't hold ${ROLE_LABELS[role]}. Drop it on one of its roles.`;
}

export const LAST_WAVE = "An agent needs one wave; remove it instead.";

export const HINT_TEXT =
	"Drag an agent from the band above into a wave. Drag between waves to move one. Keyboard: focus a chip, Enter to pick up, arrows to move, Enter to drop.";

/** The canvas while the teams are read: five lanes in their real shape. */
export function CanvasSkeleton() {
	return (
		<CanvasSurface data-testid="preset-canvas-skeleton" aria-hidden="true">
			<Skeleton className="h-control-lg w-72 rounded-control" />
			{/* The agent band, then five lanes, as the canvas lays them out. */}
			<Skeleton className="h-20 w-full rounded-card" />
			<div className="grid grid-cols-3 gap-3 xl:grid-cols-5">
				{["A", "B", "C", "D", "E"].map((wave) => (
					<div
						key={wave}
						data-testid="preset-canvas-skeleton-lane"
						className="flex flex-col gap-1.5 rounded-card border border-border bg-app-panel p-2"
					>
						<Skeleton className="h-4 w-24" />
						<Skeleton className="h-9 w-full rounded-control" />
						<Skeleton className="h-9 w-full rounded-control" />
					</div>
				))}
			</div>
		</CanvasSurface>
	);
}

/** A team with no agent yet: three steps, on the canvas. */
function EmptyTeamGuide({ nextVersion: next }: { nextVersion: number }) {
	const steps = [
		["Pick an agent", "Find one in the band above, by name or role."],
		[
			"Drop it on a wave",
			"Drag it into A to E, or press it and choose a wave.",
		],
		[`Save as v${next}`, "Nothing is sent until you save."],
	] as const;
	return (
		<ol
			aria-label="Start this team"
			data-testid="preset-empty-guide"
			className="grid gap-2 rounded-card border border-dashed border-border-strong bg-app-panel p-3 sm:grid-cols-3"
		>
			{steps.map(([title, body], i) => (
				<li key={title} className="flex items-start gap-2.5">
					<span
						aria-hidden="true"
						className="inline-grid size-[22px] shrink-0 place-items-center rounded-full border border-border-strong bg-app-panel type-caption font-medium text-text-subtle"
					>
						{i + 1}
					</span>
					<span className="flex flex-col">
						<span className="type-small font-medium text-text">{title}</span>
						<span className="type-caption">{body}</span>
					</span>
				</li>
			))}
		</ol>
	);
}

/** The inspector's tabs. */
type InspectorTab = "coverage" | "used-by" | "history" | "fields" | "source";

/**
 * The team composer's centre and inspector: the selected team as wave lanes
 * A to E (or, through the Coverage lens, roles by wave), and beside it the
 * inspector with Apply to mission. Moving a chip, adding or removing an
 * agent, or changing a field builds a draft, announced at the top as
 * unpublished changes with Discard and Save as v<n+1>; saving uses the
 * preset update route, and nothing is sent until then. Leaving the team with
 * a draft asks first.
 *
 * Keyboard first: a chip is a button. Enter or Space picks it up; the left
 * and right arrows move it between waves, up and down within one; Enter or
 * Esc puts it down; Delete takes it off that wave. Each move is read out,
 * with the lane and the position. A pointer can drag chips and templates
 * instead, onto any point of a lane.
 */
export function PresetKanban({
	preset: latest,
	names,
	switcher,
	onApply,
	onSaved,
}: {
	/** The preset as the server has it now; the board edits its own base copy. */
	preset: Preset;
	names: Names;
	/** The team switcher, at the head of the canvas. */
	switcher: ReactNode;
	onApply: (preset: Preset) => void;
	onSaved: (preset: Preset) => void;
}) {
	// The version the board started from. A newer one from the server never
	// replaces it under unsaved edits: see boardSync.
	const [preset, setBase] = useState(latest);
	const initial = useMemo(() => presetDraftOf(preset), [preset]);
	const nextUid = useRef(initial.agents.length);
	const [fields, setFields] = useState(() => ({
		name: initial.name,
		description: initial.description,
		cut: initial.cut,
	}));
	const [rows, setRows] = useState<Row[]>(() =>
		initial.agents.map((draft, uid) => ({ uid, draft })),
	);
	const [selected, setSelected] = useState<ChipRef | null>(null);
	const [holding, setHolding] = useState(false);
	const [saving, setSaving] = useState(false);
	const [discarding, setDiscarding] = useState(false);
	const [tab, setTab] = useState<InspectorTab>("coverage");
	const [details, setDetails] = useState(false);
	const [hintShown, dismissHint] = useCanvasHint("avel.presets.hint");
	// Coverage reads differently from the lanes, so it explains itself once too.
	const [coverageHint, dismissCoverageHint] = useCanvasHint(
		"avel.presets.coverage-hint",
	);
	const [gridProblem, setGridProblem] = useState<string | null>(null);
	const [lens, setLens] = useStoredState<Lens>(
		"avel.presets.lens",
		"lanes",
		LENSES,
	);
	const update = useUpdatePreset();
	const templates = useAllTemplates();
	const playbooks = usePlaybooks();
	const boardRef = useRef<HTMLOListElement>(null);
	const flip = useFlip(boardRef);
	// The drag in flight, the lane it is over and where it would land.
	const [drag, setDrag] = useState<DragSource | null>(null);
	const [over, setOver] = useState<{ wave: Wave; index: number } | null>(null);
	const [laneProblem, setLaneProblem] = useState<{
		wave: Wave;
		text: string;
	} | null>(null);
	const [landed, setLanded] = useState<number | null>(null);
	const [live, setLive] = useState("");
	const chipEls = useRef(new Map<string, HTMLButtonElement>());

	const draft: PresetDraft = { ...fields, agents: rows.map((r) => r.draft) };
	const patch = changedPresetFields(preset, draft);
	const problems = presetProblems(draft);
	const problemCount = Object.keys(problems).length;
	const changes = presetChanges(preset, draft, names);
	const sync = boardSync(preset, latest, patch !== null);

	// The draft as the contract's check reads it: agents with a template.
	const team = {
		id: preset.id,
		cut: fields.cut,
		agents: rows
			.filter((r) => r.draft.agentTemplateId !== "")
			.map((r) => agentBodyOf(r.draft)),
	};
	const requirements: ComposerRequirements =
		templates.status === "success" && playbooks.data
			? composerRequirements(
					team,
					templates.byId,
					playbooks.data.pages.flatMap((page) => page.data),
				)
			: NO_REQUIREMENTS;

	// Leaving the team with a draft asks first: the rail, the sidebar, Back.
	// A ref, so the check reads this render's draft, and a save can clear it
	// before it moves to the saved version.
	const dirty = useRef(false);
	dirty.current = patch !== null && !update.isPending;
	const leaving = useBlocker({
		shouldBlockFn: () => dirty.current,
		enableBeforeUnload: () => dirty.current,
		withResolver: true,
	});

	/** Starts the board again from this version of the preset. */
	const resetTo = (next: Preset) => {
		const d = presetDraftOf(next);
		setBase(next);
		setFields({ name: d.name, description: d.description, cut: d.cut });
		setRows(d.agents.map((agentDraft, uid) => ({ uid, draft: agentDraft })));
		nextUid.current = d.agents.length;
		setSelected(null);
		setHolding(false);
		setDiscarding(false);
	};

	// A newer version with nothing unsaved on the board is simply taken.
	useEffect(() => {
		if (sync === "adopt") resetTo(latest);
	});

	const save = async () => {
		if (patch === null) return;
		try {
			// Awaited, not mutate's per-call callbacks: those are dropped if the
			// board re-renders from a refetch first.
			const saved = await update.mutateAsync({ id: preset.id, patch });
			dirty.current = false;
			setSaving(false);
			toast.success(`Saved ${saved.name} as v${saved.version}.`);
			resetTo(saved);
			onSaved(saved);
		} catch {
			// The refusal is on update.error, shown in the modal.
		}
	};

	const setRow = (uid: number, change: Partial<AgentDraft>) =>
		setRows((current) =>
			current.map((row) =>
				row.uid === uid ? { uid, draft: { ...row.draft, ...change } } : row,
			),
		);
	const removeRow = (uid: number) => {
		setRows((current) => current.filter((row) => row.uid !== uid));
		setSelected(null);
		setHolding(false);
	};
	/** Why adding this template to the wave is refused, as a drop would be. */
	const addProblem = (templateId: string, wave: Wave) =>
		dropProblem(
			laneRows,
			{ kind: "template", templateId },
			wave,
			(r) => nameOfRow(rows.find((x) => x.uid === r.uid) as Row),
			templateMap,
		);
	const addAgent = (template: Pick<AgentTemplate, "id">, wave: Wave) => {
		const uid = nextUid.current++;
		setRows((current) => [
			...current,
			{
				uid,
				draft: {
					...agentDraftOf(),
					agentTemplateId: template.id,
					waves: [wave],
				},
			},
		]);
		setSelected({ uid, wave });
	};

	const dropChip = (chip: ChipRef) => {
		const row = rows.find((r) => r.uid === chip.uid);
		if (!row) return;
		const waves = row.draft.waves.filter((w) => w !== chip.wave);
		// Off its last wave, the agent leaves the preset.
		if (waves.length === 0) removeRow(chip.uid);
		else setRow(chip.uid, { waves });
		setSelected(null);
		setHolding(false);
	};
	const discard = () => {
		setFields({
			name: initial.name,
			description: initial.description,
			cut: initial.cut,
		});
		setRows(initial.agents.map((d, uid) => ({ uid, draft: d })));
		nextUid.current = initial.agents.length;
		setSelected(null);
		setHolding(false);
		setDiscarding(false);
	};

	const selectedRow = selected
		? rows.find((r) => r.uid === selected.uid)
		: undefined;
	const selectedIndex = selectedRow ? rows.indexOf(selectedRow) : -1;

	const nameOfRow = (row: Row) =>
		row.draft.agentTemplateId === ""
			? "No agent"
			: agentName(agentBodyOf(row.draft), names);
	const laneOf = (list: readonly Row[], wave: Wave) =>
		list.filter((r) => r.draft.waves.includes(wave));
	const laneRows: LaneRow[] = rows.map((r) => ({
		uid: r.uid,
		templateId: r.draft.agentTemplateId,
		territory: r.draft.territory,
		waves: r.draft.waves,
	}));
	const templateMap: ReadonlyMap<string, AgentTemplate> =
		templates.status === "success" ? templates.byId : new Map();
	/** Says where a chip stands now, through the live region. */
	const announce = (
		list: readonly Row[],
		uid: number,
		wave: Wave,
		lead = "",
	) => {
		const lane = laneOf(list, wave);
		const row = list.find((r) => r.uid === uid);
		if (!row) return;
		const at = lane.findIndex((r) => r.uid === uid);
		setLive(`${lead}${positionText(nameOfRow(row), wave, at, lane.length)}`);
	};

	/** A drop on a lane, before the chip at `index` (or at its end). */
	const dropAt = (source: DragSource, wave: Wave, index: number) => {
		setDrag(null);
		setOver(null);
		const problem = dropProblem(
			laneRows,
			source,
			wave,
			(r) => nameOfRow(rows.find((x) => x.uid === r.uid) as Row),
			templateMap,
		);
		if (problem) {
			setLaneProblem({ wave, text: problem });
			setLive(problem);
			return;
		}
		setLaneProblem(null);
		const movingUid = source.kind === "chip" ? source.uid : nextUid.current++;
		// The lane as it stands without the moving chip: the drop's index is
		// read against it.
		const lane = laneOf(rows, wave).filter((r) => r.uid !== movingUid);
		const before = lane[index]?.uid ?? null;
		let next: Row[];
		if (source.kind === "chip") {
			const row = rows.find((r) => r.uid === source.uid);
			if (!row) return;
			if (source.wave !== wave)
				flip(`${row.uid}:${source.wave}`, `${row.uid}:${wave}`);
			const moved = rows.map((r) =>
				r.uid === row.uid
					? {
							uid: r.uid,
							draft: {
								...r.draft,
								waves: moveWave(r.draft.waves, source.wave, wave),
							},
						}
					: r,
			);
			next = placeBefore(moved, row.uid, before);
		} else {
			const added: Row = {
				uid: movingUid,
				draft: {
					...agentDraftOf(),
					agentTemplateId: source.templateId,
					waves: [wave],
				},
			};
			next = placeBefore([...rows, added], movingUid, before);
		}
		setRows(next);
		setSelected({ uid: movingUid, wave });
		setHolding(false);
		setLanded(movingUid);
		announce(next, movingUid, wave, "Dropped. ");
	};

	/** The keyboard on a picked-up chip: across waves, along one, down, off. */
	const chipKey = (uid: number, wave: Wave, event: KeyboardEvent) => {
		const isSelected = selected?.uid === uid && selected.wave === wave;
		if (!isSelected || !holding) return;
		const row = rows.find((r) => r.uid === uid);
		if (!row) return;
		if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
			event.preventDefault();
			const to = adjacentWave(wave, event.key === "ArrowLeft" ? -1 : 1);
			if (!to) return;
			const problem = dropProblem(
				laneRows,
				{ kind: "chip", uid, wave },
				to,
				() => nameOfRow(row),
				templateMap,
			);
			if (problem) {
				setLaneProblem({ wave: to, text: problem });
				setLive(problem);
				return;
			}
			setLaneProblem(null);
			flip(`${uid}:${wave}`, `${uid}:${to}`);
			const next = rows.map((r) =>
				r.uid === uid
					? {
							uid,
							draft: { ...r.draft, waves: moveWave(r.draft.waves, wave, to) },
						}
					: r,
			);
			setRows(next);
			setSelected({ uid, wave: to });
			announce(next, uid, to);
		} else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
			event.preventDefault();
			const lane = laneOf(rows, wave);
			const at = lane.findIndex((r) => r.uid === uid);
			const target = event.key === "ArrowUp" ? at - 1 : at + 1;
			if (target < 0 || target >= lane.length) return;
			// Up: before the one above; down: before the one after the next.
			const before =
				event.key === "ArrowUp"
					? (lane[target]?.uid ?? null)
					: (lane[target + 1]?.uid ?? null);
			const next = placeBefore(rows, uid, before);
			setRows(next);
			announce(next, uid, wave);
		} else if (event.key === "Escape") {
			event.preventDefault();
			setHolding(false);
			announce(rows, uid, wave, "Put down. ");
		} else if (event.key === "Delete" || event.key === "Backspace") {
			event.preventDefault();
			dropChip({ uid, wave });
			setLive(`${nameOfRow(row)} taken off wave ${wave}.`);
		}
	};

	// A moved chip keeps the keyboard's focus.
	useEffect(() => {
		if (selected && holding)
			chipEls.current.get(`${selected.uid}:${selected.wave}`)?.focus();
	}, [selected, holding]);

	return (
		<section
			aria-label={`${preset.name}, editing`}
			data-testid="preset-kanban"
			className="flex flex-col gap-4"
			// A drop that misses every lane lands here and goes nowhere: the
			// browser must never treat it as a link to follow.
			onDragOver={(event) => {
				if (drag) event.preventDefault();
			}}
			onDrop={(event) => {
				if (!drag) return;
				event.preventDefault();
				setDrag(null);
				setOver(null);
			}}
		>
			{/* The keyboard's and the drops' moves, read out. */}
			<p
				aria-live="polite"
				data-testid="preset-kanban-live"
				className="sr-only"
			>
				{live}
			</p>
			<header
				data-testid="preset-canvas-header"
				className="flex flex-wrap items-center gap-2"
			>
				{switcher}
				<ViewToggle
					options={LENS_OPTIONS}
					view={lens}
					onChange={setLens}
					testIdPrefix="preset-view"
				/>
				<div className="ml-auto flex items-center gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						data-testid="preset-details"
						onClick={() => setDetails(true)}
					>
						<PanelRightOpen aria-hidden="true" />
						Details
					</Button>
					<Button
						type="button"
						size="sm"
						data-testid="preset-kanban-apply"
						disabledReason={patch !== null ? APPLY_WAITS : undefined}
						onClick={() => onApply(preset)}
					>
						<Rocket aria-hidden="true" />
						Apply to mission
					</Button>
				</div>
			</header>

			{leaving.status === "blocked" ? (
				<div
					role="alertdialog"
					aria-label="Discard changes?"
					data-testid="preset-kanban-closing"
					className="flex flex-wrap items-center justify-end gap-2 rounded-card border border-gate-warn-line bg-gate-warn-banner px-3 py-2"
				>
					<p className="type-small mr-auto text-foreground">
						Leave this team and discard what you changed?
					</p>
					<Button
						variant="ghost"
						size="sm"
						autoFocus
						data-testid="preset-kanban-closing-keep"
						onClick={leaving.reset}
					>
						Keep editing
					</Button>
					<Button
						variant="destructive"
						size="sm"
						data-testid="preset-kanban-closing-discard"
						onClick={leaving.proceed}
					>
						Discard
					</Button>
				</div>
			) : null}
			{patch !== null ? (
				<DirtyBanner
					changes={changes}
					problemCount={problemCount}
					discarding={discarding}
					onDiscarding={setDiscarding}
					onDiscard={discard}
					onSave={() => setSaving(true)}
					nextVersion={nextVersion(preset)}
				/>
			) : null}
			{sync === "notice" ? (
				<div
					aria-live="polite"
					data-testid="preset-kanban-newer"
					className="flex flex-wrap items-center gap-2 rounded-card border border-border-strong bg-app-band px-3 py-2"
				>
					<p className="type-small mr-auto text-foreground">
						{`Newer version v${latest.version} on the server. Your board is still on v${preset.version}.`}
					</p>
					<Button
						variant="outline"
						size="sm"
						data-testid="preset-kanban-reload"
						onClick={() => resetTo(latest)}
					>
						Reload, discarding my changes
					</Button>
				</div>
			) : null}

			{/* The canvas: the band on a faint dot grid, the tray docked left,
			    the waves filling the rest; nothing scrolls sideways. */}
			<CanvasSurface data-testid="preset-canvas">
				{lens === "coverage" ? (
					coverageHint ? (
						<CanvasHint
							data-testid="preset-coverage-hint"
							onDismiss={dismissCoverageHint}
						>
							{COVERAGE_HINT}
						</CanvasHint>
					) : null
				) : hintShown ? (
					<CanvasHint data-testid="preset-hint" onDismiss={dismissHint}>
						{HINT_TEXT}
					</CanvasHint>
				) : null}
				{/* The agents as a band across the top, every one in view; the
				    lanes below take the canvas's whole width. */}
				<AgentTray
					onTeam={new Set(rows.map((r) => r.draft.agentTemplateId))}
					templates={templates.status === "success" ? templates.list : []}
					onAdd={(templateId, wave) => {
						const problem = addProblem(templateId, wave);
						if (problem) {
							setLaneProblem({ wave, text: problem });
							setLive(problem);
							return;
						}
						setLaneProblem(null);
						addAgent({ id: templateId }, wave);
					}}
					onDragStart={(templateId, event) => {
						event.dataTransfer.effectAllowed = "copy";
						event.dataTransfer.setData(DRAG_TYPE, templateId);
						setLaneProblem(null);
						setDrag({ kind: "template", templateId });
					}}
					onDragEnd={() => {
						setDrag(null);
						setOver(null);
					}}
				/>
				<div className="flex flex-col gap-3">
					{rows.length === 0 ? (
						<EmptyTeamGuide nextVersion={nextVersion(preset)} />
					) : null}
					{lens === "lanes" ? (
						<ol
							ref={boardRef}
							aria-label="Waves"
							data-testid="preset-kanban-board"
							// One height for every lane, the tallest's: auto-rows-fr.
							className="grid auto-rows-fr grid-cols-3 gap-3 xl:grid-cols-5"
						>
							{WAVES.map((wave) => (
								<WaveLane
									key={wave}
									wave={wave}
									chips={laneOf(rows, wave).map((row) => ({
										uid: row.uid,
										// The template's own name: the territory has its line.
										name:
											row.draft.agentTemplateId === ""
												? "No agent"
												: agentName(
														{ ...agentBodyOf(row.draft), territory: null },
														names,
													),
										territory: row.draft.territory.trim(),
										flagged: Object.keys(problems).some((k) =>
											k.startsWith(`agents.${rows.indexOf(row)}.`),
										),
									}))}
									requirements={requirements}
									selectedUid={selected?.wave === wave ? selected.uid : null}
									holding={holding && selected?.wave === wave}
									drag={drag}
									over={over?.wave === wave}
									insertAt={over?.wave === wave ? over.index : null}
									problem={
										laneProblem?.wave === wave ? laneProblem.text : undefined
									}
									landedUid={landed}
									chipRef={(uid, el) => {
										const key = `${uid}:${wave}`;
										if (el) chipEls.current.set(key, el);
										else chipEls.current.delete(key);
									}}
									onDragOverAt={(index) =>
										setOver((o) =>
											o?.wave === wave && o.index === index
												? o
												: { wave, index },
										)
									}
									onDragLeave={() =>
										setOver((o) => (o?.wave === wave ? null : o))
									}
									onDropHere={(index) => {
										if (drag) dropAt(drag, wave, index);
									}}
									onChipDragStart={(uid, event) => {
										event.dataTransfer.effectAllowed = "move";
										event.dataTransfer.setData(DRAG_TYPE, String(uid));
										setLaneProblem(null);
										setDrag({ kind: "chip", uid, wave });
									}}
									onChipDragEnd={() => {
										setDrag(null);
										setOver(null);
									}}
									onChipClick={(uid) => {
										// Enter or a click picks a chip up; again puts it down,
										// still selected so the inspector keeps it.
										const same =
											selected?.uid === uid && selected.wave === wave;
										const nextHolding = !(same && holding);
										setSelected({ uid, wave });
										setHolding(nextHolding);
										setTab("fields");
										announce(
											rows,
											uid,
											wave,
											nextHolding ? "Picked up. " : "Put down. ",
										);
									}}
									onChipKey={(uid, event) => chipKey(uid, wave, event)}
								/>
							))}
						</ol>
					) : (
						<div className="flex min-w-0 flex-col gap-2">
							{gridProblem ? (
								<p
									aria-live="polite"
									data-testid="preset-grid-problem"
									className="type-caption text-gate-warn"
								>
									{gridProblem}
								</p>
							) : null}
							<CoverageGrid
								agents={rows
									.filter((r) => r.draft.agentTemplateId !== "")
									.map((r) => ({
										key: String(r.uid),
										templateId: r.draft.agentTemplateId,
										waves: r.draft.waves,
										name: agentName(agentBodyOf(r.draft), names),
									}))}
								templates={templates.status === "success" ? templates.list : []}
								requirements={requirements}
								// The lanes' own check: a cell refuses what a lane would.
								problemOf={addProblem}
								onAdd={(templateId, wave) => {
									const problem = addProblem(templateId, wave);
									setGridProblem(problem);
									if (problem) {
										setLive(problem);
										return;
									}
									addAgent({ id: templateId }, wave);
								}}
								dragging={drag?.kind === "template"}
								onDropAt={(role, wave) => {
									if (drag?.kind !== "template") return;
									const problem =
										coverageDropProblem(
											templateMap.get(drag.templateId),
											role,
										) ?? addProblem(drag.templateId, wave);
									setDrag(null);
									setGridProblem(problem);
									if (problem) {
										setLive(problem);
										return;
									}
									addAgent({ id: drag.templateId }, wave);
								}}
							/>
						</div>
					)}
				</div>
			</CanvasSurface>

			{/* The inspector, beside the canvas when asked for. */}
			<DetailsSheet
				open={details}
				onOpenChange={setDetails}
				data-testid="preset-details-sheet"
				title={preset.name}
				description="Coverage, where it is used, its history and its fields."
			>
				<Inspector
					preset={preset}
					team={team}
					tab={tab}
					onTab={setTab}
					fields={fields}
					onFields={(change) => setFields((f) => ({ ...f, ...change }))}
					problems={problems}
					row={selectedRow}
					index={selectedIndex}
					names={names}
					onRow={(change) => selectedRow && setRow(selectedRow.uid, change)}
					onRemove={() => selectedRow && removeRow(selectedRow.uid)}
					request={patch}
				/>
			</DetailsSheet>

			<SavePresetConfirm
				open={saving}
				onOpenChange={(open) => {
					if (!open) update.reset();
					setSaving(open);
				}}
				preset={preset}
				name={fields.name}
				changes={changes}
				pending={update.isPending}
				error={update.error}
				onSave={save}
			/>
		</section>
	);
}

/**
 * The draft, announced (v3 .banner): "Unpublished changes (n)" with what
 * changed, then Discard and Save as v<n+1>. Discard asks once, in place.
 */
export function DirtyBanner({
	changes,
	problemCount,
	discarding,
	onDiscarding,
	onDiscard,
	onSave,
	nextVersion: next,
}: {
	changes: Change[];
	problemCount: number;
	discarding: boolean;
	onDiscarding: (on: boolean) => void;
	onDiscard: () => void;
	onSave: () => void;
	nextVersion: number;
}) {
	return (
		<section
			aria-label="Unpublished changes"
			data-testid="preset-kanban-strip"
			className="flex flex-wrap items-start gap-3 rounded-card border border-gate-warn-line bg-gate-warn-banner px-3 py-2.5"
		>
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<p
					data-testid="preset-kanban-dirty"
					className="type-small font-medium text-foreground"
				>
					{`Unpublished changes (${changes.length})`}
				</p>
				<WhatChanges data-testid="preset-kanban-changes" changes={changes} />
				{problemCount > 0 ? (
					<p
						data-testid="preset-kanban-problems"
						className="type-small text-gate-block"
					>
						{problemCount === 1
							? "1 field needs attention: it is marked in Fields."
							: `${problemCount} fields need attention: they are marked in Fields.`}
					</p>
				) : null}
			</div>
			{/* v3 UX 7: beside the text, or wrapped under it on a phone. */}
			<div className="ml-auto flex shrink-0 flex-wrap items-center gap-2 max-sm:basis-full max-sm:justify-end">
				{discarding ? (
					<>
						<span className="type-small text-foreground">
							Discard these changes?
						</span>
						<Button
							variant="ghost"
							size="sm"
							autoFocus
							data-testid="preset-kanban-keep"
							onClick={() => onDiscarding(false)}
						>
							Keep editing
						</Button>
						<Button
							variant="destructive"
							size="sm"
							data-testid="preset-kanban-discard-confirm"
							onClick={onDiscard}
						>
							Discard
						</Button>
					</>
				) : (
					<>
						<Button
							variant="ghost"
							size="sm"
							data-testid="preset-kanban-discard"
							onClick={() => onDiscarding(true)}
						>
							Discard
						</Button>
						<Button
							size="sm"
							data-testid="preset-kanban-save"
							disabledReason={
								problemCount > 0 ? "Fix the marked fields first." : undefined
							}
							onClick={onSave}
						>
							{`Save as v${next}`}
						</Button>
					</>
				)}
			</div>
		</section>
	);
}

/**
 * What a newer server version does to the board: nothing when it is the
 * same; taken at once when nothing is unsaved; otherwise a notice, so a
 * background refetch never silently drops what the operator was doing.
 */
export function boardSync(
	base: Pick<Preset, "version">,
	latest: Pick<Preset, "version">,
	dirty: boolean,
): "same" | "adopt" | "notice" {
	if (latest.version <= base.version) return "same";
	return dirty ? "notice" : "adopt";
}

/**
 * The confirm for "Save as v<n+1>". The board edits no field this modal
 * holds, so every refused issue belongs in the refusal row with its copy:
 * fieldOf places none.
 */
export function SavePresetConfirm({
	open,
	onOpenChange,
	preset,
	name,
	changes,
	pending,
	error,
	onSave,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	preset: Preset;
	name: string;
	changes: Change[];
	pending: boolean;
	error: ApiError | null;
	onSave: () => void;
}) {
	return (
		<ActionModal
			open={open}
			onOpenChange={onOpenChange}
			size="form"
			title="Save team"
			description={`${name.trim() || preset.name}: v${preset.version} becomes v${nextVersion(preset)}. Missions that already applied it keep their copy.`}
			dirty={false}
			submitLabel={`Save as v${nextVersion(preset)}`}
			onSubmit={onSave}
			pending={pending}
			error={error}
			fieldOf={() => null}
			describeIssue={presetIssueCopy}
			changes={
				<WhatChanges data-testid="preset-save-changes" changes={changes} />
			}
			data-testid="preset-save"
		>
			<p className="type-small text-text-muted">
				The team's whole squad is saved as it stands on the board.
			</p>
		</ActionModal>
	);
}

/**
 * Fields | JSON | Request. Fields edits the preset and the picked agent;
 * JSON is the saved record as the contract serves it; Request is the exact
 * PATCH body a save will send, updated as the board changes.
 */
/** An agent's waves in the inspector: toggles, its last one held. */
export function WaveToggles({
	waves,
	onChange,
	error,
}: {
	waves: readonly Wave[];
	onChange: (waves: Wave[]) => void;
	error: string | undefined;
}) {
	return (
		<fieldset className="flex flex-col gap-1.5">
			<legend className="type-small font-medium text-foreground">Waves</legend>
			<div className="flex gap-1">
				{WAVES.map((w) => {
					const on = waves.includes(w);
					return (
						<Button
							key={w}
							size="sm"
							variant="outline"
							aria-pressed={on}
							data-testid={`preset-field-wave-${w}`}
							// Its last wave stays: with none the chip would leave every
							// lane while the row stayed, invalid and out of reach.
							disabledReason={on && waves.length === 1 ? LAST_WAVE : undefined}
							onClick={() =>
								onChange(on ? waves.filter((x) => x !== w) : addWave(waves, w))
							}
							// Several can be on: each is a toggle in v3's one selected
							// state, not a segment.
							className="type-mono aria-pressed:border-selected-border aria-pressed:bg-selected"
						>
							{w}
						</Button>
					);
				})}
			</div>
			{error ? <p className="type-small text-gate-block">{error}</p> : null}
		</fieldset>
	);
}

function Inspector({
	preset,
	team,
	tab,
	onTab,
	fields,
	onFields,
	problems,
	row,
	index,
	names,
	onRow,
	onRemove,
	request,
}: {
	preset: Preset;
	/** The draft as the coverage check reads it. */
	team: Pick<Preset, "id" | "cut" | "agents">;
	tab: InspectorTab;
	onTab: (tab: InspectorTab) => void;
	fields: { name: string; description: string; cut: PresetCut };
	onFields: (
		change: Partial<{ name: string; description: string; cut: PresetCut }>,
	) => void;
	problems: Record<string, string>;
	row: Row | undefined;
	index: number;
	names: Names;
	onRow: (change: Partial<AgentDraft>) => void;
	onRemove: () => void;
	request: ReturnType<typeof changedPresetFields>;
}) {
	const cutId = useId();
	const at = (field: string) => problems[`agents.${index}.${field}`];
	return (
		<Tabs
			value={tab}
			onValueChange={(next) => onTab(next as InspectorTab)}
			data-testid="preset-inspector"
			className="flex min-w-0 flex-col gap-3"
		>
			<TabsList aria-label="Inspector" className="no-scrollbar overflow-x-auto">
				{(
					[
						["coverage", "Coverage"],
						["used-by", "Used by"],
						["history", "History"],
						["fields", "Fields"],
						["source", "Source"],
					] as const
				).map(([id, label]) => (
					<TabsTrigger
						key={id}
						value={id}
						data-testid={`preset-inspector-${id}`}
					>
						{label}
					</TabsTrigger>
				))}
			</TabsList>
			<TabsContent
				value="coverage"
				forceMount
				className="data-[state=inactive]:hidden"
			>
				{/* The draft, checked as it stands on the board. */}
				<PresetCoverage preset={team} />
			</TabsContent>
			<TabsContent
				value="used-by"
				forceMount
				className="data-[state=inactive]:hidden"
			>
				<PresetUsedBy preset={preset} />
			</TabsContent>
			<TabsContent
				value="history"
				forceMount
				className="data-[state=inactive]:hidden"
			>
				<PresetHistory preset={preset} />
			</TabsContent>
			<TabsContent
				value="fields"
				forceMount
				className="flex flex-col gap-4 data-[state=inactive]:hidden"
			>
				<Field label="Name" error={problems.name} testid="preset-field-name">
					{(props) => (
						<Input
							{...props}
							maxLength={200}
							value={fields.name}
							onChange={(e) => onFields({ name: e.target.value })}
						/>
					)}
				</Field>
				<Field
					label="Description"
					hint="Optional"
					error={problems.description}
					testid="preset-field-description"
				>
					{(props) => (
						<Textarea
							{...props}
							rows={2}
							maxLength={500}
							value={fields.description}
							onChange={(e) => onFields({ description: e.target.value })}
						/>
					)}
				</Field>
				<fieldset className="flex flex-col gap-1.5">
					<legend className="type-small font-medium text-foreground">
						Cut
					</legend>
					<RadioGroup
						value={fields.cut}
						onValueChange={(cut) => onFields({ cut: cut as PresetCut })}
						className="flex gap-4"
					>
						{(Object.keys(CUT_LABEL) as PresetCut[]).map((cut) => (
							<label
								key={cut}
								htmlFor={`${cutId}-${cut}`}
								className="type-small flex items-center gap-2 text-foreground"
							>
								<RadioGroupItem
									id={`${cutId}-${cut}`}
									value={cut}
									data-testid={`preset-field-cut-${cut}`}
								/>
								{CUT_LABEL[cut]}
							</label>
						))}
					</RadioGroup>
				</fieldset>

				{row ? (
					<section
						data-testid="preset-field-agent"
						className="flex flex-col gap-3 border-t border-border pt-3"
					>
						<div className="flex items-center justify-between gap-2">
							<h3 className="type-title text-foreground">
								{agentName(agentBodyOf(row.draft), names)}
							</h3>
							<Button
								variant="ghost"
								size="sm"
								data-testid="preset-field-remove"
								onClick={onRemove}
							>
								<Trash2 aria-hidden="true" />
								Remove agent
							</Button>
						</div>
						<WaveToggles
							waves={row.draft.waves}
							onChange={(waves) => onRow({ waves })}
							error={at("waves")}
						/>
						<Field
							label="Territory"
							hint="Optional"
							error={at("territory")}
							testid="preset-field-territory"
						>
							{(props) => (
								<Input
									{...props}
									maxLength={200}
									placeholder="Whole project"
									value={row.draft.territory}
									onChange={(e) => onRow({ territory: e.target.value })}
								/>
							)}
						</Field>
						<Field
							label="Writable paths"
							hint="One per line. Empty keeps the agent's."
							error={at("writablePaths")}
							testid="preset-field-paths"
						>
							{(props) => (
								<Textarea
									{...props}
									rows={2}
									className="type-mono"
									value={row.draft.writablePaths}
									onChange={(e) => onRow({ writablePaths: e.target.value })}
								/>
							)}
						</Field>
						<Field
							label="Estimated tokens"
							hint="Optional. A default; every mission estimates again."
							error={at("estimatedTokens")}
							testid="preset-field-tokens"
						>
							{(props) => (
								<Input
									{...props}
									inputMode="numeric"
									className="tabular-nums"
									value={row.draft.estimatedTokens}
									onChange={(e) => onRow({ estimatedTokens: e.target.value })}
								/>
							)}
						</Field>
					</section>
				) : (
					<p
						data-testid="preset-field-pick"
						className="type-small border-t border-border pt-3 text-text-muted"
					>
						Pick an agent on the board to edit its territory, paths and
						estimate.
					</p>
				)}
			</TabsContent>
			<TabsContent
				value="source"
				forceMount
				className="flex flex-col gap-2 data-[state=inactive]:hidden"
			>
				<h3 className="type-eyebrow">Saved record</h3>
				<CodeView
					data-testid="preset-json"
					label={`${preset.name} as the contract serves it`}
					text={JSON.stringify(preset, null, 2)}
				/>
				<h3 className="type-eyebrow pt-2">Next request</h3>
				<p className="type-mono text-text-subtle">
					{`PATCH /api/presets/${preset.id}`}
				</p>
				{request === null ? (
					<p
						data-testid="preset-request-none"
						className="type-small text-text-muted"
					>
						Nothing to send yet. Change the board and the request shows here.
					</p>
				) : (
					<CodeView
						data-testid="preset-request"
						label="The request body a save will send"
						text={JSON.stringify(request, null, 2)}
					/>
				)}
			</TabsContent>
		</Tabs>
	);
}
