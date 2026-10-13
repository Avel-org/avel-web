import {
	type AgentTemplate,
	type Preset,
	WAVES,
	type Wave,
} from "avel-server/contract";
import { ArrowLeft, Lock, Plus, Rocket, Trash2 } from "lucide-react";
import {
	type DragEvent,
	type KeyboardEvent,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { ApiError } from "@/lib/api";
import {
	type AgentDraft,
	addWave,
	adjacentWave,
	agentBodyOf,
	agentDraftOf,
	CUT_LABEL,
	changedPresetFields,
	isRosterable,
	moveWave,
	nextVersion,
	type PresetCut,
	type PresetDraft,
	presetDraftOf,
	presetIssueCopy,
	presetProblems,
	useUpdatePreset,
} from "@/lib/api/presets";
import { PRECONDITION_COPY } from "@/lib/error-map";
import { cn } from "@/lib/utils";
import { ActionModal, closeIntent } from "./action-modal";
import { Field } from "./client-form";
import { CodeView } from "./code-view";
import { HoverCard } from "./hover-card";
import { territoryTone } from "./preset-board";
import { agentName } from "./preset-compare";
import { type Names, useAllTemplates } from "./preset-detail";
import { useFlip } from "./preset-flip";
import { presetChanges } from "./preset-form";
import { PresetSections } from "./preset-sections";
import { type Change, WhatChanges } from "./what-changes";

/** Why Apply waits while the board has unsaved changes. */
export const APPLY_WAITS =
	"Save or discard your changes first: applying uses the saved team.";

/** Why a Firm template is shown but cannot be added. */
const NOT_ROSTERABLE = PRECONDITION_COPY.template_not_rosterable.what;

/** An agent row with a key of its own: the board adds and removes rows. */
type Row = { uid: number; draft: AgentDraft };

/** A chip: one agent in one wave. An agent in two waves has two chips. */
type ChipRef = { uid: number; wave: Wave };

const CHIP = "application/x-avel-chip";
const TEMPLATE = "application/x-avel-template";

/**
 * A preset expanded in place into its full wave board, to edit. Moving a
 * chip, adding or removing an agent, or changing a field builds an unsaved
 * diff, pinned at the bottom with Save as v<n+1>; saving uses the preset
 * update route, and nothing is sent until then.
 *
 * Keyboard first: a chip is a button. Enter or Space picks it up; the left
 * and right arrows move it between waves; Enter or Esc puts it down; Delete
 * takes it off that wave. A pointer can drag chips and templates instead.
 */
export function PresetKanban({
	preset: latest,
	names,
	onClose,
	onApply,
	onSaved,
}: {
	/** The preset as the server has it now; the board edits its own base copy. */
	preset: Preset;
	names: Names;
	onClose: () => void;
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
	const [closing, setClosing] = useState(false);
	const update = useUpdatePreset();
	const boardRef = useRef<HTMLOListElement>(null);
	const flip = useFlip(boardRef);

	const draft: PresetDraft = { ...fields, agents: rows.map((r) => r.draft) };
	const patch = changedPresetFields(preset, draft);
	const problems = presetProblems(draft);
	const problemCount = Object.keys(problems).length;
	const changes = presetChanges(preset, draft, names);
	const sync = boardSync(preset, latest, patch !== null);

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

	const requestClose = () => {
		if (closeIntent(patch !== null, update.isPending) === "ask")
			setClosing(true);
		else onClose();
	};

	const save = async () => {
		if (patch === null) return;
		try {
			// Awaited, not mutate's per-call callbacks: those are dropped if the
			// board re-renders from a refetch first.
			const saved = await update.mutateAsync({ id: preset.id, patch });
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
	const moveChip = (chip: ChipRef, to: Wave) => {
		const row = rows.find((r) => r.uid === chip.uid);
		if (!row || chip.wave === to) return;
		// The chip travels from its old column instead of appearing.
		flip(`${chip.uid}:${chip.wave}`, `${chip.uid}:${to}`);
		setRow(chip.uid, { waves: moveWave(row.draft.waves, chip.wave, to) });
		setSelected({ uid: chip.uid, wave: to });
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

	return (
		<section
			aria-label={`${preset.name}, editing`}
			data-testid="preset-kanban"
			className="flex flex-col gap-4"
		>
			<header className="flex flex-wrap items-center gap-2">
				<Button
					variant="ghost"
					size="sm"
					data-testid="preset-kanban-close"
					onClick={requestClose}
				>
					<ArrowLeft aria-hidden="true" />
					All teams
				</Button>
				<h2 className="type-h2 min-w-0 truncate text-foreground">
					{preset.name}
				</h2>
				<Badge variant="tag">{CUT_LABEL[preset.cut]}</Badge>
				<Badge variant="tag" data-testid="preset-kanban-version">
					{`v${preset.version}`}
				</Badge>
				<Button
					size="sm"
					className="ml-auto"
					data-testid="preset-kanban-apply"
					disabledReason={patch !== null ? APPLY_WAITS : undefined}
					onClick={() => onApply(preset)}
				>
					<Rocket aria-hidden="true" />
					Apply to mission
				</Button>
			</header>

			{closing ? (
				<div
					role="alertdialog"
					aria-label="Discard changes?"
					data-testid="preset-kanban-closing"
					className="flex flex-wrap items-center justify-end gap-2 rounded-md border border-gate-warn-line bg-gate-warn-soft px-3 py-2"
				>
					<p className="type-small mr-auto text-foreground">
						Leave the board and discard what you changed?
					</p>
					<Button
						variant="ghost"
						size="sm"
						autoFocus
						data-testid="preset-kanban-closing-keep"
						onClick={() => setClosing(false)}
					>
						Keep editing
					</Button>
					<Button
						variant="destructive"
						size="sm"
						data-testid="preset-kanban-closing-discard"
						onClick={onClose}
					>
						Discard
					</Button>
				</div>
			) : null}
			{sync === "notice" ? (
				<div
					aria-live="polite"
					data-testid="preset-kanban-newer"
					className="flex flex-wrap items-center gap-2 rounded-md border border-border-strong bg-app-band px-3 py-2"
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

			<div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_26rem]">
				<div className="flex min-w-0 flex-col gap-4">
					<ol
						ref={boardRef}
						aria-label="Waves"
						data-testid="preset-kanban-board"
						className="grid grid-cols-5 gap-2"
					>
						{WAVES.map((wave) => (
							<WaveColumn
								key={wave}
								wave={wave}
								rows={rows}
								names={names}
								problems={problems}
								selected={selected}
								holding={holding}
								onSelect={(chip) => {
									// Enter or a click picks a chip up; again puts it down,
									// still selected so the inspector keeps it.
									const same =
										selected?.uid === chip.uid && selected.wave === chip.wave;
									setSelected(chip);
									setHolding(!(same && holding));
								}}
								onMove={moveChip}
								onPutDown={() => setHolding(false)}
								onDropChip={dropChip}
								onDropTemplate={(id) => addAgent({ id }, wave)}
							/>
						))}
					</ol>
					<Palette onAdd={addAgent} />
				</div>

				<Inspector
					preset={preset}
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
			</div>

			<PresetSections preset={preset} names={names} />

			{patch !== null ? (
				<div
					data-testid="preset-kanban-strip"
					className="plate-float sticky bottom-0 z-(--z-raised) flex flex-col gap-2 rounded-md border bg-popover p-3"
				>
					<WhatChanges data-testid="preset-kanban-changes" changes={changes} />
					<div className="flex flex-wrap items-center justify-end gap-2">
						{problemCount > 0 ? (
							<p
								data-testid="preset-kanban-problems"
								className="mr-auto type-small text-gate-block"
							>
								{problemCount === 1
									? "1 field needs attention: it is marked in Fields."
									: `${problemCount} fields need attention: they are marked in Fields.`}
							</p>
						) : null}
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
									onClick={() => setDiscarding(false)}
								>
									Keep editing
								</Button>
								<Button
									variant="destructive"
									size="sm"
									data-testid="preset-kanban-discard-confirm"
									onClick={discard}
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
									onClick={() => setDiscarding(true)}
								>
									Discard
								</Button>
								<Button
									size="sm"
									data-testid="preset-kanban-save"
									disabledReason={
										problemCount > 0
											? "Fix the marked fields first."
											: undefined
									}
									onClick={() => setSaving(true)}
								>
									<span
										// Re-keyed on the diff, so the label slides up as it changes.
										key={changes.length}
										className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 duration-(--duration-state) ease-avel"
									>
										{`Save as v${nextVersion(preset)}`}
									</span>
								</Button>
							</>
						)}
					</div>
				</div>
			) : null}

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

function WaveColumn({
	wave,
	rows,
	names,
	problems,
	selected,
	holding,
	onSelect,
	onMove,
	onPutDown,
	onDropChip,
	onDropTemplate,
}: {
	wave: Wave;
	rows: Row[];
	names: Names;
	problems: Record<string, string>;
	selected: ChipRef | null;
	holding: boolean;
	onSelect: (chip: ChipRef) => void;
	onMove: (chip: ChipRef, to: Wave) => void;
	onPutDown: () => void;
	onDropChip: (chip: ChipRef) => void;
	onDropTemplate: (templateId: string) => void;
}) {
	const [over, setOver] = useState(false);
	const inWave = rows
		.map((row, index) => ({ row, index }))
		.filter(({ row }) => row.draft.waves.includes(wave));
	const chipRefs = useRef(new Map<number, HTMLButtonElement>());

	// A chip moved into this column keeps the keyboard's focus.
	useEffect(() => {
		if (selected?.wave === wave) chipRefs.current.get(selected.uid)?.focus();
	}, [selected, wave]);

	const drop = (event: DragEvent) => {
		event.preventDefault();
		setOver(false);
		const chip = event.dataTransfer.getData(CHIP);
		const template = event.dataTransfer.getData(TEMPLATE);
		if (chip) {
			const [uid, from] = chip.split(":");
			onMove({ uid: Number(uid), wave: from as Wave }, wave);
		} else if (template) {
			onDropTemplate(template);
		}
	};

	return (
		<li
			aria-label={`Wave ${wave}`}
			data-testid={`preset-kanban-wave-${wave}`}
			data-count={inWave.length}
			onDragOver={(event) => {
				event.preventDefault();
				setOver(true);
			}}
			onDragLeave={() => setOver(false)}
			onDrop={drop}
			className={cn(
				"plate flex min-h-40 min-w-0 flex-col gap-1.5 rounded-md border p-2 transition-colors duration-(--duration-micro) ease-avel",
				over && "border-accent",
				// The column holding the picked-up chip takes the selected fill.
				holding && selected?.wave === wave && "bg-state-selected",
			)}
		>
			<h3 className="type-mono-small flex items-center justify-between text-text-subtle">
				{wave}
				<span className="tabular-nums">{inWave.length}</span>
			</h3>
			<ul className="flex flex-col gap-1">
				{inWave.map(({ row, index }) => {
					const isSelected =
						selected?.uid === row.uid && selected.wave === wave;
					const flagged = Object.keys(problems).some((k) =>
						k.startsWith(`agents.${index}.`),
					);
					const name =
						row.draft.agentTemplateId === ""
							? "No agent"
							: agentName(agentBodyOf(row.draft), names);
					const keyMove = (event: KeyboardEvent) => {
						if (!isSelected || !holding) return;
						if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
							event.preventDefault();
							const to = adjacentWave(wave, event.key === "ArrowLeft" ? -1 : 1);
							if (to) onMove({ uid: row.uid, wave }, to);
						} else if (event.key === "Escape") {
							event.preventDefault();
							onPutDown();
						} else if (event.key === "Delete" || event.key === "Backspace") {
							event.preventDefault();
							onDropChip({ uid: row.uid, wave });
						}
					};
					return (
						<li key={row.uid}>
							<Button
								ref={(el) => {
									if (el) chipRefs.current.set(row.uid, el);
									else chipRefs.current.delete(row.uid);
								}}
								variant="outline"
								size="sm"
								draggable
								aria-pressed={isSelected}
								data-testid={`preset-chip-${row.uid}-${wave}`}
								data-flip={`${row.uid}:${wave}`}
								data-holding={(isSelected && holding) || undefined}
								data-flagged={flagged || undefined}
								title={
									row.draft.territory
										? `${name} · ${row.draft.territory}`
										: name
								}
								onDragStart={(event) =>
									event.dataTransfer.setData(CHIP, `${row.uid}:${wave}`)
								}
								onClick={() => onSelect({ uid: row.uid, wave })}
								onKeyDown={keyMove}
								className={cn(
									"h-auto w-full justify-start px-2 py-1 text-left whitespace-normal",
									territoryTone(row.draft.territory.trim() || null),
									isSelected && "bg-state-selected",
									isSelected && holding && "shadow-e2",
									flagged && "border-gate-block-line",
								)}
							>
								<span className="flex min-w-0 flex-col">
									<span className="type-caption truncate text-foreground">
										{name}
									</span>
									{row.draft.territory.trim() ? (
										<span className="type-caption truncate text-text-subtle">
											{row.draft.territory.trim()}
										</span>
									) : null}
								</span>
								<span className="sr-only">
									{isSelected && holding
										? ", picked up: arrows move it, Enter puts it down"
										: ""}
								</span>
							</Button>
						</li>
					);
				})}
			</ul>
		</li>
	);
}

/**
 * The templates an agent can come from. A Firm template is shown, disabled
 * with template_not_rosterable's reason: Firm agents never join a roster.
 * Choose the wave, then a template; or drag a template onto a wave.
 */
function Palette({
	onAdd,
}: {
	onAdd: (template: Pick<AgentTemplate, "id">, wave: Wave) => void;
}) {
	const templates = useAllTemplates();
	const [wave, setWave] = useState<Wave>("A");
	const list = templates.status === "success" ? templates.list : [];
	const id = useId();
	return (
		<section
			aria-label="Add an agent"
			data-testid="preset-palette"
			className="plate flex flex-col gap-2 rounded-md border p-3"
		>
			<div className="flex flex-wrap items-center gap-3">
				<h3 className="type-panel-title text-foreground">Add an agent</h3>
				<fieldset className="flex items-center gap-1">
					<legend id={id} className="sr-only">
						Wave to add to
					</legend>
					<span className="type-caption text-text-subtle">to wave</span>
					{WAVES.map((w) => (
						<Button
							key={w}
							size="sm"
							variant="ghost"
							aria-pressed={wave === w}
							data-testid={`preset-palette-wave-${w}`}
							onClick={() => setWave(w)}
							className="type-mono-small aria-pressed:bg-state-selected"
						>
							{w}
						</Button>
					))}
				</fieldset>
			</div>
			<ul className="flex flex-wrap gap-1.5">
				{list.map((t) => (
					<li key={t.id}>
						{isRosterable(t) ? (
							<HoverCard
								data-testid={`preset-palette-preview-${t.slug}`}
								trigger={
									<Button
										size="sm"
										variant="outline"
										draggable
										data-testid={`preset-palette-${t.slug}`}
										onDragStart={(event) =>
											event.dataTransfer.setData(TEMPLATE, t.id)
										}
										onClick={() => onAdd(t, wave)}
									>
										<Plus aria-hidden="true" />
										{t.name}
									</Button>
								}
							>
								<TemplatePreview template={t} />
							</HoverCard>
						) : (
							<Button
								size="sm"
								variant="outline"
								data-testid={`preset-palette-${t.slug}`}
								disabledReason={NOT_ROSTERABLE}
							>
								<Lock aria-hidden="true" />
								{t.name}
							</Button>
						)}
					</li>
				))}
			</ul>
		</section>
	);
}

function TemplatePreview({ template }: { template: AgentTemplate }) {
	return (
		<div className="flex flex-col gap-1">
			<p className="type-small font-medium text-foreground">{template.name}</p>
			<p className="type-mono-small text-text-subtle">{template.slug}</p>
			<p className="type-caption text-text-muted">
				{`${template.kind} · ${template.roles.join(", ") || "no roles"}`}
			</p>
			<p className="type-caption text-text-muted">
				{`Default waves: ${template.waveDefaults.join(" · ") || "none"}`}
			</p>
		</div>
	);
}

/**
 * Fields | JSON | Request. Fields edits the preset and the picked agent;
 * JSON is the saved record as the contract serves it; Request is the exact
 * PATCH body a save will send, updated as the board changes.
 */
function Inspector({
	preset,
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
			defaultValue="fields"
			data-testid="preset-inspector"
			className="plate flex min-w-0 flex-col gap-3 rounded-md border p-3"
		>
			<TabsList aria-label="Inspector">
				<TabsTrigger value="fields" data-testid="preset-inspector-fields">
					Fields
				</TabsTrigger>
				<TabsTrigger value="json" data-testid="preset-inspector-json">
					JSON
				</TabsTrigger>
				<TabsTrigger value="request" data-testid="preset-inspector-request">
					Request
				</TabsTrigger>
			</TabsList>
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
							<h3 className="type-panel-title text-foreground">
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
						<fieldset className="flex flex-col gap-1.5">
							<legend className="type-small font-medium text-foreground">
								Waves
							</legend>
							<div className="flex gap-1">
								{WAVES.map((w) => {
									const on = row.draft.waves.includes(w);
									return (
										<Button
											key={w}
											size="sm"
											variant="outline"
											aria-pressed={on}
											data-testid={`preset-field-wave-${w}`}
											onClick={() =>
												onRow({
													waves: on
														? row.draft.waves.filter((x) => x !== w)
														: addWave(row.draft.waves, w),
												})
											}
											className="type-mono-small aria-pressed:bg-state-selected"
										>
											{w}
										</Button>
									);
								})}
							</div>
							{at("waves") ? (
								<p className="type-small text-gate-block">{at("waves")}</p>
							) : null}
						</fieldset>
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
									className="type-mono-small"
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
				value="json"
				forceMount
				className="data-[state=inactive]:hidden"
			>
				<CodeView
					data-testid="preset-json"
					label={`${preset.name} as the contract serves it`}
					text={JSON.stringify(preset, null, 2)}
				/>
			</TabsContent>
			<TabsContent
				value="request"
				forceMount
				className="flex flex-col gap-2 data-[state=inactive]:hidden"
			>
				<p className="type-mono-small text-text-subtle">
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
