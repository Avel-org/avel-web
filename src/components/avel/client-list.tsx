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
	type Page,
	relativeTime,
	statusTone,
	type useClients,
} from "@/lib/api/clients";
import { cn } from "@/lib/utils";
import { STRETCHED_LINK } from "./data-table";
import { EmptyState } from "./empty-state";
import { Paging } from "./panel-footer";
import { StatusPill } from "./status-pill";
import { ErrorState, Surface } from "./surface";

/** Every client loaded so far, across the pages fetched. */
export function loadedClients(data: InfiniteData<Page<Client>>): Client[] {
	return data.pages.flatMap((page) => page.data);
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
	onClearStatus,
	now,
}: {
	query: ReturnType<typeof useClients>;
	search: string | undefined;
	status: ClientStatus | undefined;
	onClearSearch: () => void;
	/** Drops the status filter, so every client shows. */
	onClearStatus: () => void;
	now: number;
}) {
	return (
		<Surface
			data-testid="client-list"
			query={query}
			isEmpty={(data) => loadedClients(data).length === 0}
			loading={<ClientListSkeleton />}
			empty={
				<div className="p-4">
					{search === undefined && status !== undefined ? (
						<NoClientsWithStatus status={status} onShowAll={onClearStatus} />
					) : (
						<ClientsNoMatch search={search} onClearSearch={onClearSearch} />
					)}
				</div>
			}
			error={(props) => (
				<div className="p-4">
					<ErrorState {...props} />
				</div>
			)}
		>
			{(data) => {
				const rows = loadedClients(data);
				return (
					// The page's panel frames the table and carries its paging.
					<div className="flex flex-col">
						<div>
							<Table data-testid="client-table">
								<TableHeader className="bg-app-band">
									<TableRow>
										<TableHead className="pl-4">Client</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Engagements</TableHead>
										<TableHead className="hidden lg:table-cell">
											Since
										</TableHead>
										<TableHead className="pr-4 text-right">
											Last activity
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody data-testid="client-rows">
									{rows.map((client) => (
										<ClientRow key={client.id} client={client} now={now} />
									))}
								</TableBody>
							</Table>
						</div>
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
			// The whole row opens the client: its name link is stretched over
			// it, so the row that reacts to hover is the link (v3 UX 5).
			className="relative hover:bg-app-raised"
		>
			<TableCell className="pl-4">
				<div className="flex min-w-0 items-center gap-3">
					<ClientTile name={client.name} closed={closed} size="sm" />
					<div className="flex min-w-0 flex-col">
						<Link
							to="/clients/$id"
							params={{ id: client.id }}
							data-testid={`client-row-link-${client.id}`}
							title={client.name}
							className={cn(
								"type-body truncate rounded-xs font-medium text-foreground underline-offset-4 hover:underline",
								STRETCHED_LINK,
							)}
						>
							{client.name}
						</Link>
						{/* As on the card: no contact, no line, rather than filler. */}
						{client.primaryContact === null ? null : (
							<span
								data-testid={`client-row-contact-${client.id}`}
								title={client.primaryContact}
								className="type-caption truncate text-text-subtle"
							>
								{client.primaryContact}
							</span>
						)}
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
			<TableCell className="type-mono text-text-muted">
				{engagementSummary(client)}
			</TableCell>
			<TableCell className="type-mono hidden text-text-muted lg:table-cell">
				<time dateTime={client.createdAt}>{isoDate(client.createdAt)}</time>
			</TableCell>
			<TableCell
				data-testid={`client-row-activity-${client.id}`}
				className="type-caption pr-4 text-right text-text-subtle"
			>
				{client.lastActivityAt === null ? (
					"No activity yet"
				) : (
					<time
						dateTime={client.lastActivityAt}
						title={client.lastActivityAt}
						suppressHydrationWarning
					>
						{relativeTime(client.lastActivityAt, now)}
					</time>
				)}
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
				"inline-flex shrink-0 items-center justify-center rounded-tile border font-semibold",
				size === "sm" ? "size-tile-md type-caption" : "size-tile-lg type-small",
				closed
					? "border-dashed border-border-strong bg-app-well text-text-subtle"
					: "border-border bg-app-panel text-text-muted",
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

/** A status filter that keeps no client, with no search to blame. */
function NoClientsWithStatus({
	status,
	onShowAll,
}: {
	status: ClientStatus;
	onShowAll: () => void;
}) {
	return (
		<EmptyState
			data-testid="clients-none-with-status"
			compact
			icon={SearchX}
			title={status === "active" ? "No active clients" : "No closed clients"}
			description={
				status === "active"
					? "Every client is closed. Reopen one, or add a new client."
					: "No client has been closed."
			}
			action={
				<Button
					size="sm"
					variant="outline"
					data-testid="clients-show-all"
					onClick={onShowAll}
				>
					Show all clients
				</Button>
			}
		/>
	);
}

/** How much of the list is loaded, and a way to load the rest. */
export function ClientListFooter({
	testIdPrefix = "clients",
	loaded,
	total,
	hasMore,
	loadingMore,
	onLoadMore,
}: {
	/** Each list on a page names its own footer: "clients" for the table. */
	testIdPrefix?: string;
	loaded: number;
	total: number | undefined;
	hasMore: boolean;
	loadingMore: boolean;
	onLoadMore: () => void;
}) {
	if (total === undefined && !hasMore) return null;
	return (
		<div className="flex items-center justify-between gap-2">
			{/* A spacer keeps Load more at the end when there is no total. */}
			{total === undefined ? <span /> : null}
			<Paging
				loaded={loaded}
				total={total}
				hasMore={hasMore}
				loadingMore={loadingMore}
				onLoadMore={onLoadMore}
				testIdPrefix={testIdPrefix}
			/>
		</div>
	);
}

/** Three rows in the table's real shape: few, so it does not promise many. */
export function ClientListSkeleton() {
	return (
		<div data-testid="client-list-skeleton" className="flex flex-col">
			<div className="h-10 border-b border-border bg-app-band" />
			{[0, 1, 2].map((i) => (
				<div
					key={i}
					data-testid="client-list-skeleton-row"
					className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
				>
					<Skeleton className="size-8 rounded-control" />
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
