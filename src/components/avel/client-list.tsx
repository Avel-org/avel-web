import type { InfiniteData } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { Client } from "avel-server/contract";
import { SearchX } from "lucide-react";
import type { KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	clientSearchText,
	engagementSummary,
	listTotal,
	type Page,
	statusTone,
	type useClients,
} from "@/lib/api/clients";
import { cn } from "@/lib/utils";
import { ClientSearch } from "./client-search";
import { EmptyState } from "./empty-state";
import { StatusPill } from "./status-pill";
import { ErrorState, Surface } from "./surface";

/** Every client loaded so far, across the pages fetched. */
export function loadedClients(data: InfiniteData<Page<Client>>): Client[] {
	return data.pages.flatMap((page) => page.data);
}

/**
 * The left pane: the search, then a slim list of clients, a page at a time.
 * Each row is a link to the client (?client=<id>, keeping the search), so a
 * selected client is a link. The route owns the query; this renders it.
 */
export function ClientListPane({
	query,
	search,
	onSearch,
	selectedId,
	onClearSearch,
}: {
	query: ReturnType<typeof useClients>;
	/** The settled search, or undefined for none. */
	search: string | undefined;
	onSearch: (text: string) => void;
	selectedId: string | undefined;
	onClearSearch: () => void;
}) {
	return (
		<section
			aria-label="Clients"
			data-testid="client-pane"
			className="flex min-h-0 flex-col gap-3"
		>
			<ClientSearch value={search ?? ""} onChange={onSearch} />
			<Surface
				data-testid="client-list"
				query={query}
				isEmpty={(data) => loadedClients(data).length === 0}
				loading={<ClientListSkeleton />}
				// First run (no clients at all) is the page's to show, across both
				// panes; here an empty list is always a search that matched nothing.
				empty={
					<EmptyState
						data-testid="clients-no-match"
						compact
						icon={SearchX}
						title="No clients match"
						description={`Nothing matches “${clientSearchText(search) ?? ""}” in a client's name or primary contact.`}
						action={
							<Button
								size="sm"
								variant="outline"
								data-testid="clients-clear-search"
								onClick={onClearSearch}
							>
								Clear search
							</Button>
						}
					/>
				}
				error={ErrorState}
			>
				{(data) => (
					<div className="flex flex-col gap-2">
						<ClientRows
							clients={loadedClients(data)}
							selectedId={selectedId}
							search={search}
						/>
						<ListFooter
							loaded={loadedClients(data).length}
							total={listTotal(data)}
							hasMore={query.hasNextPage}
							loadingMore={query.isFetchingNextPage}
							onLoadMore={() => query.fetchNextPage()}
						/>
					</div>
				)}
			</Surface>
		</section>
	);
}

/**
 * The rows: links, so Enter and a click both select, and the selection is a
 * URL. Up and Down move between rows (AVEL-DESIGN.md section 12, keyboard
 * first); Home and End jump to the ends.
 */
export function ClientRows({
	clients,
	selectedId,
	search,
}: {
	clients: Client[];
	selectedId: string | undefined;
	search: string | undefined;
}) {
	const move = (event: KeyboardEvent<HTMLUListElement>) => {
		const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
		if (!keys.includes(event.key)) return;
		const links = [
			...event.currentTarget.querySelectorAll<HTMLAnchorElement>("a"),
		];
		const at = links.indexOf(document.activeElement as HTMLAnchorElement);
		const next =
			event.key === "Home"
				? 0
				: event.key === "End"
					? links.length - 1
					: event.key === "ArrowDown"
						? Math.min(at + 1, links.length - 1)
						: Math.max(at - 1, 0);
		event.preventDefault();
		links[next]?.focus();
	};

	return (
		<ul
			aria-label="Clients"
			data-testid="client-rows"
			className="flex flex-col gap-0.5"
			onKeyDown={move}
		>
			{clients.map((client) => {
				const selected = client.id === selectedId;
				return (
					<li key={client.id}>
						<Link
							to="/clients"
							search={{ q: search, client: client.id }}
							data-testid={`client-row-${client.id}`}
							// The router marks the active link aria-current="page" itself,
							// after any prop, so the selected row needs no marker of ours.
							data-selected={selected || undefined}
							className={cn(
								"focus-inset relative flex flex-col gap-1 rounded-sm px-3 py-2 transition-colors duration-(--duration-micro) ease-avel hover:bg-state-hover",
								// The selected row: the selected fill, and the accent edge
								// section 5 allows for a selected list row.
								selected &&
									"bg-state-selected before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-accent hover:bg-state-selected",
							)}
						>
							<span className="flex items-center gap-2">
								<span className="type-body min-w-0 flex-1 truncate font-medium text-foreground">
									{client.name}
								</span>
								<StatusPill
									size="sm"
									tone={statusTone(client.status)}
									label={client.status === "active" ? "Active" : "Closed"}
									data-testid={`client-status-${client.id}`}
								/>
							</span>
							<span className="type-mono-small text-text-muted">
								{engagementSummary(client)}
							</span>
						</Link>
					</li>
				);
			})}
		</ul>
	);
}

/** How much of the list is loaded, and a way to load the rest. */
function ListFooter({
	loaded,
	total,
	hasMore,
	loadingMore,
	onLoadMore,
}: {
	loaded: number;
	total: number | undefined;
	hasMore: boolean;
	loadingMore: boolean;
	onLoadMore: () => void;
}) {
	if (total === undefined && !hasMore) return null;
	return (
		<div className="flex items-center justify-between gap-2 px-3">
			{total === undefined ? (
				<span />
			) : (
				<p
					data-testid="clients-showing"
					className="type-caption text-text-subtle tabular-nums"
				>
					{`Showing ${loaded} of ${total}`}
				</p>
			)}
			{hasMore ? (
				<Button
					variant="ghost"
					size="sm"
					data-testid="clients-load-more"
					disabled={loadingMore}
					onClick={onLoadMore}
				>
					{loadingMore ? "Loading" : "Load more"}
				</Button>
			) : null}
		</div>
	);
}

/** Three rows in the list's real shape: few, so it does not promise many. */
export function ClientListSkeleton() {
	return (
		<div data-testid="client-list-skeleton" className="flex flex-col gap-0.5">
			{[0, 1, 2].map((i) => (
				<div
					key={i}
					data-testid="client-list-skeleton-row"
					className="flex flex-col gap-1.5 px-3 py-2"
				>
					<span className="flex items-center gap-2">
						<Skeleton className="h-4 flex-1" />
						<Skeleton className="h-5 w-14 rounded-full" />
					</span>
					<Skeleton className="h-3 w-36" />
				</div>
			))}
		</div>
	);
}
