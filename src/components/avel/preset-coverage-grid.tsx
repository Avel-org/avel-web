import {
	type AgentTemplate,
	computeCoherence,
	earliestWave,
	type Playbook,
	type Preset,
	type PresetAgent,
	ROLE_LABELS,
	ROLE_SIDE,
	ROLES,
	type Role,
	SIDE_LABELS,
	SIDES,
	VERIFICATION_ROLES,
	WAVES,
	type Wave,
} from "avel-server/contract";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { presetCoherenceInput } from "@/lib/api/coherence";
import { isRosterable } from "@/lib/api/presets";
import { cn } from "@/lib/utils";
import { initialsOf } from "./actor";
import { laneGlyphClass, laneStatus } from "./preset-lanes";
import { defaultFor } from "./preset-sections";
import { StatusGlyph } from "./status-pill";

/*
 * What the team must staff, and the role by wave grid that shows it.
 *
 * Requirements come from the contract's coherence check alone
 * (computeCoherence), run on the draft as if applied, against each live
 * playbook that defaults to this team:
 * - a wave is required when it is a playbook's earliest declared wave and no
 *   agent is in it (no_agents_in_first_wave, the one hard block);
 * - a role is required when a vertical cut has no agent holding foundations,
 *   or none holding a verification role (vertical_cut_roles_unassigned).
 * Nothing else is marked: the contract states no other requirement.
 */

export type ComposerRequirements = {
	/** The wave, and why it must be staffed. */
	waves: Partial<Record<Wave, string>>;
	/** The role, and why the team needs it. */
	roles: Partial<Record<Role, string>>;
	/** False when an agent's template is not loaded: nothing can be checked. */
	known: boolean;
	/** The playbooks that default to this team: what checks it at all. */
	checkedBy: string[];
	/** Each wave, and the playbooks that declare it. */
	declared: Partial<Record<Wave, string[]>>;
};

/** Nothing read yet, or nothing to read. */
export const NO_REQUIREMENTS: ComposerRequirements = {
	waves: {},
	roles: {},
	known: false,
	checkedBy: [],
	declared: {},
};

export function composerRequirements(
	team: Pick<Preset, "id" | "cut"> & { agents: readonly PresetAgent[] },
	templates: ReadonlyMap<
		string,
		Pick<AgentTemplate, "kind" | "roles" | "writablePaths">
	>,
	playbooks: readonly Pick<
		Playbook,
		"name" | "defaultPresetId" | "wavesApplicable" | "gates"
	>[],
): ComposerRequirements {
	const input = presetCoherenceInput(team, templates);
	if (input === null) return NO_REQUIREMENTS;
	const waves: Partial<Record<Wave, string>> = {};
	const checking = defaultFor(playbooks, team.id);
	const declared: Partial<Record<Wave, string[]>> = {};
	for (const playbook of checking)
		for (const wave of playbook.wavesApplicable)
			declared[wave] = [...(declared[wave] ?? []), playbook.name];
	for (const playbook of checking) {
		const result = computeCoherence(input, playbook);
		const first = earliestWave(playbook);
		if (result.block && first !== null && waves[first] === undefined)
			waves[first] =
				`${playbook.name} starts in wave ${first}: a mission can't start with no agent here.`;
	}
	const roles: Partial<Record<Role, string>> = {};
	// The cut's own rule needs no playbook: run it against none.
	const cut = computeCoherence(input, { wavesApplicable: [], gates: [] });
	for (const warning of cut.warnings) {
		if (warning.missing.includes("foundations"))
			roles.foundations =
				"A vertical cut needs an agent holding Project setup.";
		if (warning.missing.includes("verification"))
			for (const role of VERIFICATION_ROLES)
				roles[role] =
					"A vertical cut needs an agent holding a verification role.";
	}
	return {
		waves,
		roles,
		known: true,
		checkedBy: checking.map((p) => p.name),
		declared,
	};
}

/** One agent on the board, as the grid reads it. */
export type GridAgent = {
	key: string;
	templateId: string;
	waves: readonly Wave[];
	name: string;
};

/**
 * The grid's row groups: each side, then the roles with none (code and Firm
 * roles), as the tray groups its agents.
 */
const SIDE_GROUPS = [
	...SIDES.map((side) => ({
		side,
		key: side as string,
		label: SIDE_LABELS[side] as string,
	})),
	{ side: null, key: "other", label: "Other" },
];

export const COVERAGE_HINT =
	"Each cell is a role in a wave. Drag an agent from the tray onto a cell to add it to that wave, or choose a cell to pick one. A dashed amber cell is one the team must staff.";

/**
 * Roles by waves A to E, the roles grouped by side under eyebrows and the
 * waves headed as the lanes are (glyph and count, from laneStatus). A cell
 * holds the agents whose template has the role and who work in the wave, as
 * tiles. An empty cell in a required wave or role is a dashed warn zone with
 * the reason. Any cell opens a picker of the templates that hold the role,
 * and takes a drop from the tray: both add to that wave.
 */
export function CoverageGrid({
	agents,
	templates,
	requirements,
	problemOf = () => null,
	dragging = false,
	onDropAt = () => {},
	onAdd,
}: {
	agents: readonly GridAgent[];
	templates: readonly AgentTemplate[];
	requirements: ComposerRequirements;
	/** Why the template can't join the wave (the lanes' dropProblem), or null. */
	problemOf?: (templateId: string, wave: Wave) => string | null;
	/** An agent is held from the tray: the cells take it. */
	dragging?: boolean;
	onDropAt?: (role: Role, wave: Wave) => void;
	onAdd: (templateId: string, wave: Wave) => void;
}) {
	const byId = new Map(templates.map((t) => [t.id, t]));
	const holders = (role: Role, wave: Wave) =>
		agents.filter(
			(a) =>
				a.waves.includes(wave) &&
				(byId.get(a.templateId)?.roles ?? []).includes(role),
		);
	return (
		<div
			data-testid="preset-coverage-grid"
			className="overflow-x-auto rounded-card border border-border bg-app-panel shadow-card"
		>
			<table className="w-full table-fixed type-small">
				<caption className="sr-only">
					Roles the team holds, by wave. Choose a cell to add an agent.
				</caption>
				<thead>
					<tr className="border-b border-border bg-app-band">
						<th scope="col" className="w-40 px-3 py-2 text-left type-caption">
							Role
						</th>
						{WAVES.map((wave) => {
							const status = laneStatus(
								wave,
								agents.filter((a) => a.waves.includes(wave)).length,
								requirements,
							);
							return (
								<th
									key={wave}
									scope="col"
									data-testid={`preset-grid-wave-${wave}`}
									data-required={requirements.waves[wave] ? true : undefined}
									data-status={status.tone}
									title={status.title}
									className="px-2 py-2 text-left font-normal"
								>
									<span className="flex items-center gap-1.5">
										<span className="min-w-0 flex-1 truncate type-small font-medium text-text">{`Wave ${wave}`}</span>
										<StatusGlyph
											tone={status.tone}
											className={laneGlyphClass(status.tone)}
										/>
									</span>
									<span
										data-testid={`preset-grid-wave-${wave}-count`}
										className="block truncate type-caption tabular-nums"
									>
										{status.count}
									</span>
									<span className="sr-only">{`, ${status.title}`}</span>
								</th>
							);
						})}
					</tr>
				</thead>
				{/* One body per side, under its eyebrow, as the tray groups them. */}
				{SIDE_GROUPS.map(({ side, key, label }) => (
					<tbody key={key} data-testid={`preset-grid-side-${key}`}>
						<tr className="border-b border-border bg-app-band">
							<th
								scope="colgroup"
								colSpan={WAVES.length + 1}
								className="px-3 pt-2.5 pb-1 text-left type-eyebrow"
							>
								{label}
							</th>
						</tr>
						{ROLES.filter((role) => ROLE_SIDE[role] === side).map((role) => (
							<tr
								key={role}
								data-testid={`preset-grid-role-${role}`}
								className="border-b border-border last:border-b-0"
							>
								<th
									scope="row"
									title={requirements.roles[role]}
									className={cn(
										"px-3 py-1.5 text-left font-normal whitespace-nowrap",
										requirements.roles[role] ? "text-gate-warn" : "text-text",
									)}
								>
									{ROLE_LABELS[role]}
								</th>
								{WAVES.map((wave) => (
									<td key={wave} className="p-1">
										<Cell
											role={role}
											wave={wave}
											holders={holders(role, wave)}
											reason={
												requirements.waves[wave] ?? requirements.roles[role]
											}
											templates={templates.filter(
												(t) => isRosterable(t) && t.roles.includes(role),
											)}
											problemOf={problemOf}
											dragging={dragging}
											onDropAt={onDropAt}
											onAdd={onAdd}
										/>
									</td>
								))}
							</tr>
						))}
					</tbody>
				))}
			</table>
		</div>
	);
}

function Cell({
	role,
	wave,
	holders,
	reason,
	templates,
	problemOf,
	dragging,
	onDropAt,
	onAdd,
}: {
	role: Role;
	wave: Wave;
	holders: readonly GridAgent[];
	/** Set when the wave or the role is required. */
	reason: string | undefined;
	templates: readonly AgentTemplate[];
	problemOf: (templateId: string, wave: Wave) => string | null;
	dragging: boolean;
	onDropAt: (role: Role, wave: Wave) => void;
	onAdd: (templateId: string, wave: Wave) => void;
}) {
	const [open, setOpen] = useState(false);
	const [over, setOver] = useState(false);
	const empty = holders.length === 0;
	const warn = empty && reason !== undefined;
	const label = `${ROLE_LABELS[role]}, wave ${wave}`;
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					data-testid={`preset-grid-cell-${role}-${wave}`}
					data-count={holders.length}
					data-warn={warn || undefined}
					data-over={(dragging && over) || undefined}
					onDragOver={(event) => {
						if (!dragging) return;
						event.preventDefault();
						event.dataTransfer.dropEffect = "copy";
						setOver(true);
					}}
					onDragLeave={() => setOver(false)}
					onDrop={(event) => {
						if (!dragging) return;
						event.preventDefault();
						setOver(false);
						onDropAt(role, wave);
					}}
					aria-label={
						empty
							? `${label}: no agent. Add one.${warn ? ` ${reason}` : ""}`
							: `${label}: ${holders.map((h) => h.name).join(", ")}. Add another.`
					}
					title={warn ? reason : undefined}
					className={cn(
						"group/cell flex min-h-8 w-full items-center justify-center gap-0.5 rounded-control border p-0.5 transition-colors duration-(--duration-micro) ease-avel",
						// Held over: the lanes' drop state. While anything is held, every
						// cell shows it is a target.
						dragging && over
							? "border-selected-border bg-selected"
							: dragging
								? "border-dashed border-border-strong bg-app-panel"
								: warn
									? "border-dashed border-gate-warn-line bg-gate-warn-banner hover:border-gate-warn-solid"
									: empty
										? "border-transparent text-text-subtle hover:border-border hover:bg-app-raised"
										: "border-border bg-app-well hover:border-border-strong",
					)}
				>
					{empty ? (
						<Plus
							aria-hidden="true"
							className="size-3.5 opacity-0 group-hover/cell:opacity-100 group-focus-visible/cell:opacity-100"
						/>
					) : (
						<>
							{/* Two tiles at most, then how many more: a cell stays one row. */}
							{holders.slice(0, 2).map((h) => (
								<span
									key={h.key}
									aria-hidden="true"
									title={h.name}
									className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm border border-border bg-app-panel type-caption font-semibold text-text-muted"
								>
									{initialsOf(h.name)}
								</span>
							))}
							{holders.length > 2 ? (
								<span
									aria-hidden="true"
									data-testid={`preset-grid-more-${role}-${wave}`}
									className="type-caption text-text-muted tabular-nums"
								>
									{`+${holders.length - 2}`}
								</span>
							) : null}
						</>
					)}
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="center"
				data-testid={`preset-grid-picker-${role}-${wave}`}
				className="w-64 p-1.5"
			>
				<p className="px-2.5 pt-1.5 pb-1 type-small font-medium text-text">
					{`Add to wave ${wave}`}
				</p>
				<p className="px-2.5 pb-2 type-caption">{`Agents that hold ${ROLE_LABELS[role]}`}</p>
				<PickerList
					forRole={role}
					wave={wave}
					templates={templates}
					problemOf={problemOf}
					onAdd={(id) => {
						onAdd(id, wave);
						setOpen(false);
					}}
				/>
			</PopoverContent>
		</Popover>
	);
}

/** A cell picker's templates, each refused for the reason a lane would give. */
export function PickerList({
	forRole,
	wave,
	templates,
	problemOf,
	onAdd,
}: {
	/** The cell's role: the templates hold it. */
	forRole: Role;
	wave: Wave;
	templates: readonly AgentTemplate[];
	problemOf: (templateId: string, wave: Wave) => string | null;
	onAdd: (templateId: string) => void;
}) {
	return (
		<>
			{templates.length === 0 ? (
				<p className="px-2.5 pb-2 type-small text-text-subtle">
					No agent in All agents holds this role.
				</p>
			) : (
				<ul className="flex flex-col">
					{templates.map((t) => (
						<li key={t.id}>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								data-testid={`preset-grid-add-${forRole}-${wave}-${t.slug}`}
								className="w-full justify-start"
								disabledReason={problemOf(t.id, wave) ?? undefined}
								onClick={() => onAdd(t.id)}
							>
								<Plus aria-hidden="true" />
								{t.name}
							</Button>
						</li>
					))}
				</ul>
			)}
		</>
	);
}
