import {
	type AgentKind,
	type AgentTemplate,
	agentKind,
	WAVES,
	type Wave,
} from "avel-server/contract";
import { ChevronLeft, ChevronRight, ListFilter, Search } from "lucide-react";
import { useId } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
	AGENT_MISSING,
	type AgentSide,
	firstWave,
	isFirmAgent,
	kTokens,
	SIDES,
	sampleDispatch,
	sideOf,
	territoriesOf,
} from "./catalog-agent-placeholders";
import { CATALOG_MISSING, sampleHistory } from "./catalog-placeholders";
import { inCatalogOrder, inWaveOrder } from "./catalog-sample";
import { type DataColumn, DataTable, type SortState } from "./data-table";

/** Side tabs: every side, and Firm for templates with none. */
export type SideTab = AgentSide | "firm";

/** The table's filters; unset shows all. */
export type AgentFilters = {
	side?: SideTab;
	kind?: AgentKind;
	wave?: Wave;
	/** Matched against the name, slug and roles, ignoring case. */
	q?: string;
};

const sideTabOf = (agent: AgentTemplate): SideTab => sideOf(agent) ?? "firm";

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
				agent.roles.some((role) => role.includes(q))),
	);
}

const sideRank = (agent: AgentTemplate) => {
	const side = sideOf(agent);
	// No side (Firm) sorts after every side.
	return side === null ? SIDES.length : SIDES.indexOf(side);
};

/** Rows in the chosen order; ties break by wave, then name, so order is stable. */
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
	const column = sort?.column ?? "wave";
	const primary =
		column === "name" ? byName : column === "side" ? bySide : byWave;
	const sign = sort?.direction === "desc" ? -1 : 1;
	return [...agents].sort(
		(a, b) => sign * primary(a, b) || byWave(a, b) || byName(a, b),
	);
}

// ---------------------------------------------------------------------------
// The initials tile.

/**
 * Each side's tile tone. No side tokens exist yet, so these borrow existing
 * soft tones; the mapping lives here alone, so new tokens are a one-line
 * change. Never a raw colour.
 */
const SIDE_TONE: Record<SideTab, string> = {
	author: "bg-accent-soft text-accent-text",
	tester: "bg-gate-pending-soft text-gate-pending",
	judge: "bg-gate-warn-soft text-gate-warn",
	fixture: "bg-diff-preserve/15 text-diff-preserve",
	firm: "bg-muted text-text-muted",
};

/** Two letters from the name: "AT" for Atlas. */
export const initialsOf = (name: string) => name.slice(0, 2).toUpperCase();

export function AgentTile({
	agent,
	size = "sm",
}: {
	agent: AgentTemplate;
	size?: "sm" | "lg";
}) {
	return (
		<span
			aria-hidden="true"
			data-testid={`catalog-agent-tile-${agent.slug}`}
			data-side={sideTabOf(agent)}
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-sm font-medium",
				size === "sm" ? "size-8 type-caption" : "size-11 type-body",
				SIDE_TONE[sideTabOf(agent)],
			)}
		>
			{initialsOf(agent.name)}
		</span>
	);
}

// ---------------------------------------------------------------------------
// The table.

/**
 * A sample column's name: underlined dashed, as every placeholder is, with a
 * tooltip naming what it waits for. The table region's one pill covers the
 * rows; these say which columns come from somewhere else. The words are in
 * the markup too, for screen readers.
 */
function SampleHeader({
	column,
	missing,
}: {
	column: (typeof SAMPLE_COLUMNS)[number]["column"];
	missing: string;
}) {
	const words = `Sample data until avel-server has ${missing}.`;
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					data-testid={`catalog-agents-sample-column-${column}`}
					data-missing={missing}
					// relative: the sr-only words are absolute, and must stay inside
					// the table's scroll box, or a clipped column widens the canvas.
					className="relative border-b border-dashed border-border-strong"
				>
					{column}
					<span className="sr-only">{`, ${words}`}</span>
				</span>
			</TooltipTrigger>
			<TooltipContent>{words}</TooltipContent>
		</Tooltip>
	);
}

/**
 * Which values are samples from somewhere other than the templates route,
 * each with what it waits for. Their headers are underlined dashed.
 */
export const SAMPLE_COLUMNS = [
	{ column: "TERRITORY", missing: AGENT_MISSING.territories },
	{ column: "SIDE", missing: AGENT_MISSING.sides },
	{ column: "SHA", missing: CATALOG_MISSING.versions },
	{ column: "EST/CEIL", missing: AGENT_MISSING.dispatch },
] as const;

const sampleHeader = (column: (typeof SAMPLE_COLUMNS)[number]["column"]) => (
	<SampleHeader
		column={column}
		missing={SAMPLE_COLUMNS.find((c) => c.column === column)?.missing ?? ""}
	/>
);

/** What the WAVES cell says for a firm agent, and why. */
export const FIRM_WAVES = {
	text: "—",
	title: "Firm agents work between missions; the firm roster has no waves",
} as const;

const COLUMNS: DataColumn<AgentTemplate>[] = [
	{
		id: "name",
		header: <span>AGENT {sampleHeader("TERRITORY")}</span>,
		sortable: true,
		cell: (agent) => {
			const territories = territoriesOf(agent);
			return (
				<span className="flex items-center gap-2.5">
					<AgentTile agent={agent} />
					<span className="flex min-w-0 flex-col">
						<span className="type-small font-medium text-foreground">
							{agent.name}
						</span>
						<span
							data-testid={`catalog-agent-territory-${agent.slug}`}
							className="type-caption text-text-subtle"
						>
							{territories.length > 0
								? territories.join(", ")
								: "whole project"}
						</span>
					</span>
				</span>
			);
		},
	},
	{
		id: "side",
		header: sampleHeader("SIDE"),
		sortable: true,
		mono: true,
		cell: (agent) =>
			sideOf(agent) ?? (
				<span
					title="Firm roles run between missions and have no side"
					className="text-text-subtle"
				>
					firm
				</span>
			),
	},
	{
		id: "roles",
		header: "ROLES",
		cell: (agent) => (
			<span
				data-testid={`catalog-agent-roles-${agent.slug}`}
				className="flex flex-wrap gap-1"
			>
				{inCatalogOrder(agent.roles).map((role) => (
					<Badge key={role} variant="tag" data-testid="catalog-role">
						{role}
					</Badge>
				))}
			</span>
		),
	},
	{
		id: "wave",
		header: "WAVES",
		sortable: true,
		mono: true,
		cell: (agent) =>
			isFirmAgent(agent) ? (
				<span
					data-testid={`catalog-agent-waves-${agent.slug}`}
					title={FIRM_WAVES.title}
					className="relative text-text-subtle"
				>
					{FIRM_WAVES.text}
					<span className="sr-only">{`, ${FIRM_WAVES.title}`}</span>
				</span>
			) : (
				inWaveOrder(agent.waveDefaults).join("")
			),
	},
	{
		id: "version",
		header: <span>VER {sampleHeader("SHA")}</span>,
		mono: true,
		cell: (agent) => {
			const sha = sampleHistory(agent).versions[0]?.sha256 ?? "";
			return (
				// Stacked, so the column stays narrow beside the panel.
				<span className="flex flex-col">
					<span className="text-foreground">{`v${agent.version}`}</span>
					<code
						data-testid={`catalog-agent-sha-${agent.slug}`}
						title={sha}
						data-full={sha}
						className="text-text-subtle"
					>
						{sha.slice(0, 8)}
					</code>
				</span>
			);
		},
	},
	{
		id: "tokens",
		header: sampleHeader("EST/CEIL"),
		mono: true,
		align: "end",
		cell: (agent) => {
			const d = sampleDispatch(agent);
			return (
				<span
					title={`Estimate ${d.estimate.toLocaleString("en-US")} tokens, soft ceiling ${d.softCeiling.toLocaleString("en-US")}, hard ceiling ${d.hardCeiling.toLocaleString("en-US")}`}
				>
					{`${kTokens(d.estimate)}/${kTokens(d.hardCeiling)}`}
				</span>
			);
		},
	},
];

export const PAGE_SIZE = 10;

/**
 * The process table: one dense row per template, machine values in mono.
 * A row opens the panel, by pointer or by Enter.
 */
export function AgentProcessTable({
	agents,
	sort,
	onSortChange,
	onOpen,
}: {
	agents: AgentTemplate[];
	sort: SortState;
	onSortChange: (next: SortState) => void;
	onOpen: (slug: string) => void;
}) {
	return (
		<div className="flex min-w-0 flex-col gap-2">
			<DataTable
				label="All agents"
				data-testid="catalog-agents-table"
				columns={COLUMNS}
				rows={agents}
				getRowId={(agent) => agent.slug}
				density="compact"
				stickyHeader={false}
				sort={sort}
				onSortChange={onSortChange}
				onRowClick={(agent) => onOpen(agent.slug)}
			/>
		</div>
	);
}

// ---------------------------------------------------------------------------
// The filter row: side tabs with counts, search, and a filter for wave and kind.

export const SIDE_TABS: readonly { id: SideTab | undefined; label: string }[] =
	[
		{ id: undefined, label: "All" },
		{ id: "author", label: "Authors" },
		{ id: "tester", label: "Testers" },
		{ id: "judge", label: "Judges" },
		{ id: "fixture", label: "Fixture" },
		{ id: "firm", label: "Firm" },
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
	const searchId = useId();
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
				className="flex flex-wrap items-center gap-1"
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
							size="sm"
							variant={pressed ? "secondary" : "ghost"}
							aria-pressed={pressed}
							data-testid={`catalog-agents-side-${tab.id ?? "all"}`}
							onClick={() => onChange({ ...filters, side: tab.id })}
							className="rounded-full"
						>
							{tab.label}
							<span
								data-testid={`catalog-agents-side-${tab.id ?? "all"}-count`}
								className="type-mono-small text-text-subtle tabular-nums"
							>
								{count}
							</span>
						</Button>
					);
				})}
			</fieldset>
			<div className="flex items-center gap-2">
				<div className="relative">
					<label htmlFor={searchId} className="sr-only">
						Search agents
					</label>
					<Search
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-subtle"
					/>
					<Input
						id={searchId}
						type="search"
						data-testid="catalog-agents-search"
						placeholder="Search agents"
						value={filters.q ?? ""}
						onChange={(event) =>
							onChange({ ...filters, q: event.target.value })
						}
						className="h-8 w-52 pl-8"
					/>
				</div>
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
								<span className="type-mono-small tabular-nums">{narrowed}</span>
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
	onChange,
}: {
	label: string;
	testId: string;
	value: string | undefined;
	options: readonly string[];
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
					className="w-full type-mono-small"
				>
					<SelectValue>{value ?? "all"}</SelectValue>
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={ALL}>all</SelectItem>
					{options.map((option) => (
						<SelectItem key={option} value={option}>
							{option}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

/** "Showing 8 of 8", and page controls when there is more than one page. */
export function AgentTableFooter({
	shown,
	total,
	page,
	pages,
	onPage,
}: {
	shown: number;
	total: number;
	page: number;
	pages: number;
	onPage: (page: number) => void;
}) {
	return (
		<div
			data-testid="catalog-agents-footer"
			className="flex items-center justify-between gap-2"
		>
			<p
				data-testid="catalog-agents-showing"
				className="type-caption text-text-subtle tabular-nums"
			>
				{`Showing ${shown} of ${total}`}
			</p>
			{pages > 1 ? (
				<nav aria-label="Pages" className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Previous page"
						disabled={page === 0}
						onClick={() => onPage(page - 1)}
					>
						<ChevronLeft aria-hidden="true" />
					</Button>
					{Array.from({ length: pages }, (_, i) => (
						<Button
							// biome-ignore lint/suspicious/noArrayIndexKey: a page is its index
							key={i}
							variant={i === page ? "secondary" : "ghost"}
							size="icon-sm"
							aria-current={i === page ? "page" : undefined}
							data-testid={`catalog-agents-page-${i + 1}`}
							onClick={() => onPage(i)}
							className="type-mono-small"
						>
							{i + 1}
						</Button>
					))}
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Next page"
						disabled={page === pages - 1}
						onClick={() => onPage(page + 1)}
					>
						<ChevronRight aria-hidden="true" />
					</Button>
				</nav>
			) : null}
		</div>
	);
}
