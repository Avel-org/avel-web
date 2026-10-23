import {
	type AgentTemplate,
	ROLE_LABELS,
	ROLE_SIDE,
	type Role,
	SIDE_LABELS,
	SIDES,
	type Side,
	WAVES,
	type Wave,
} from "avel-server/contract";
import { ArrowDownToLine, Check, GripVertical, Lock } from "lucide-react";
import { type DragEvent, type KeyboardEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { isRosterable } from "@/lib/api/presets";
import { PRECONDITION_COPY } from "@/lib/error-map";
import { cn } from "@/lib/utils";
import { initialsOf } from "./actor";
import type { ComposerRequirements } from "./preset-coverage-grid";
import { SearchField } from "./search-field";
import { StatusGlyph, type StatusTone } from "./status-pill";

/*
 * The composer's wave lanes and its agent tray. A lane is the whole drop
 * zone: full height, v3's selected fill and edge on drag-over, an accent
 * line where the drop will land, and a dashed "Drop agents here" slot at its
 * end while anything is dragged (or always, while it is empty). Its header
 * says what the wave is for and whether the playbook that uses the team is
 * satisfied there. A chip is a v3 .menu-row: the agent's tile, full name and
 * territory, a grip on hover and focus, lifted on shadow-drag while held,
 * and a dashed placeholder where it was while it is dragged away, so the
 * lane does not jump. A drop that cannot be made says why at the lane's
 * foot. The keyboard's moves are read out by the board's live region
 * (positionText).
 *
 * Everything here is presentational: the board owns the draft and the drag.
 */

/** What is being dragged: a chip off a lane, or a template off the tray. */
export type DragSource =
	| { kind: "chip"; uid: number; wave: Wave }
	| { kind: "template"; templateId: string };

/** One chip as a lane draws it. */
export type LaneChip = {
	uid: number;
	name: string;
	territory: string;
	flagged: boolean;
};

/** One agent row, as the drop rules read it. */
export type LaneRow = {
	uid: number;
	templateId: string;
	territory: string;
	waves: readonly Wave[];
};

/** Why a drop cannot be made, or null when it can. */
export function dropProblem(
	rows: readonly LaneRow[],
	source: DragSource,
	to: Wave,
	nameOf: (row: LaneRow) => string,
	templates: ReadonlyMap<
		string,
		Pick<AgentTemplate, "name" | "kind" | "roles">
	>,
): string | null {
	if (source.kind === "chip") {
		const row = rows.find((r) => r.uid === source.uid);
		if (!row || source.wave === to) return null;
		return row.waves.includes(to)
			? `${nameOf(row)} is already in wave ${to}.`
			: null;
	}
	const template = templates.get(source.templateId);
	if (template && !isRosterable(template))
		return PRECONDITION_COPY.template_not_rosterable.what;
	const twin = rows.find(
		(r) =>
			r.templateId === source.templateId &&
			r.territory.trim() === "" &&
			r.waves.includes(to),
	);
	return twin
		? `${nameOf(twin)} is already in wave ${to}. Give one a territory to add it twice.`
		: null;
}

/**
 * The rows with one moved to sit before another (or last). Order is the
 * squad's: a row in several waves holds the same place in each.
 */
export function placeBefore<R extends { uid: number }>(
	rows: readonly R[],
	uid: number,
	before: number | null,
): R[] {
	const moving = rows.find((r) => r.uid === uid);
	if (!moving || moving.uid === before) return [...rows];
	const rest = rows.filter((r) => r.uid !== uid);
	const at = before === null ? -1 : rest.findIndex((r) => r.uid === before);
	if (at === -1) return [...rest, moving];
	return [...rest.slice(0, at), moving, ...rest.slice(at)];
}

/** Where a chip stands, as the live region reads it out. */
export function positionText(
	name: string,
	wave: Wave,
	index: number,
	count: number,
): string {
	return `${name}, wave ${wave}, position ${index + 1} of ${count}.`;
}

/**
 * What a lane's header says, in two short lines: how many fill it, then
 * what the team's playbooks ask of the wave; and a glyph. The contract asks
 * one thing per wave: that a playbook's earliest declared wave has an agent
 * (computeCoherence's first-wave block). So the glyph warns on that wave
 * while it is empty, passes only on a lane with agents where nothing is
 * missing, and is pending on any other empty lane: an empty lane is never a
 * pass. The full sentence is the title and the screen reader's text.
 */
/** A lane header's glyph colour: the lanes' and Coverage's wave columns. */
export function laneGlyphClass(tone: StatusTone): string {
	return tone === "warn"
		? "text-gate-warn"
		: tone === "pass"
			? "text-gate-pass"
			: "text-gate-pending";
}

export function laneStatus(
	wave: Wave,
	count: number,
	requirements: ComposerRequirements,
): { tone: StatusTone; count: string; note: string; title: string } {
	const agents = `${count} ${count === 1 ? "agent" : "agents"}`;
	const required = requirements.waves[wave];
	if (required)
		return {
			tone: "warn",
			count: agents,
			note: "Needed to start",
			title: required,
		};
	const by = requirements.declared[wave];
	// A count, not the name: playbook names run long, and the title has them.
	const runs =
		by === undefined
			? null
			: `${by.length} ${by.length === 1 ? "playbook runs" : "playbooks run"} it`;
	if (requirements.checkedBy.length === 0)
		return {
			tone: "pending",
			count: agents,
			note: "Not checked",
			title: "No playbook uses this team, so nothing checks this wave.",
		};
	if (count === 0)
		return {
			tone: "pending",
			count: agents,
			note: runs ?? "Not in a playbook",
			title: by
				? `${by.join(", ")} declares wave ${wave}; it has no agent yet, and only the earliest wave is required to start.`
				: `No playbook that uses this team declares wave ${wave}.`,
		};
	return {
		tone: "pass",
		count: agents,
		note: runs ?? "Not in a playbook",
		title: by
			? `${by.join(", ")} declares wave ${wave}; it is staffed, and nothing the contract checks is missing.`
			: `No playbook that uses this team declares wave ${wave}.`,
	};
}

const TILE =
	"inline-flex size-6 shrink-0 items-center justify-center rounded-sm border border-border bg-app-well type-caption font-semibold text-text-muted";

/** One lane, A to E. */
export function WaveLane({
	wave,
	chips,
	requirements,
	selectedUid,
	holding,
	drag,
	over,
	insertAt,
	problem,
	landedUid,
	chipRef,
	onDragOverAt,
	onDragLeave,
	onDropHere,
	onChipDragStart,
	onChipDragEnd,
	onChipClick,
	onChipKey,
}: {
	wave: Wave;
	chips: readonly LaneChip[];
	requirements: ComposerRequirements;
	selectedUid: number | null;
	holding: boolean;
	drag: DragSource | null;
	/** Something is being dragged over this lane. */
	over: boolean;
	/** Where the drop will land: before the chip at this index, or at the end. */
	insertAt: number | null;
	/** Why the last drop here could not be made. */
	problem?: string;
	landedUid: number | null;
	chipRef?: (uid: number, el: HTMLButtonElement | null) => void;
	onDragOverAt?: (index: number) => void;
	onDragLeave?: () => void;
	onDropHere?: (index: number) => void;
	onChipDragStart?: (uid: number, event: DragEvent) => void;
	onChipDragEnd?: () => void;
	onChipClick?: (uid: number) => void;
	onChipKey?: (uid: number, event: KeyboardEvent) => void;
}) {
	const listRef = useRef<HTMLUListElement>(null);
	const status = laneStatus(wave, chips.length, requirements);
	const required = requirements.waves[wave];
	/** The index a pointer at this height would drop at. */
	const indexAt = (clientY: number) => {
		const items =
			listRef.current?.querySelectorAll<HTMLElement>("[data-lane-chip]");
		if (!items) return chips.length;
		for (const [i, el] of [...items].entries()) {
			const box = el.getBoundingClientRect();
			if (clientY < box.top + box.height / 2) return i;
		}
		return chips.length;
	};
	const line = (i: number) =>
		over && insertAt === i ? (
			<li
				aria-hidden="true"
				data-testid={`preset-lane-${wave}-insert-${i}`}
				className="h-0.5 rounded-full bg-accent"
			/>
		) : null;
	const empty = chips.length === 0;
	return (
		<li
			aria-label={`Wave ${wave}`}
			data-testid={`preset-kanban-wave-${wave}`}
			data-count={chips.length}
			data-over={over || undefined}
			data-required={required !== undefined || undefined}
			data-status={status.tone}
			onDragOver={(event) => {
				event.preventDefault();
				onDragOverAt?.(indexAt(event.clientY));
			}}
			onDragLeave={(event) => {
				// Only when the pointer leaves the lane, not a chip inside it.
				if (!event.currentTarget.contains(event.relatedTarget as Node | null))
					onDragLeave?.();
			}}
			onDrop={(event) => {
				event.preventDefault();
				onDropHere?.(indexAt(event.clientY));
			}}
			className={cn(
				// As tall as its chips and one drop slot; 9rem at least, so an
				// empty lane is still a clear target. The board makes the lanes
				// one height, the tallest's.
				"flex min-h-36 min-w-0 flex-col gap-1.5 rounded-card border p-2 transition-colors duration-(--duration-micro) ease-avel",
				over
					? "border-selected-border bg-selected"
					: holding && chips.some((c) => c.uid === selectedUid)
						? "border-border bg-selected"
						: "border-border bg-app-well",
			)}
		>
			{/* One line: the wave, its count, the glyph. Two facts, two
			    elements with a gap: no middle dot (ruling 4). The playbook's
			    note is in the tooltip and read out. */}
			<header
				data-testid={`preset-lane-${wave}-header`}
				title={`${status.note}. ${status.title}`}
				className="flex items-center gap-2 px-0.5"
			>
				<h3 className="shrink-0 type-small font-medium text-text">{`Wave ${wave}`}</h3>
				<span
					data-testid={`preset-lane-${wave}-line`}
					className="min-w-0 flex-1 truncate type-caption tabular-nums"
				>
					{status.count}
				</span>
				<StatusGlyph
					tone={status.tone}
					className={laneGlyphClass(status.tone)}
				/>
				<span data-testid={`preset-lane-${wave}-note`} className="sr-only">
					{`, ${status.note}. ${status.title}`}
				</span>
			</header>
			{required !== undefined && empty ? (
				// An empty wave the playbook needs: a dashed warn zone that says
				// why, where the agent will land.
				<p
					data-testid={`preset-kanban-wave-${wave}-required`}
					className="flex min-h-16 items-center justify-center rounded-control border border-dashed border-gate-warn-line bg-gate-warn-banner p-2 text-center type-caption text-gate-warn"
				>
					{required}
				</p>
			) : null}
			<ul ref={listRef} className="flex flex-1 flex-col gap-1.5">
				{chips.map((chip, i) => (
					<LaneItem
						key={chip.uid}
						line={line(i)}
						chip={chip}
						wave={wave}
						selected={selectedUid === chip.uid}
						held={holding && selectedUid === chip.uid}
						placeholder={
							drag?.kind === "chip" &&
							drag.uid === chip.uid &&
							drag.wave === wave
						}
						landed={landedUid === chip.uid}
						chipRef={chipRef}
						onDragStart={onChipDragStart}
						onDragEnd={onChipDragEnd}
						onClick={onChipClick}
						onKey={onChipKey}
					/>
				))}
				{line(chips.length)}
				{/* One drop slot under the chips, always: it takes what height
				    the lane has left, so every lane ends in a clear target. */}
				{required !== undefined && empty ? null : (
					<li
						aria-hidden="true"
						data-testid={`preset-lane-${wave}-ghost`}
						className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-control border border-dashed border-border-strong type-caption text-text-subtle"
					>
						<ArrowDownToLine aria-hidden="true" className="size-3.5" />
						{empty ? "Drop agents here" : "Drop here"}
					</li>
				)}
			</ul>
			{problem ? (
				<p
					aria-live="polite"
					data-testid={`preset-lane-${wave}-problem`}
					className="flex items-start gap-1.5 type-caption text-gate-warn"
				>
					<StatusGlyph tone="warn" className="mt-0.5" />
					{problem}
				</p>
			) : null}
		</li>
	);
}

function LaneItem({
	line,
	chip,
	wave,
	selected,
	held,
	placeholder,
	landed,
	chipRef,
	onDragStart,
	onDragEnd,
	onClick,
	onKey,
}: {
	line: React.ReactNode;
	chip: LaneChip;
	wave: Wave;
	selected: boolean;
	held: boolean;
	placeholder: boolean;
	landed: boolean;
	chipRef?: (uid: number, el: HTMLButtonElement | null) => void;
	onDragStart?: (uid: number, event: DragEvent) => void;
	onDragEnd?: () => void;
	onClick?: (uid: number) => void;
	onKey?: (uid: number, event: KeyboardEvent) => void;
}) {
	return (
		<>
			{line}
			<li data-lane-chip="">
				<Button
					ref={(el) => chipRef?.(chip.uid, el)}
					type="button"
					variant="outline"
					draggable
					aria-pressed={selected}
					data-testid={`preset-chip-${chip.uid}-${wave}`}
					data-flip={`${chip.uid}:${wave}`}
					data-holding={held || undefined}
					data-placeholder={placeholder || undefined}
					data-flagged={chip.flagged || undefined}
					title={
						chip.territory ? `${chip.name} · ${chip.territory}` : chip.name
					}
					onDragStart={(event) => onDragStart?.(chip.uid, event)}
					onDragEnd={onDragEnd}
					onClick={() => onClick?.(chip.uid)}
					onKeyDown={(event) => onKey?.(chip.uid, event)}
					className={cn(
						"group/chip relative h-9 w-full cursor-grab justify-start gap-2 border-border px-1.5 text-left shadow-none active:cursor-grabbing",
						selected && !held && "border-selected-border bg-selected",
						// v3 .menu-row.drag: the chip surface, lifted on the drag shadow.
						held && "-translate-y-px border-border-strong bg-chip shadow-drag",
						chip.flagged && "border-gate-block-line",
						// Where it was, while it is dragged away: the lane keeps its shape.
						placeholder &&
							"border-dashed border-border-strong bg-transparent shadow-none *:invisible",
						landed && "landed",
					)}
				>
					{/* Over the chip's edge, not beside the tile: it takes no width. */}
					<GripVertical
						aria-hidden="true"
						className="absolute top-1/2 -left-0.5 size-3.5 -translate-y-1/2 text-text-subtle opacity-0 transition-opacity duration-(--duration-micro) group-hover/chip:opacity-100 group-focus-visible/chip:opacity-100"
					/>
					<span aria-hidden="true" className={TILE}>
						{initialsOf(chip.name)}
					</span>
					<span className="flex min-w-0 flex-1 items-center gap-1.5">
						<span className="min-w-0 shrink truncate type-small font-medium text-text">
							{chip.name}
						</span>
						{chip.territory ? (
							// Territory beside the name as a neutral v3 .tag: its words
							// tell them apart; a long one ends in the chip's tooltip.
							<span
								data-slot="territory"
								className="min-w-0 max-w-[55%] shrink-[2] truncate rounded-xs border border-border bg-app-raised px-1 text-[0.6875rem] leading-4 text-text-muted"
							>
								{chip.territory}
							</span>
						) : null}
					</span>
					<span className="sr-only">
						{held ? ", picked up: arrows move it, Enter puts it down" : ""}
					</span>
				</Button>
			</li>
		</>
	);
}

/** A template's side, from the contract's role map; null when it has none or several. */
function sideOfTemplate(template: Pick<AgentTemplate, "roles">): Side | null {
	const sides = new Set(
		template.roles
			.map((role) => ROLE_SIDE[role])
			.filter((s): s is Side => s !== null),
	);
	return sides.size === 1 ? ([...sides][0] ?? null) : null;
}

/**
 * The agent band, across the top of the canvas above the lanes: every
 * template in the catalog as a compact chip, in one wrapping row per side,
 * the side as an eyebrow before its chips, so every agent shows at once and
 * the lanes keep the canvas's whole width. Search and the role filter dim
 * what doesn't match instead of hiding it. Drag a chip onto a lane, or press
 * it and choose a wave. An agent already on the team shows a check and reads
 * quieter, but can still join another wave. A Firm template is shown,
 * disabled with template_not_rosterable's reason.
 */
export function AgentTray({
	templates,
	onTeam,
	onAdd,
	onDragStart,
	onDragEnd,
}: {
	templates: readonly AgentTemplate[];
	/** Templates the team holds already. */
	onTeam: ReadonlySet<string>;
	onAdd: (templateId: string, wave: Wave) => void;
	onDragStart: (templateId: string, event: DragEvent) => void;
	onDragEnd: () => void;
}) {
	const [query, setQuery] = useState("");
	const [role, setRole] = useState<Role | "all">("all");
	const roles = [...new Set(templates.flatMap((t) => t.roles))];
	const q = query.trim().toLowerCase();
	const filtering = q !== "" || role !== "all";
	const matches = (t: AgentTemplate) =>
		(q === "" ||
			t.name.toLowerCase().includes(q) ||
			t.slug.toLowerCase().includes(q)) &&
		(role === "all" || t.roles.includes(role));
	const groups: { key: string; label: string; items: AgentTemplate[] }[] = [
		...SIDES.map((side) => ({
			key: side as string,
			label: SIDE_LABELS[side] as string,
			items: templates.filter((t) => sideOfTemplate(t) === side),
		})),
		{
			key: "other",
			label: "Other",
			items: templates.filter((t) => sideOfTemplate(t) === null),
		},
	].filter((g) => g.items.length > 0);
	const matching = templates.filter(matches).length;
	return (
		<section
			aria-label="Agents"
			data-testid="preset-tray"
			className="flex flex-col gap-2 rounded-card border border-border bg-app-panel p-2.5 shadow-card"
		>
			<div className="flex flex-wrap items-center gap-2">
				<h3 className="type-small font-medium text-text">Agents</h3>
				<span
					data-testid="preset-tray-count"
					className="type-caption text-text-subtle tabular-nums"
				>
					{filtering
						? `${matching} of ${templates.length} match`
						: `${templates.length}`}
				</span>
				<SearchField
					value={query}
					onChange={setQuery}
					label="Search agents"
					placeholder="Search agents"
					shortcut="/"
					className="ml-auto w-56"
					data-testid="preset-tray-search"
				/>
				<Select
					value={role}
					onValueChange={(next) => setRole(next as Role | "all")}
				>
					<SelectTrigger
						size="sm"
						aria-label="Filter by role"
						data-testid="preset-tray-role"
						className="w-44"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All roles</SelectItem>
						{roles.map((r) => (
							<SelectItem key={r} value={r}>
								{ROLE_LABELS[r]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			{groups.length === 0 ? (
				<p
					data-testid="preset-palette-none"
					className="type-small text-text-subtle"
				>
					No agents in All agents yet.
				</p>
			) : (
				<div className="flex flex-col gap-1.5">
					{groups.map((group) => (
						<ul
							key={group.key}
							aria-label={group.label}
							data-testid={`preset-tray-group-${group.key}`}
							className="flex flex-wrap items-center gap-1.5"
						>
							<li
								aria-hidden="true"
								className="w-36 shrink-0 whitespace-nowrap type-eyebrow"
							>
								{group.label}
							</li>
							{group.items.map((t) => (
								<li key={t.id}>
									<TrayChip
										template={t}
										held={onTeam.has(t.id)}
										dimmed={filtering && !matches(t)}
										onAdd={onAdd}
										onDragStart={onDragStart}
										onDragEnd={onDragEnd}
									/>
								</li>
							))}
						</ul>
					))}
				</div>
			)}
		</section>
	);
}

/** One template in the tray: drag it, or press it and choose a wave. */
export function TrayChip({
	template,
	held,
	dimmed = false,
	onAdd,
	onDragStart,
	onDragEnd,
}: {
	template: AgentTemplate;
	held: boolean;
	/** It doesn't match the search or role: shown, quieter, still usable. */
	dimmed?: boolean;
	onAdd: (templateId: string, wave: Wave) => void;
	onDragStart: (templateId: string, event: DragEvent) => void;
	onDragEnd: () => void;
}) {
	const [open, setOpen] = useState(false);
	if (!isRosterable(template))
		return (
			<Button
				type="button"
				variant="outline"
				data-testid={`preset-palette-${template.slug}`}
				data-dimmed={dimmed || undefined}
				disabledReason={PRECONDITION_COPY.template_not_rosterable.what}
				className="h-8 gap-1.5 px-2 type-small"
			>
				<Lock aria-hidden="true" />
				{template.name}
			</Button>
		);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					draggable
					data-testid={`preset-palette-${template.slug}`}
					data-on-team={held || undefined}
					data-dimmed={dimmed || undefined}
					onDragStart={(event) => {
						setOpen(false);
						onDragStart(template.id, event);
					}}
					onDragEnd={onDragEnd}
					className={cn(
						// A compact chip, 32px, in the band's wrapping row.
						"group/chip relative h-8 cursor-grab gap-1.5 border-border px-1.5 shadow-none active:cursor-grabbing",
						// Not a match: the hollow surface and the subtle ink, at full
						// opacity (v3 UX 6), so every agent still shows.
						dimmed && "border-dashed bg-app-hollow",
					)}
				>
					<GripVertical
						aria-hidden="true"
						className="absolute top-1/2 -left-0.5 size-3.5 -translate-y-1/2 text-text-subtle opacity-0 transition-opacity duration-(--duration-micro) group-hover/chip:opacity-100 group-focus-visible/chip:opacity-100"
					/>
					<span aria-hidden="true" className={TILE}>
						{initialsOf(template.name)}
					</span>
					<span
						className={cn(
							"text-left type-small",
							held || dimmed ? "text-text-subtle" : "text-text",
						)}
					>
						{template.name}
					</span>
					{held ? (
						<Check
							aria-hidden="true"
							data-testid={`preset-palette-${template.slug}-on-team`}
							className="size-3.5 text-text-subtle"
						/>
					) : null}
					<span className="sr-only">{held ? ", on the team" : ""}</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				side="bottom"
				data-testid={`preset-palette-waves-${template.slug}`}
				className="w-auto p-2"
			>
				<p className="px-1 pb-2 type-small font-medium text-text">
					{`Add ${template.name} to wave`}
				</p>
				<div className="flex gap-1">
					{WAVES.map((w) => (
						<Button
							key={w}
							type="button"
							variant="outline"
							size="sm"
							data-testid={`preset-palette-${template.slug}-wave-${w}`}
							onClick={() => {
								onAdd(template.id, w);
								setOpen(false);
							}}
							className="type-mono"
						>
							{w}
						</Button>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}
