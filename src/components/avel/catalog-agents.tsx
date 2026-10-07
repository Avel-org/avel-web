import { useNavigate } from "@tanstack/react-router";
import type { AgentTemplate } from "avel-server/contract";
import { Bot, Network, Rows3 } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ApiError } from "@/lib/api/errors";
import { AgentGraph } from "./catalog-agent-graph";
import { AgentPanelSheet } from "./catalog-agent-inspector";
import { AGENT_MISSING } from "./catalog-agent-placeholders";
import {
	AgentFilterRow,
	type AgentFilters,
	AgentProcessTable,
	AgentTableFooter,
	filterAgents,
	PAGE_SIZE,
	sortAgents,
} from "./catalog-agent-table";
import { CATALOG_MISSING, SAMPLE_AGENTS } from "./catalog-placeholders";
import {
	CatalogListSkeleton,
	type CatalogQuery,
	SampleRegion,
	sampleQuery,
} from "./catalog-sample";
import type { SortState } from "./data-table";
import { EmptyState } from "./empty-state";
import { ErrorState, type ErrorStateProps, Surface } from "./surface";

/*
 * Agent templates, /catalog/agents (ROUTES.md), as a spec console: a dense
 * table of templates, or the artifact graph between them, each at the full
 * content width, and a slide-over panel for the one selected (?agent=slug). Read-only throughout: an identity is generated from roles, so
 * nothing here edits one. Until module 4's routes land, every value is a
 * labelled sample (AVEL-DESIGN.md ruling 32).
 */

export type AgentView = "table" | "graph";

const REGION = {
	table: {
		missing: CATALOG_MISSING.templates,
		title: "Agent templates",
		what: "Every agent template, one row each: territory, side, roles, waves, version and hash, and token estimate.",
	},
	graph: {
		missing: AGENT_MISSING.edges,
		title: "Artifact graph",
		what: "Agents in wave columns, with an arrow from each producer to each consumer, labelled with the artifact and its hash.",
	},
} as const;

/** The view's sample region, around whatever state the list is in. */
function ViewRegion({
	view,
	children,
}: {
	view: AgentView;
	children: ReactNode;
}) {
	return (
		<SampleRegion
			{...REGION[view]}
			data-testid={`catalog-agents-${view}-region`}
		>
			{children}
		</SampleRegion>
	);
}

export function CatalogAgents({
	selected,
	query = sampleQuery(SAMPLE_AGENTS),
	initialView = "table",
}: {
	selected: string | undefined;
	query?: CatalogQuery<AgentTemplate>;
	initialView?: AgentView;
}) {
	const [view, setView] = useState<AgentView>(initialView);
	const [centreOn, setCentreOn] = useState<string | undefined>();

	const failed = ({ error, retry, retrying }: ErrorStateProps<ApiError>) => (
		<ViewRegion view={view}>
			<ErrorState error={error} retry={retry} retrying={retrying} />
		</ViewRegion>
	);

	return (
		<div
			data-testid="catalog-agents"
			className="flex min-h-0 flex-1 flex-col gap-3"
		>
			<ViewToggle
				view={view}
				onChange={(next) => {
					setCentreOn(undefined);
					setView(next);
				}}
			/>
			<Surface
				data-testid="catalog-agents-surface"
				query={query}
				loading={
					<ViewRegion view={view}>
						<CatalogListSkeleton data-testid="catalog-agents-skeleton" />
					</ViewRegion>
				}
				empty={
					<ViewRegion view={view}>
						<EmptyState
							data-testid="catalog-agents-empty"
							compact
							icon={Bot}
							title="No agent templates yet"
							description="A template is an agent as data: the roles it covers, its generated identity and its default waves. Each one is listed here."
						/>
					</ViewRegion>
				}
				error={failed}
			>
				{(agents) => (
					<AgentConsole
						agents={agents}
						view={view}
						centreOn={centreOn}
						selected={selected}
						onViewInGraph={(slug) => {
							setCentreOn(slug);
							setView("graph");
						}}
					/>
				)}
			</Surface>
			<p
				data-testid="catalog-agents-read-only"
				className="type-caption text-text-subtle"
			>
				Identities are generated from roles, so nothing here is edited by hand.
				To change an agent, change a role it covers.
			</p>
		</div>
	);
}

/**
 * The loaded templates: the filter row, the chosen view and its footer, and
 * the panel. Only rendered with data, inside the router, so the list's other
 * states need none.
 */
function AgentConsole({
	agents,
	view,
	centreOn,
	selected,
	onViewInGraph,
}: {
	agents: readonly AgentTemplate[];
	view: AgentView;
	centreOn: string | undefined;
	selected: string | undefined;
	onViewInGraph: (slug: string) => void;
}) {
	const navigate = useNavigate({ from: "/catalog/agents" });
	const [filters, setFilters] = useState<AgentFilters>({});
	const [sort, setSort] = useState<SortState>({
		column: "wave",
		direction: "asc",
	});
	const [page, setPage] = useState(0);

	const select = (agent: string | undefined) =>
		navigate({ search: (prev) => ({ ...prev, agent }) });
	const matching = sortAgents(filterAgents(agents, filters), sort);
	const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
	const shown = matching.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
	const open = agents.find((agent) => agent.slug === selected);
	// The last agent shown stays in the sheet while it slides out, so closing
	// animates instead of emptying first.
	const last = useRef<AgentTemplate | undefined>(undefined);
	if (open) last.current = open;
	const inSheet = open ?? last.current;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex min-w-0 flex-1 flex-col gap-3">
				<ViewRegion view={view}>
					<AgentFilterRow
						agents={agents}
						filters={filters}
						onChange={(next) => {
							setFilters(next);
							setPage(0);
						}}
					/>
					{matching.length === 0 ? (
						<EmptyState
							data-testid="catalog-agents-no-match"
							compact
							icon={Bot}
							title="No agents match"
							description="No template has this side, wave, kind and search together."
						/>
					) : view === "table" ? (
						<>
							<AgentProcessTable
								agents={shown}
								sort={sort}
								onSortChange={setSort}
								onOpen={select}
							/>
							<AgentTableFooter
								shown={shown.length}
								total={agents.length}
								page={page}
								pages={pages}
								onPage={setPage}
							/>
						</>
					) : (
						<AgentGraph
							agents={matching}
							selected={selected}
							centreOn={centreOn}
							onOpen={select}
						/>
					)}
				</ViewRegion>
			</div>
			{inSheet ? (
				<AgentPanelSheet
					agent={inSheet}
					agents={agents}
					onOpen={select}
					onViewInGraph={onViewInGraph}
					onClose={() => select(undefined)}
					open={open !== undefined}
				/>
			) : null}
		</div>
	);
}

/** Table | Graph: two pressed-state buttons, one pressed. */
function ViewToggle({
	view,
	onChange,
}: {
	view: AgentView;
	onChange: (view: AgentView) => void;
}) {
	return (
		<fieldset
			data-testid="catalog-agents-view"
			className="inline-flex items-center gap-0.5 self-start rounded-sm border border-border p-0.5"
		>
			<legend className="sr-only">View</legend>
			{(
				[
					["table", "Table", Rows3],
					["graph", "Graph", Network],
				] as const
			).map(([id, label, Icon]) => (
				<Button
					key={id}
					size="sm"
					variant={view === id ? "secondary" : "ghost"}
					aria-pressed={view === id}
					data-testid={`catalog-agents-view-${id}`}
					onClick={() => onChange(id)}
				>
					<Icon aria-hidden="true" />
					{label}
				</Button>
			))}
		</fieldset>
	);
}
