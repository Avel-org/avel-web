import {
	type AgentKind,
	type AgentTemplate,
	agentKind,
	KIND_LABELS,
	ROLE_LABELS,
	SIDE_LABELS,
	SIDES,
	type Side,
	TEAMS,
	WAVES,
	type Wave,
} from "avel-server/contract";
import { ListFilter } from "lucide-react";
import { useId } from "react";
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
import { tabsListVariants } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { firstWave, isFirmAgent, sideOf } from "./catalog-agent-placeholders";
import { teamOf } from "./catalog-sample";
import type { SortState } from "./data-table";
import { SearchField } from "./search-field";

/*
 * The All agents list's pure pieces: filtering, sorting, the side tile and
 * the filter row. The cards are in catalog-agent-card.tsx and the graph in
 * catalog-agent-graph.tsx.
 */

/** Side tabs: every side, and Other for templates with none (Firm, code). */
export type SideTab = Side | "none";

/** The list's filters; unset shows all. */
export type AgentFilters = {
	side?: SideTab;
	kind?: AgentKind;
	wave?: Wave;
	/** Matched against the name, slug, role slugs and role labels, ignoring case. */
	q?: string;
};

const sideTabOf = (agent: AgentTemplate): SideTab => sideOf(agent) ?? "none";

/** Rows that pass every filter set. */
export function filterAgents(
	agents: readonly AgentTemplate[],
	filters: AgentFilters,
): AgentTemplate[] {
	const q = filters.q?.trim().toLowerCase() ?? "";
	return agents.filter(
		(agent) =>
			(filters.side === undefined || sideTabOf(agent) === filters.side) &&
			(filters.kind === undefined || agent.kind === filters.kind) &&
			(filters.wave === undefined ||
				(!isFirmAgent(agent) && agent.waveDefaults.includes(filters.wave))) &&
			(q === "" ||
				agent.name.toLowerCase().includes(q) ||
				agent.slug.includes(q) ||
				agent.roles.some(
					(role) =>
						role.includes(q) || ROLE_LABELS[role].toLowerCase().includes(q),
				)),
	);
}

const sideRank = (agent: AgentTemplate) => {
	const side = sideOf(agent);
	// No side (Firm, code) sorts after every side.
	return side === null ? SIDES.length : SIDES.indexOf(side);
};

/**
 * Rows in the chosen order; ties break by wave, then name, so order is
 * stable. "team" sorts by team (the cards' sections), then wave within one.
 */
export function sortAgents(
	agents: readonly AgentTemplate[],
	sort: SortState,
): AgentTemplate[] {
	const byName = (a: AgentTemplate, b: AgentTemplate) =>
		a.name.localeCompare(b.name);
	// A firm agent has no waves, so it sorts after every wave.
	const waveRank = (agent: AgentTemplate) =>
		isFirmAgent(agent) ? WAVES.length : WAVES.indexOf(firstWave(agent));
	const byWave = (a: AgentTemplate, b: AgentTemplate) =>
		waveRank(a) - waveRank(b);
	const bySide = (a: AgentTemplate, b: AgentTemplate) =>
		sideRank(a) - sideRank(b);
	const byTeam = (a: AgentTemplate, b: AgentTemplate) =>
		TEAMS.indexOf(teamOf(a)) - TEAMS.indexOf(teamOf(b));
	const column = sort?.column ?? "wave";
	const primary =
		column === "name"
			? byName
			: column === "side"
				? bySide
				: column === "team"
					? byTeam
					: byWave;
	const sign = sort?.direction === "desc" ? -1 : 1;
	return [...agents].sort(
		(a, b) => sign * primary(a, b) || byWave(a, b) || byName(a, b),
	);
}

// ---------------------------------------------------------------------------
// The filter row: side tabs with counts, search, and a filter for wave and kind.

export const SIDE_TABS: readonly { id: SideTab | undefined; label: string }[] =
	[
		{ id: undefined, label: "All" },
		...SIDES.map((side) => ({ id: side, label: SIDE_LABELS[side] })),
		{ id: "none", label: "Other" },
	];

export function AgentFilterRow({
	agents,
	filters,
	onChange,
}: {
	agents: readonly AgentTemplate[];
	filters: AgentFilters;
	onChange: (next: AgentFilters) => void;
}) {
	// Counts follow the other filters, never the side itself.
	const pool = filterAgents(agents, { ...filters, side: undefined });
	const narrowed = (filters.wave ? 1 : 0) + (filters.kind ? 1 : 0);
	return (
		<div
			data-testid="catalog-agents-filters"
			className="flex flex-wrap items-center justify-between gap-2"
		>
			<fieldset
				data-testid="catalog-agents-side-tabs"
				className={cn(tabsListVariants({ variant: "default" }), "flex-wrap")}
			>
				<legend className="sr-only">Side</legend>
				{SIDE_TABS.map((tab) => {
					const count = pool.filter(
						(agent) => tab.id === undefined || sideTabOf(agent) === tab.id,
					).length;
					const pressed = filters.side === tab.id;
					return (
						<Button
							key={tab.label}
							type="button"
							variant="segment"
							aria-pressed={pressed}
							data-testid={`catalog-agents-side-${tab.id ?? "all"}`}
							onClick={() => onChange({ ...filters, side: tab.id })}
						>
							{tab.label}
							<span
								data-testid={`catalog-agents-side-${tab.id ?? "all"}-count`}
								className="type-mono text-text-subtle tabular-nums"
							>
								{count}
							</span>
						</Button>
					);
				})}
			</fieldset>
			<div className="flex items-center gap-2">
				<SearchField
					data-testid="catalog-agents-search"
					label="Search agents by name or role"
					// Short enough to show whole in the field; the label says
					// what it searches.
					placeholder="Search agents"
					value={filters.q ?? ""}
					onChange={(q) => onChange({ ...filters, q })}
					className="w-52"
				/>
				<Popover>
					<PopoverTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							data-testid="catalog-agents-filter"
							aria-label={
								narrowed > 0
									? `Filter by wave and kind, ${narrowed} set`
									: "Filter by wave and kind"
							}
						>
							<ListFilter aria-hidden="true" />
							{narrowed > 0 ? (
								<span className="type-mono tabular-nums">{narrowed}</span>
							) : null}
						</Button>
					</PopoverTrigger>
					<PopoverContent align="end" className="flex w-56 flex-col gap-3">
						<FilterSelect
							label="Wave"
							testId="catalog-agents-filter-wave"
							value={filters.wave}
							options={WAVES}
							onChange={(wave) =>
								onChange({ ...filters, wave: wave as Wave | undefined })
							}
						/>
						<FilterSelect
							label="Kind"
							testId="catalog-agents-filter-kind"
							value={filters.kind}
							options={agentKind.options}
							labels={KIND_LABELS}
							onChange={(kind) =>
								onChange({ ...filters, kind: kind as AgentKind | undefined })
							}
						/>
					</PopoverContent>
				</Popover>
			</div>
		</div>
	);
}

// Radix Select takes no empty value, so "all" stands for an unset filter.
const ALL = "all";

function FilterSelect({
	label,
	testId,
	value,
	options,
	labels,
	onChange,
}: {
	label: string;
	testId: string;
	value: string | undefined;
	options: readonly string[];
	/** What each option reads as, when not its value. */
	labels?: Readonly<Record<string, string>>;
	onChange: (value: string | undefined) => void;
}) {
	const id = useId();
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={id} className="type-caption text-text-subtle">
				{label}
			</label>
			<Select
				value={value ?? ALL}
				onValueChange={(next) => onChange(next === ALL ? undefined : next)}
			>
				<SelectTrigger
					id={id}
					size="sm"
					data-testid={testId}
					className="w-full type-mono"
				>
					<SelectValue>
						{value === undefined ? "All" : (labels?.[value] ?? value)}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={ALL}>All</SelectItem>
					{options.map((option) => (
						<SelectItem key={option} value={option}>
							{labels?.[option] ?? option}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
