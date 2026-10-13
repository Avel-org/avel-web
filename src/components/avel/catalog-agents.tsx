import { useNavigate } from "@tanstack/react-router";
import type { AgentTemplate } from "avel-server/contract";
import { Bot, LayoutGrid, Network } from "lucide-react";
import { type ReactNode, useState } from "react";
import { loadedRows, type useAgentTemplates } from "@/lib/api/catalog";
import { AgentCardGrid, AgentCardSkeleton } from "./catalog-agent-card";
import { AgentGraph } from "./catalog-agent-graph";
import { AGENT_MISSING } from "./catalog-agent-placeholders";
import {
	AgentFilterRow,
	type AgentFilters,
	filterAgents,
	sortAgents,
} from "./catalog-agent-table";
import {
	CatalogListFooter,
	CatalogListSkeleton,
	SampleRegion,
} from "./catalog-sample";
import { EmptyState } from "./empty-state";
import { ErrorState, Surface } from "./surface";
import { type ViewOption, ViewToggle } from "./view-toggle";

/*
 * All agents, /catalog/agents (ROUTES.md). The board is a grid of agent
 * cards (ruling 44), each a notched plate built from sections: identity,
 * roles, where it works, territory, writable paths. The artifact graph is
 * the second view (ruling 36). Opening an agent goes to its page,
 * /catalog/agents/:slug; nothing slides over the list. The agents are live
 * (GET /api/agent-templates). Read-only throughout: an identity is
 * generated from roles, so nothing here edits one. The graph's edges and
 * each card's territory and side are still labelled samples (rulings 32
 * and 34): no route serves them yet.
 */

export type AgentView = "cards" | "graph";

/** Cards first: the board is the page; the graph is for tracing artifacts. */
const AGENT_VIEWS = [
	{ id: "cards", label: "Cards", icon: LayoutGrid },
	{ id: "graph", label: "Graph", icon: Network },
] as const satisfies readonly ViewOption<AgentView>[];

/**
 * The graph's region: its nodes are the live agents, but every edge is
 * derived from a client copy of ROLES.md, so the whole drawing is a sample.
 * The cards have no region of their own: they are live, and each card's
 * sample section carries its own pill.
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
			data-testid="catalog-agents-cards-frame"
			className="flex min-w-0 flex-col gap-3"
		>
			{children}
		</div>
	);
}

export function CatalogAgents({
	query,
	view,
	onViewChange,
}: {
	/** The live list, owned by the route. */
	query: ReturnType<typeof useAgentTemplates>;
	/** The view, owned by the route: it is in the URL. */
	view: AgentView;
	onViewChange: (view: AgentView) => void;
}) {
	return (
		<div
			data-testid="catalog-agents"
			className="flex min-h-0 flex-1 flex-col gap-3"
		>
			<ViewToggle
				options={AGENT_VIEWS}
				view={view}
				onChange={onViewChange}
				testIdPrefix="catalog-agents-view"
				className="self-start"
			/>
			<Surface
				data-testid="catalog-agents-surface"
				query={query}
				isEmpty={(data) => loadedRows(data).length === 0}
				loading={
					<ViewFrame view={view}>
						{view === "graph" ? (
							<CatalogListSkeleton data-testid="catalog-agents-skeleton" />
						) : (
							<AgentCardSkeleton data-testid="catalog-agents-skeleton" />
						)}
					</ViewFrame>
				}
				empty={
					<ViewFrame view={view}>
						<EmptyState
							data-testid="catalog-agents-empty"
							compact
							icon={Bot}
							title="No agents yet"
							description="An agent is data: the roles it covers, its generated identity and its default waves. Each one is listed here."
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
 * The loaded agents: the filter row, the chosen view and the count. Only
 * rendered with data, inside the router, so the list's other states need
 * none.
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

	const open = (slug: string) =>
		navigate({ to: "/catalog/agents/$slug", params: { slug } });
	// Wave order, A to E, then the firm agents: the order a mission runs in.
	const matching = sortAgents(filterAgents(agents, filters), {
		column: "wave",
		direction: "asc",
	});

	return (
		<div className="flex min-w-0 flex-1 flex-col gap-3">
			<ViewFrame view={view}>
				<AgentFilterRow
					agents={agents}
					filters={filters}
					onChange={setFilters}
				/>
				{matching.length === 0 ? (
					<EmptyState
						data-testid="catalog-agents-no-match"
						compact
						icon={Bot}
						title="No agents match"
						description="No agent has this side, wave, kind and search together."
					/>
				) : view === "cards" ? (
					<AgentCardGrid agents={matching} />
				) : (
					<AgentGraph agents={matching} onOpen={open} />
				)}
			</ViewFrame>
			<div
				data-testid="catalog-agents-footer"
				className="flex flex-wrap items-center justify-between gap-2"
			>
				{/* The one count on the page, against the server's total. */}
				<p
					data-testid="catalog-agents-showing"
					className="type-caption text-text-subtle tabular-nums"
				>
					{`Showing ${matching.length} of ${total ?? agents.length}`}
				</p>
				{/* Only Load more: the count above already says how many. */}
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
