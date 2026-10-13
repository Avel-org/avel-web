import { useQueryClient } from "@tanstack/react-query";
import {
	type AgentTemplate,
	KIND_LABELS,
	ROLE_LABELS,
	type Role,
	type RosterEntry,
	WAVES,
	type Wave,
} from "avel-server/contract";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import {
	type DragEvent,
	type KeyboardEvent,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { ApiError } from "@/lib/api";
import { adjacentWave, isRosterable, moveWave } from "@/lib/api/presets";
import {
	cachedRoster,
	chipWaves,
	entryName,
	useAddRosterEntry,
	useUpdateRosterEntry,
	WAVE_NAME,
	waveTitle,
	withoutWave,
} from "@/lib/api/roster";
import { describeError, PRECONDITION_COPY } from "@/lib/error-map";
import { cn } from "@/lib/utils";
import { HoverCard } from "./hover-card";
import { focusParam } from "./loadout-coherence";
import { territoryTone } from "./preset-board";
import type { AllTemplates } from "./preset-detail";
import { useFlip } from "./preset-flip";

/** Why a Firm template is shown but cannot be added. */
const NOT_ROSTERABLE = PRECONDITION_COPY.template_not_rosterable.what;

const CHIP = "application/x-avel-entry";
const TEMPLATE = "application/x-avel-template";

/** A chip: one entry in one wave. An entry in two waves has two chips. */
type EntryChip = { entryId: string; wave: Wave };

/** A drop that adds the wave instead of moving to it: Alt, Ctrl or ⌘ held. */
export function dropCopies(event: {
	altKey: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
}): boolean {
	return event.altKey || event.ctrlKey || event.metaKey;
}

/**
 * Whether a column takes the keyboard's focus back for its selected chip:
 * only when focus has fallen to the page, as it does when the focused chip
 * unmounts (put down, moved, put back by a refusal). Never from another
 * control the operator moved to.
 */
export function reclaimsFocus(
	selected: EntryChip | null,
	wave: Wave,
	active: Element | null,
	body: Element | null,
): boolean {
	return selected?.wave === wave && (active === null || active === body);
}

/**
 * A chip picked up from the keyboard: the wave it left and the one it is
 * over now. Nothing is sent until it is put down.
 */
type Held = { entryId: string; from: Wave; at: Wave };

/** The waves an entry shows while one of its chips is held. */
export function shownWaves(entry: RosterEntry, held: Held | null): Wave[] {
	if (held === null || held.entryId !== entry.id || held.from === held.at)
		return entry.waves;
	return moveWave(entry.waves, held.from, held.at);
}

/**
 * The first rosterable template holding each role: where a Resolve link for
 * a missing role lands (data-loadout-focus="role:<role>").
 */
export function roleMarkers(
	templates: readonly AgentTemplate[],
): Map<string, Role[]> {
	const marked = new Map<string, Role[]>();
	const seen = new Set<Role>();
	for (const t of templates) {
		if (!isRosterable(t)) continue;
		for (const role of t.roles) {
			if (seen.has(role)) continue;
			seen.add(role);
			marked.set(t.id, [...(marked.get(t.id) ?? []), role]);
		}
	}
	return marked;
}

/**
 * The loadout: the roster as a wave board, A to E. Every change is a roster
 * write, sent as it is made: turning an entry on or off, moving a chip to
 * another wave, adding an agent from the palette. The cached roster takes
 * each answer at once, so coherence beside the board recomputes with it.
 *
 * Keyboard first: a chip's name is a button. Enter or Space picks it up; the
 * left and right arrows carry it across waves; Enter puts it down, which
 * sends the move; Shift+Enter puts it down as an added wave, keeping the one
 * it left; Esc puts it back. Delete takes it off that wave, or asks to
 * remove the entry when it is the last. A pointer drags chips and templates
 * instead, holding Alt or Ctrl to add the wave.
 *
 * Every move is built on the roster in the cache, which holds each patch
 * from the moment it is sent, so two quick moves never undo each other.
 */
export function LoadoutBoard({
	missionId,
	roster,
	templates,
	blockedWave,
	readOnlyReason,
	onEdit,
	onRemove,
}: {
	missionId: string;
	roster: readonly RosterEntry[];
	templates: AllTemplates;
	/** The coherence block's wave (computeCoherence), never derived here. */
	blockedWave: Wave | null;
	/** Set when the mission is not a draft: every control holds, saying why. */
	readOnlyReason: string | null;
	onEdit: (entry: RosterEntry) => void;
	onRemove: (entry: RosterEntry) => void;
}) {
	const queryClient = useQueryClient();
	const update = useUpdateRosterEntry(missionId);
	const add = useAddRosterEntry(missionId);
	const [selected, setSelected] = useState<EntryChip | null>(null);
	const [held, setHeld] = useState<Held | null>(null);
	const [failure, setFailure] = useState<ApiError | null>(null);
	const boardRef = useRef<HTMLOListElement>(null);
	const flip = useFlip(boardRef);

	/** Sends one write; a refusal is shown above the board, never thrown. */
	const send = async (write: () => Promise<unknown>) => {
		setFailure(null);
		try {
			await write();
		} catch (error) {
			setFailure(error as ApiError);
		}
	};

	/** The entry as the cache has it now, any move in flight included. */
	const current = () => cachedRoster(queryClient, missionId) ?? roster;

	/**
	 * Sends a chip's move, or with `copy` its added wave, from `from` to `to`.
	 * A refusal puts the entry back (the update's onError) and the selection
	 * with it, so the keyboard stays on the chip.
	 */
	const sendMove = (chip: EntryChip, to: Wave, copy: boolean) => {
		const waves = chipWaves(current(), chip.entryId, chip.wave, to, copy);
		if (waves === null) return;
		flip(`${chip.entryId}:${chip.wave}`, `${chip.entryId}:${to}`);
		setSelected({ entryId: chip.entryId, wave: copy ? chip.wave : to });
		void send(() =>
			update
				.mutateAsync({ entryId: chip.entryId, patch: { waves } })
				.catch((error: unknown) => {
					setSelected({ entryId: chip.entryId, wave: chip.wave });
					throw error;
				}),
		);
	};

	const moveChip = (chip: EntryChip, to: Wave, copy = false) =>
		sendMove(chip, to, copy);

	/** A held chip moves on the board only; the write waits for put-down. */
	const carry = (step: -1 | 1) => {
		if (!held) return;
		const entry = current().find((e) => e.id === held.entryId);
		if (!entry) return;
		let to = adjacentWave(held.at, step);
		// Skip waves the entry already holds: a chip never lands on its twin.
		while (to && to !== held.from && entry.waves.includes(to))
			to = adjacentWave(to, step);
		if (!to) return;
		flip(`${held.entryId}:${held.at}`, `${held.entryId}:${to}`);
		setHeld({ ...held, at: to });
		setSelected({ entryId: held.entryId, wave: to });
	};

	const putDown = (copy = false) => {
		if (!held) return;
		setHeld(null);
		sendMove({ entryId: held.entryId, wave: held.from }, held.at, copy);
	};

	const putBack = () => {
		if (!held) return;
		flip(`${held.entryId}:${held.at}`, `${held.entryId}:${held.from}`);
		setSelected({ entryId: held.entryId, wave: held.from });
		setHeld(null);
	};

	const dropChip = (chip: EntryChip) => {
		const entry = current().find((e) => e.id === chip.entryId);
		if (!entry) return;
		setHeld(null);
		const rest = withoutWave(entry.waves, chip.wave);
		// Off its last wave, the entry would have none (waves is min 1): ask to
		// remove it instead.
		if (rest === null) onRemove(entry);
		else
			void send(() =>
				update.mutateAsync({ entryId: entry.id, patch: { waves: rest } }),
			);
	};

	const addAgent = (templateId: string, wave: Wave) => {
		// One add at a time: a second for the same template would be a 409.
		if (add.isPending) return;
		const template =
			templates.status === "success"
				? templates.byId.get(templateId)
				: undefined;
		void send(() =>
			add.mutateAsync({
				body: { agentTemplateId: templateId, waves: [wave] },
				template,
			}),
		);
	};

	const setActive = (entry: RosterEntry, active: boolean) =>
		send(() => update.mutateAsync({ entryId: entry.id, patch: { active } }));

	const copy = failure ? describeError(failure) : null;
	const list = templates.status === "success" ? templates.list : [];

	return (
		<div
			data-testid="loadout-board-region"
			className="grid min-w-0 gap-4 2xl:grid-cols-[13rem_minmax(0,1fr)]"
		>
			<Palette
				templates={templates}
				list={list}
				readOnlyReason={readOnlyReason}
				pending={add.isPending}
				onAdd={addAgent}
			/>
			<div className="flex min-w-0 flex-col gap-2">
				{copy ? (
					<div
						role="alert"
						data-testid="loadout-board-failure"
						className="flex flex-wrap items-center gap-2 rounded-md border border-gate-block-line bg-gate-block-soft px-3 py-2"
					>
						<p className="type-small mr-auto text-foreground">
							{`${copy.what} ${copy.next}`}
						</p>
						<Button
							variant="ghost"
							size="sm"
							data-testid="loadout-board-failure-dismiss"
							onClick={() => setFailure(null)}
						>
							Dismiss
						</Button>
					</div>
				) : null}
				<ol
					ref={boardRef}
					aria-label="Waves"
					data-testid="loadout-board"
					aria-busy={update.isPending || add.isPending || undefined}
					className="grid grid-cols-5 gap-2"
				>
					{WAVES.map((wave) => (
						<WaveColumn
							key={wave}
							wave={wave}
							roster={roster}
							held={held}
							selected={selected}
							blocked={blockedWave === wave}
							readOnlyReason={readOnlyReason}
							onSelect={(chip) => {
								setSelected(chip);
								if (held) putDown(false);
								else
									setHeld({
										entryId: chip.entryId,
										from: chip.wave,
										at: chip.wave,
									});
							}}
							onCarry={carry}
							onPutDown={putDown}
							onPutBack={putBack}
							onDropChip={dropChip}
							onMove={moveChip}
							onDropTemplate={(id) => addAgent(id, wave)}
							onActive={setActive}
							onEdit={onEdit}
							onRemove={onRemove}
						/>
					))}
				</ol>
				{readOnlyReason === null ? (
					<p
						data-testid="loadout-board-keys"
						className="type-caption text-text-subtle"
					>
						Enter picks a chip up · ← → carry it · Enter moves it · Shift+Enter
						adds that wave · Esc puts it back · Delete takes it off a wave. Drag
						to move; hold Alt or Ctrl as you drop to add the wave.
					</p>
				) : null}
			</div>
		</div>
	);
}

function WaveColumn({
	wave,
	roster,
	held,
	selected,
	blocked,
	readOnlyReason,
	onSelect,
	onCarry,
	onPutDown,
	onPutBack,
	onDropChip,
	onMove,
	onDropTemplate,
	onActive,
	onEdit,
	onRemove,
}: {
	wave: Wave;
	roster: readonly RosterEntry[];
	held: Held | null;
	selected: EntryChip | null;
	blocked: boolean;
	readOnlyReason: string | null;
	onSelect: (chip: EntryChip) => void;
	onCarry: (step: -1 | 1) => void;
	onPutDown: (copy: boolean) => void;
	onPutBack: () => void;
	onDropChip: (chip: EntryChip) => void;
	onMove: (chip: EntryChip, to: Wave, copy: boolean) => void;
	onDropTemplate: (templateId: string) => void;
	onActive: (entry: RosterEntry, active: boolean) => void;
	onEdit: (entry: RosterEntry) => void;
	onRemove: (entry: RosterEntry) => void;
}) {
	const [over, setOver] = useState(false);
	const inWave = roster.filter((e) => shownWaves(e, held).includes(wave));
	const active = inWave.filter((e) => e.active).length;
	const chipRefs = useRef(new Map<string, HTMLButtonElement>());
	const editable = readOnlyReason === null;

	// The selected chip keeps the keyboard's focus as it moves: its button
	// unmounts and mounts again in another column, or back after a refusal.
	// Members are a dependency, so a chip arriving with the cache's answer is
	// found too.
	const members = inWave.map((e) => e.id).join(" ");
	useEffect(() => {
		void members;
		if (
			selected &&
			reclaimsFocus(selected, wave, document.activeElement, document.body)
		)
			chipRefs.current.get(selected.entryId)?.focus();
	}, [selected, wave, members]);

	const drop = (event: DragEvent) => {
		event.preventDefault();
		setOver(false);
		if (!editable) return;
		const chip = event.dataTransfer.getData(CHIP);
		const template = event.dataTransfer.getData(TEMPLATE);
		if (chip) {
			const [entryId = "", from] = chip.split(":");
			onMove({ entryId, wave: from as Wave }, wave, dropCopies(event));
		} else if (template) {
			onDropTemplate(template);
		}
	};

	return (
		<li
			aria-label={`Wave ${waveTitle(wave)}${blocked ? ", blocked: no active agent" : ""}`}
			data-testid={`loadout-wave-${wave}`}
			data-loadout-focus={focusParam({ kind: "wave", wave })}
			data-count={inWave.length}
			data-blocked={blocked || undefined}
			onDragOver={(event) => {
				if (!editable) return;
				event.preventDefault();
				event.dataTransfer.dropEffect = dropCopies(event) ? "copy" : "move";
				setOver(true);
			}}
			onDragLeave={() => setOver(false)}
			onDrop={drop}
			className={cn(
				"plate flex min-h-48 min-w-0 flex-col gap-1.5 rounded-md border p-2 transition-colors duration-(--duration-micro) ease-avel",
				over && "border-accent",
				held?.at === wave && "bg-state-selected",
				blocked && "border-gate-block-line bg-gate-block-soft",
			)}
		>
			<h3 className="flex items-baseline justify-between gap-1">
				<span className="type-mono-small text-foreground">{wave}</span>
				<span className="type-caption min-w-0 flex-1 truncate text-text-subtle">
					{WAVE_NAME[wave]}
				</span>
				<span
					className="type-mono-small tabular-nums text-text-subtle"
					title={`${active} active of ${inWave.length}`}
				>
					{`${active}/${inWave.length}`}
				</span>
			</h3>
			{blocked ? (
				<p
					data-testid={`loadout-wave-${wave}-blocked`}
					className="type-caption font-medium text-gate-block"
				>
					Needs an active agent
				</p>
			) : null}
			<ul className="flex flex-col gap-1.5">
				{inWave.map((entry) => {
					const isSelected =
						selected?.entryId === entry.id && selected.wave === wave;
					const isHeld = held?.entryId === entry.id && held.at === wave;
					// The entry's first wave carries its Resolve marker: one per entry.
					const marker =
						shownWaves(entry, held)[0] === wave
							? focusParam({ kind: "entry", id: entry.id })
							: undefined;
					const name = entryName(entry);
					const keys = (event: KeyboardEvent) => {
						if (!isHeld) {
							if (
								editable &&
								(event.key === "Delete" || event.key === "Backspace")
							) {
								event.preventDefault();
								onDropChip({ entryId: entry.id, wave });
							}
							return;
						}
						if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
							event.preventDefault();
							onCarry(event.key === "ArrowLeft" ? -1 : 1);
						} else if (event.key === "Enter" && event.shiftKey) {
							// Before the click Enter would make: this put-down adds.
							event.preventDefault();
							onPutDown(true);
						} else if (event.key === "Escape") {
							event.preventDefault();
							onPutBack();
						}
					};
					return (
						<li
							key={entry.id}
							data-testid={`loadout-chip-${entry.id}-${wave}`}
							data-flip={`${entry.id}:${wave}`}
							data-loadout-focus={marker}
							data-active={entry.active || undefined}
							className={cn(
								"flex flex-col gap-1 rounded-sm border bg-card px-2 py-1.5",
								territoryTone(entry.territory),
								!entry.active && "border-dashed opacity-(--opacity-disabled)",
								isSelected && "bg-state-selected",
								isHeld && "shadow-e2",
							)}
						>
							<button
								type="button"
								ref={(el) => {
									if (el) chipRefs.current.set(entry.id, el);
									else chipRefs.current.delete(entry.id);
								}}
								draggable={editable}
								aria-pressed={isHeld}
								aria-disabled={!editable || undefined}
								data-testid={`loadout-chip-${entry.id}-${wave}-pick`}
								title={name}
								onDragStart={(event) =>
									event.dataTransfer.setData(CHIP, `${entry.id}:${wave}`)
								}
								onClick={() => {
									if (editable) onSelect({ entryId: entry.id, wave });
								}}
								onKeyDown={keys}
								className="flex min-w-0 flex-col text-left focus-inset"
							>
								<span className="type-caption truncate font-medium text-foreground">
									{entry.agentTemplate.name}
								</span>
								{entry.territory ? (
									<span className="type-caption truncate text-text-subtle">
										{entry.territory}
									</span>
								) : null}
								<span className="sr-only">
									{isHeld
										? ", picked up: arrows move it, Enter moves it here, Shift+Enter adds this wave, Esc puts it back"
										: entry.active
											? ", active"
											: ", idle"}
								</span>
							</button>
							<div className="flex items-center gap-1">
								<Switch
									size="sm"
									checked={entry.active}
									aria-label={`${name} active`}
									data-testid={`loadout-chip-${entry.id}-${wave}-active`}
									disabledReason={readOnlyReason ?? undefined}
									onCheckedChange={(on) => onActive(entry, on)}
								/>
								<Button
									variant="ghost"
									size="icon-xs"
									className="ml-auto"
									aria-label={`Edit ${name}`}
									data-testid={`loadout-chip-${entry.id}-${wave}-edit`}
									onClick={() => onEdit(entry)}
								>
									<Pencil aria-hidden="true" />
								</Button>
								<Button
									variant="ghost"
									size="icon-xs"
									aria-label={`Remove ${name}`}
									data-testid={`loadout-chip-${entry.id}-${wave}-remove`}
									disabledReason={readOnlyReason ?? undefined}
									onClick={() => onRemove(entry)}
								>
									<Trash2 aria-hidden="true" />
								</Button>
							</div>
						</li>
					);
				})}
			</ul>
		</li>
	);
}

/**
 * The available agents: every rosterable template, to add to the chosen
 * wave or drag onto one. A Firm template is shown, held with
 * template_not_rosterable's reason. The first template holding each role
 * carries that role's Resolve marker.
 */
function Palette({
	templates,
	list,
	readOnlyReason,
	pending,
	onAdd,
}: {
	templates: AllTemplates;
	list: readonly AgentTemplate[];
	readOnlyReason: string | null;
	pending: boolean;
	onAdd: (templateId: string, wave: Wave) => void;
}) {
	const [wave, setWave] = useState<Wave>("A");
	const legend = useId();
	const markers = roleMarkers(list);
	return (
		<section
			aria-label="Available agents"
			data-testid="loadout-palette"
			className="plate flex min-w-0 flex-col gap-2 rounded-md border p-3"
		>
			<h3 className="type-panel-title text-foreground">Available agents</h3>
			<fieldset className="flex flex-wrap items-center gap-1">
				<legend id={legend} className="sr-only">
					Wave to add to
				</legend>
				<span className="type-caption text-text-subtle">to wave</span>
				{WAVES.map((w) => (
					<Button
						key={w}
						size="sm"
						variant="ghost"
						aria-pressed={wave === w}
						data-testid={`loadout-palette-wave-${w}`}
						onClick={() => setWave(w)}
						className="type-mono-small aria-pressed:bg-state-selected"
					>
						{w}
					</Button>
				))}
			</fieldset>
			{templates.status === "pending" ? (
				<p
					data-testid="loadout-palette-loading"
					className="type-small text-text-muted"
				>
					Reading the agents.
				</p>
			) : templates.status === "error" ? (
				<p
					data-testid="loadout-palette-error"
					className="type-small text-text-muted"
				>
					The agents could not be read, so none can be added. Reload to try
					again.
				</p>
			) : (
				<ul className="flex flex-wrap gap-1 2xl:flex-col">
					{list.map((t) => {
						const roles = markers.get(t.id) ?? [];
						return (
							<li
								key={t.id}
								className="flex flex-col"
								// Every role this template is first for, space-separated:
								// the page finds a marker with ~=.
								data-loadout-focus={
									roles.length > 0
										? roles
												.map((role) => focusParam({ kind: "role", role }))
												.join(" ")
										: undefined
								}
							>
								{isRosterable(t) ? (
									<HoverCard
										data-testid={`loadout-palette-preview-${t.slug}`}
										trigger={
											<Button
												size="sm"
												variant="outline"
												draggable={readOnlyReason === null}
												data-testid={`loadout-palette-${t.slug}`}
												disabledReason={
													readOnlyReason ??
													(pending ? "Adding an agent." : undefined)
												}
												onDragStart={(event) =>
													event.dataTransfer.setData(TEMPLATE, t.id)
												}
												onClick={() => onAdd(t.id, wave)}
												className="justify-start 2xl:w-full"
											>
												<Plus aria-hidden="true" />
												<span className="truncate">{t.name}</span>
											</Button>
										}
									>
										<TemplatePreview template={t} />
									</HoverCard>
								) : (
									<Button
										size="sm"
										variant="outline"
										data-testid={`loadout-palette-${t.slug}`}
										disabledReason={NOT_ROSTERABLE}
										className="justify-start 2xl:w-full"
									>
										<Lock aria-hidden="true" />
										<span className="truncate">{t.name}</span>
									</Button>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}

function TemplatePreview({ template }: { template: AgentTemplate }) {
	return (
		<div className="flex flex-col gap-1">
			<p className="type-small font-medium text-foreground">{template.name}</p>
			<p className="type-mono-small text-text-subtle">{template.slug}</p>
			<p className="type-caption text-text-muted">
				{KIND_LABELS[template.kind]}
			</p>
			<p className="type-caption text-text-muted">
				{template.roles.map((role) => ROLE_LABELS[role]).join(", ") ||
					"No roles"}
			</p>
			<p className="type-caption text-text-muted">
				{`Default waves: ${template.waveDefaults.join(", ") || "none"}`}
			</p>
		</div>
	);
}
