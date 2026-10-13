import { useNavigate } from "@tanstack/react-router";
import type { AgentTemplate } from "avel-server/contract";
import { Bot, Network, Rows3 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { loadedRows, type useAgentTemplates } from "@/lib/api/catalog";
import { AgentGraph } from "./catalog-agent-graph";
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
import {
	CatalogListFooter,
	CatalogListSkeleton,
	SampleRegion,
} from "./catalog-sample";
import type { SortState } from "./data-table";
import { EmptyState } from "./empty-state";
import { ErrorState, Surface } from "./surface";

/*
 * Agent templates, /catalog/agents (ROUTES.md), as a spec console: a dense
 * table of templates, or the artifact graph between them, each at the full
 * content width. Opening an agent goes to its page, /catalog/agents/:slug;
 * nothing slides over the list. The templates are live (GET
 * /api/agent-templates). Read-only throughout: an identity is generated
 * from roles, so nothing here edits one. The graph's edges, and the table's
 * territory, side, hash and estimate columns, are still labelled samples
 * (AVEL-DESIGN.md rulings 32 and 34): no route serves them yet.
 */

export type AgentView = "table" | "graph";

/**
 * The graph's region: its nodes are the live templates, but every edge is
 * derived from a client copy of ROLES.md, so the whole drawing is a sample.
 * The table has no region: its rows are live, and each sample column says
 * so in its own header.
 */
function GraphRegion({ children }: { children: ReactNode }) {
	return (
		<SampleRegion
			missing={AGENT_MISSING.edges}
			title="Artifact graph"
			what="Agents in wave columns, with an arrow from each producer to each consumer, labelled with the artifact and its hash."
			data-testid="catalog-agents-graph-region"
		>
			{children}
		</SampleRegion>
	);
}

/** The view's frame around whatever state the list is in. */
function ViewFrame({
	view,
	children,
}: {
	view: AgentView;
	children: ReactNode;
}) {
	return view === "graph" ? (
		<GraphRegion>{children}</GraphRegion>
	) : (
		<div
			data-testid="catalog-agents-table-frame"
			className="flex min-w-0 flex-col gap-2"
		>
			{children}
		</div>
	);
}

export function CatalogAgents({
	query,
	initialView = "table",
}: {
	/** The live list, owned by the route. */
	query: ReturnType<typeof useAgentTemplates>;
	initialView?: AgentView;
}) {
	const [view, setView] = useState<AgentView>(initialView);

	return (
		<div
			data-testid="catalog-agents"
			className="flex min-h-0 flex-1 flex-col gap-3"
		>
			<ViewToggle view={view} onChange={setView} />
			<Surface
				data-testid="catalog-agents-surface"
				query={query}
				isEmpty={(data) => loadedRows(data).length === 0}
				loading={
					<ViewFrame view={view}>
						<CatalogListSkeleton data-testid="catalog-agents-skeleton" />
					</ViewFrame>
				}
				empty={
					<ViewFrame view={view}>
						<EmptyState
							data-testid="catalog-agents-empty"
							compact
							icon={Bot}
							title="No agent templates yet"
							description="A template is an agent as data: the roles it covers, its generated identity and its default waves. Each one is listed here."
						/>
					</ViewFrame>
				}
				error={ErrorState}
			>
				{(data) => (
					<AgentConsole
						agents={loadedRows(data)}
						total={data.pages[0]?.meta.total}
						hasMore={query.hasNextPage}
						loadingMore={query.isFetchingNextPage}
						onLoadMore={() => query.fetchNextPage()}
						view={view}
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
 * The loaded templates: the filter row, the chosen view and its footer. Only
 * rendered with data, inside the router, so the list's other
 * states need none.
 */
function AgentConsole({
	agents,
	total,
	hasMore,
	loadingMore,
	onLoadMore,
	view,
}: {
	agents: readonly AgentTemplate[];
	/** meta.total from the first page, when the server counted. */
	total: number | undefined;
	hasMore: boolean;
	loadingMore: boolean;
	onLoadMore: () => void;
	view: AgentView;
}) {
	const navigate = useNavigate();
	const [filters, setFilters] = useState<AgentFilters>({});
	const [sort, setSort] = useState<SortState>({
		column: "wave",
		direction: "asc",
	});
	const [page, setPage] = useState(0);

	const open = (slug: string) =>
		navigate({ to: "/catalog/agents/$slug", params: { slug } });
	const matching = sortAgents(filterAgents(agents, filters), sort);
	const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
	const shown = matching.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex min-w-0 flex-1 flex-col gap-3">
				<ViewFrame view={view}>
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
								onOpen={open}
							/>
							<AgentTableFooter
								shown={shown.length}
								// The server's count when it gave one: one "Showing", here.
								total={total ?? agents.length}
								page={page}
								pages={pages}
								onPage={setPage}
							/>
						</>
					) : (
						<AgentGraph agents={matching} onOpen={open} />
					)}
				</ViewFrame>
				{/* Only Load more: the table's footer already says how many. */}
				<CatalogListFooter
					loaded={agents.length}
					total={undefined}
					hasMore={hasMore}
					loadingMore={loadingMore}
					onLoadMore={onLoadMore}
					data-testid="catalog-agents-list-footer"
				/>
			</div>
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
