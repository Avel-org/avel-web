import { Bot, LayoutGrid, Network } from "lucide-react";
import { type ReactNode, useState } from "react";
import { loadedRows, type useAgentTemplates } from "@/lib/api/catalog";
import { AgentCardGrid, AgentCardSkeleton } from "./catalog-agent-card";
import { AgentGraphCanvas } from "./catalog-agent-graph";
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
import { DataPanel } from "./data-panel";
import { EmptyState } from "./empty-state";
import { PanelFooter } from "./panel-footer";
import { ErrorState, Surface } from "./surface";
import { type ViewOption, ViewToggle } from "./view-toggle";

/*
 * All agents, /catalog/agents (ROUTES.md). The board is a grid of agent
 * cards (ruling 44), each a v3 card built from sections: identity,
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
			title="Handoff graph"
			what="Agents in wave columns. An arrow runs from each agent that makes a file to each agent that reads it, labelled with the file and its hash."
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

/**
 * The page's one panel, as every list page: the filters and the view in its
 * toolbar, the cards or graph in its body, and when the list was read, how
 * many are shown and Load more in its footer band. The filters need the
 * loaded agents, so they appear once the list has read.
 */
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
	const [filters, setFilters] = useState<AgentFilters>({});
	const agents = query.data ? loadedRows(query.data) : [];
	const total = query.data?.pages[0]?.meta.total;
	// Wave order, A to E, then the firm agents: the order a mission runs in.
	const matching = sortAgents(filterAgents(agents, filters), {
		column: "wave",
		direction: "asc",
	});

	return (
		<div
			data-testid="catalog-agents"
			className="flex min-h-0 flex-1 flex-col gap-3"
		>
			<DataPanel
				data-testid="catalog-agents-panel"
				title="Agents"
				count={total}
				toolbar={
					<div className="flex w-full min-w-0 flex-wrap items-start gap-2">
						{query.status === "success" && agents.length > 0 ? (
							<div className="min-w-0 flex-1">
								<AgentFilterRow
									agents={agents}
									filters={filters}
									onChange={setFilters}
								/>
							</div>
						) : null}
						<ViewToggle
							options={AGENT_VIEWS}
							view={view}
							onChange={onViewChange}
							testIdPrefix="catalog-agents-view"
							className="ml-auto"
						/>
					</div>
				}
				footer={
					<PanelFooter data-testid="catalog-agents-read-age" queries={[query]}>
						{query.status === "success" ? (
							<span
								data-testid="catalog-agents-footer"
								className="flex items-center gap-2"
							>
								{/* The one count on the page, against the server's total. */}
								<span
									data-testid="catalog-agents-showing"
									className="type-caption text-text-subtle tabular-nums"
								>
									{`Showing ${matching.length} of ${total ?? agents.length}`}
								</span>
								{/* Only Load more: the count beside it says how many. */}
								<CatalogListFooter
									loaded={agents.length}
									total={undefined}
									hasMore={query.hasNextPage}
									loadingMore={query.isFetchingNextPage}
									onLoadMore={() => query.fetchNextPage()}
									data-testid="catalog-agents-list-footer"
								/>
							</span>
						) : null}
					</PanelFooter>
				}
			>
				<div className="p-4">
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
									description="Each agent is a set of roles, the identity written from them, and the waves it works in. Every agent is listed here."
								/>
							</ViewFrame>
						}
						error={ErrorState}
					>
						{() => (
							<ViewFrame view={view}>
								{matching.length === 0 ? (
									<EmptyState
										data-testid="catalog-agents-no-match"
										compact
										icon={Bot}
										title="No agents match"
										description="No agent matches every filter and search set here. Clear one to see more."
									/>
								) : view === "cards" ? (
									<AgentCardGrid agents={matching} />
								) : (
									<AgentGraphCanvas agents={matching} />
								)}
							</ViewFrame>
						)}
					</Surface>
				</div>
			</DataPanel>
			<p
				data-testid="catalog-agents-identity-note"
				className="type-caption text-text-subtle"
			>
				An agent's identity is generated from its roles, never written by hand.
				Open an agent to change its title, roles or paths, then regenerate its
				identity.
			</p>
		</div>
	);
}
