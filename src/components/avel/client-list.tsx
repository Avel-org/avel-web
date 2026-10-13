import type { InfiniteData } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { Client, ClientStatus } from "avel-server/contract";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	clientInitials,
	clientSearchText,
	engagementSummary,
	isoDate,
	listTotal,
	type Page,
	relativeTime,
	statusTone,
	type useClients,
} from "@/lib/api/clients";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";
import { StatusPill } from "./status-pill";
import { ErrorState, Surface } from "./surface";

/** Every client loaded so far, across the pages fetched. */
export function loadedClients(data: InfiniteData<Page<Client>>): Client[] {
	return data.pages.flatMap((page) => page.data);
}

/** The loaded clients a status filter keeps; no filter keeps them all. */
export function filtered(
	clients: Client[],
	status: ClientStatus | undefined,
): Client[] {
	return status ? clients.filter((c) => c.status === status) : clients;
}

/**
 * The Table view (ruling 36): every loaded client as one row, for reading
 * across. Each name is a link to the client's page. The board is the page's
 * first view; this is the second.
 */
export function ClientTable({
	query,
	search,
	status,
	onClearSearch,
	now,
}: {
	query: ReturnType<typeof useClients>;
	search: string | undefined;
	status: ClientStatus | undefined;
	onClearSearch: () => void;
	now: number;
}) {
	return (
		<Surface
			data-testid="client-list"
			query={query}
			isEmpty={(data) => loadedClients(data).length === 0}
			loading={<ClientListSkeleton />}
			empty={<ClientsNoMatch search={search} onClearSearch={onClearSearch} />}
			error={ErrorState}
		>
			{(data) => {
				const rows = filtered(loadedClients(data), status);
				return (
					<div className="flex flex-col gap-3">
						<div className="plate overflow-hidden rounded-md border">
							<Table data-testid="client-table">
								<TableHeader className="bg-app-band">
									<TableRow>
										<TableHead className="pl-4">Client</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Engagements</TableHead>
										<TableHead className="hidden lg:table-cell">
											Since
										</TableHead>
										<TableHead className="pr-4 text-right">Updated</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody data-testid="client-rows">
									{rows.map((client) => (
										<ClientRow key={client.id} client={client} now={now} />
									))}
								</TableBody>
							</Table>
							{rows.length === 0 ? (
								<p
									data-testid="client-table-none"
									className="type-small px-4 py-3 text-text-muted"
								>
									{`No ${status} clients among those loaded.`}
								</p>
							) : null}
						</div>
						<ClientListFooter
							loaded={loadedClients(data).length}
							total={listTotal(data)}
							hasMore={query.hasNextPage}
							loadingMore={query.isFetchingNextPage}
							onLoadMore={() => query.fetchNextPage()}
						/>
					</div>
				);
			}}
		</Surface>
	);
}

function ClientRow({ client, now }: { client: Client; now: number }) {
	const closed = client.status === "closed";
	return (
		<TableRow
			data-testid={`client-row-${client.id}`}
			data-status={client.status}
			className="hover:bg-state-hover"
		>
			<TableCell className="pl-4">
				<div className="flex min-w-0 items-center gap-3">
					<ClientTile name={client.name} closed={closed} size="sm" />
					<div className="flex min-w-0 flex-col">
						<Link
							to="/clients/$id"
							params={{ id: client.id }}
							data-testid={`client-row-link-${client.id}`}
							className="type-body truncate rounded-xs font-medium text-foreground underline-offset-4 hover:underline"
						>
							{client.name}
						</Link>
						<span className="type-caption truncate text-text-subtle">
							{client.primaryContact ?? "No primary contact"}
						</span>
					</div>
				</div>
			</TableCell>
			<TableCell>
				<StatusPill
					size="sm"
					tone={statusTone(client.status)}
					label={closed ? "Closed" : "Active"}
					data-testid={`client-status-${client.id}`}
				/>
			</TableCell>
			<TableCell className="type-mono-small text-text-muted">
				{engagementSummary(client)}
			</TableCell>
			<TableCell className="type-mono-small hidden text-text-muted lg:table-cell">
				<time dateTime={client.createdAt}>{isoDate(client.createdAt)}</time>
			</TableCell>
			<TableCell className="type-caption pr-4 text-right text-text-subtle">
				<time
					dateTime={client.updatedAt}
					title={client.updatedAt}
					suppressHydrationWarning
				>
					{relativeTime(client.updatedAt, now)}
				</time>
			</TableCell>
		</TableRow>
	);
}

/**
 * A client's tile: its initials on the accent while active, on a quiet
 * recessed face once closed, so a closed client reads as ended at a glance.
 */
export function ClientTile({
	name,
	closed,
	size = "md",
}: {
	name: string;
	closed: boolean;
	size?: "sm" | "md";
}) {
	return (
		<span
			aria-hidden="true"
			data-testid="client-tile"
			data-closed={closed || undefined}
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-sm border font-semibold",
				size === "sm" ? "size-8 type-caption" : "size-10 type-small",
				closed
					? "border-border bg-app-recessed text-text-subtle"
					: "border-accent bg-accent-soft text-accent-text",
			)}
		>
			{clientInitials(name)}
		</span>
	);
}

/** A search that matched no client, with the way out of it. */
export function ClientsNoMatch({
	search,
	onClearSearch,
}: {
	search: string | undefined;
	onClearSearch: () => void;
}) {
	return (
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
	);
}

/** How much of the list is loaded, and a way to load the rest. */
export function ClientListFooter({
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
		<div className="flex items-center justify-between gap-2">
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

/** Three rows in the table's real shape: few, so it does not promise many. */
export function ClientListSkeleton() {
	return (
		<div
			data-testid="client-list-skeleton"
			className="plate flex flex-col overflow-hidden rounded-md border"
		>
			<div className="h-10 border-b border-border bg-app-band" />
			{[0, 1, 2].map((i) => (
				<div
					key={i}
					data-testid="client-list-skeleton-row"
					className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
				>
					<Skeleton className="size-8 rounded-sm" />
					<span className="flex flex-1 flex-col gap-1.5">
						<Skeleton className="h-4 w-40" />
						<Skeleton className="h-3 w-28" />
					</span>
					<Skeleton className="h-5 w-14 rounded-full" />
					<Skeleton className="hidden h-3 w-36 md:block" />
				</div>
			))}
		</div>
	);
}
