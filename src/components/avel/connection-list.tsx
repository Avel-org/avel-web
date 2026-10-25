import {
	infiniteQueryOptions,
	queryOptions,
	useInfiniteQuery,
	useQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type Connection, contract } from "avel-server/contract";
import { LayoutGrid, Plug, Plus, Rows3, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { callPage, useApiClient } from "@/lib/api";
import { isoDate, relativeTime, useEngagement } from "@/lib/api/clients";
import {
	CONNECTION_SCOPE,
	CONNECTION_SERVICE,
	CONNECTION_STATUS,
	CONNECTIONS_PAGE_SIZE,
	type ConnectionStatus,
	connectionsTotal,
	loadedConnections,
	useConnections,
} from "@/lib/api/connections";
import { queryKeys } from "@/lib/api/keys";
import { linkFor } from "../../shell/nav";
import { NewConnection } from "./connection-create";
import { type DataColumn, DataTable } from "./data-table";
import { EmptyState } from "./empty-state";
import { Segmented } from "./segmented";
import { StatusPill } from "./status-pill";
import { ErrorState, Surface } from "./surface";
import type { ViewOption } from "./view-toggle";

/*
 * Connected accounts, /settings/connections (module 2): each connection's
 * service, scope, status, engagement and age, live from GET /api/connections.
 * Tokens are never displayed; a connection shows only the name of the
 * environment variable that holds one. Board is a grid of v3 cards (the
 * connectors grid); Table is the same list as rows (ruling 36). A card's
 * name or a row opens the connection's details; New connection opens the
 * Add connection form (POST /api/connections).
 */

/** Board (the default) or Table, as every list page offers (ruling 36). */
export const CONNECTION_VIEWS = [
	{ id: "board", label: "Board", icon: LayoutGrid },
	{ id: "table", label: "Table", icon: Rows3 },
] as const satisfies readonly ViewOption<string>[];
export type ConnectionView = (typeof CONNECTION_VIEWS)[number]["id"];

/** The status filter: every status first, as every filter row starts, then
 * connected (active) and revoked.
 */
export const CONNECTION_FILTERS = ["all", "connected", "revoked"] as const;
export type ConnectionFilter = (typeof CONNECTION_FILTERS)[number];

/** Each filter's contract status: undefined for every status. */
const FILTER_STATUS = {
	connected: "active",
	revoked: "revoked",
	all: undefined,
} as const satisfies Record<ConnectionFilter, ConnectionStatus | undefined>;

const FILTER_LABEL = {
	connected: "Connected",
	revoked: "Revoked",
	all: "All",
} as const satisfies Record<ConnectionFilter, string>;

// ---------------------------------------------------------------------------
// Reads. Every key sits under queryKeys.connections (or engagements), so a
// write's invalidation reaches them all.

/** One status's connections, a page at a time; "all" is useConnections' own list. */
function connectionsByStatusQuery(
	api: ReturnType<typeof useApiClient>,
	status: ConnectionStatus,
) {
	return infiniteQueryOptions({
		queryKey: queryKeys.connections.byStatus(CONNECTIONS_PAGE_SIZE, status),
		queryFn: ({ pageParam }) =>
			callPage(contract.connections.list, () =>
				api.connections.list({
					query: {
						limit: CONNECTIONS_PAGE_SIZE,
						status,
						...(pageParam ? { cursor: pageParam } : {}),
					},
				}),
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
	});
}

/**
 * The list for a filter: useConnections' own list for "all" (so the cache is
 * the one the rest of the app reads), a status-filtered list otherwise.
 * Both hooks run every render, the unused one idle, as hooks must.
 */
export function useConnectionsFor(filter: ConnectionFilter) {
	const status = FILTER_STATUS[filter];
	const all = useConnections();
	const byStatus = useInfiniteQuery({
		...connectionsByStatusQuery(useApiClient(), status ?? "active"),
		enabled: status !== undefined,
	});
	return status === undefined ? all : byStatus;
}

/** How many connections one status has: the meta.total of a one-row read. */
export function connectionCountQuery(
	api: ReturnType<typeof useApiClient>,
	status: ConnectionStatus,
) {
	return queryOptions({
		queryKey: queryKeys.connections.statusCount(status),
		queryFn: () =>
			callPage(contract.connections.list, () =>
				api.connections.list({ query: { limit: 1, status } }),
			),
		select: (page) => page.meta.total,
	});
}

export function useConnectionCount(status: ConnectionStatus) {
	return useQuery(connectionCountQuery(useApiClient(), status));
}

// ---------------------------------------------------------------------------
// The controls above the list.

export function NewConnectionButton({
	"data-testid": testId = "connections-new",
}: {
	"data-testid"?: string;
}) {
	return (
		<NewConnection>
			{(open) => (
				<Button
					size="sm"
					aria-haspopup="dialog"
					data-testid={testId}
					onClick={open}
				>
					<Plus aria-hidden="true" />
					New connection
				</Button>
			)}
		</NewConnection>
	);
}

/** All, Connected, Revoked: a segmented control, each with its exact count. */
export function ConnectionFilterControl({
	value,
	onChange,
}: {
	value: ConnectionFilter;
	onChange: (filter: ConnectionFilter) => void;
}) {
	// All is the unfiltered list's own meta.total: that list is always read.
	const all = connectionsTotal(useConnections().data);
	const counts = {
		connected: useConnectionCount("active").data,
		revoked: useConnectionCount("revoked").data,
		all,
	} as const satisfies Record<ConnectionFilter, number | undefined>;
	return (
		<Segmented
			data-testid="connections-filter"
			legend="Filter by status"
			options={CONNECTION_FILTERS.map((filter) => ({
				value: filter,
				label: FILTER_LABEL[filter],
				count: counts[filter] ?? null,
			}))}
			value={value}
			onChange={(filter) => onChange(filter ?? "all")}
		/>
	);
}

/**
 * When any connection has expired: how many, and what that means for the
 * work, in the contract's own terms (v3 .banner). A delivery through an
 * expired connection is refused; nothing waits on it, so it says no more.
 */
export function ExpiredBanner() {
	const expired = useConnectionCount("expired").data;
	if (!expired) return null;
	return (
		<div
			data-testid="connections-expired-banner"
			className="flex items-center gap-2.5 rounded-card border border-gate-warn-line bg-gate-warn-banner px-3 py-2.5"
		>
			<TriangleAlert
				aria-hidden="true"
				className="size-4 shrink-0 text-gate-warn"
			/>
			<p className="type-small text-text">
				{expired === 1
					? "1 connection expired. Deliveries that use it will be refused."
					: `${expired} connections expired. Deliveries that use them will be refused.`}
			</p>
		</div>
	);
}

// ---------------------------------------------------------------------------
// The table (the Table view).

const COLUMNS: DataColumn<Connection>[] = [
	{
		id: "label",
		header: "Connection",
		cell: (row) => (
			<span className="flex min-w-0 flex-col">
				<span className="font-medium text-foreground">{row.label}</span>
				{/* The variable's name, never its value (contract: credentialRef). */}
				<code
					data-testid={`connection-credential-${row.id}`}
					className="type-mono text-text-subtle"
				>
					{row.credentialRef}
				</code>
			</span>
		),
	},
	{
		id: "scope",
		header: "Scope",
		cell: (row) => (
			<span className="flex min-w-0 flex-col">
				<span
					data-testid={`connection-scope-${row.id}`}
					className="type-mono text-foreground"
				>
					{row.scopeValue}
				</span>
				<span className="type-caption text-text-subtle">
					{CONNECTION_SCOPE[row.scopeType]}
				</span>
			</span>
		),
	},
	{
		id: "kind",
		header: "Kind",
		width: "7rem",
		cell: (row) => (
			<Badge variant="outline" data-testid={`connection-kind-${row.id}`}>
				{CONNECTION_SERVICE[row.service]}
			</Badge>
		),
	},
	{
		id: "status",
		header: "Status",
		width: "7rem",
		cell: (row) => <ConnectionStatusPill connection={row} />,
	},
	{
		id: "created",
		header: "Created",
		width: "7rem",
		mono: true,
		cell: (row) => isoDate(row.createdAt),
	},
];

function ConnectionStatusPill({ connection }: { connection: Connection }) {
	const { tone, label } = CONNECTION_STATUS[connection.status];
	return (
		<StatusPill
			size="sm"
			tone={tone}
			label={label}
			data-testid={`connection-status-${connection.id}`}
		/>
	);
}

// ---------------------------------------------------------------------------
// The board (the Board view): one v3 card per connection.

/** What the card says about the connection's dates, in the order they matter. */
export function connectionDates(
	connection: Pick<
		Connection,
		"status" | "createdAt" | "updatedAt" | "expiresAt" | "revokedAt"
	>,
	now: number,
): string {
	const parts = [`Created ${relativeTime(connection.createdAt, now)}`];
	if (connection.status === "revoked" && connection.revokedAt)
		parts.push(`revoked ${relativeTime(connection.revokedAt, now)}`);
	else if (connection.expiresAt)
		parts.push(
			`${Date.parse(connection.expiresAt) <= now ? "expired" : "expires"} ${relativeTime(connection.expiresAt, now)}`,
		);
	else if (connection.updatedAt !== connection.createdAt)
		parts.push(`updated ${relativeTime(connection.updatedAt, now)}`);
	return parts.join(", ");
}

function ConnectionCard({
	connection,
	now,
	onOpen,
}: {
	connection: Connection;
	now: number;
	onOpen?: (connection: Connection) => void;
}) {
	return (
		<article
			aria-label={connection.label}
			data-testid={`connection-card-${connection.id}`}
			data-status={connection.status}
			className="flex h-full min-w-0 flex-col gap-3 rounded-card border border-border bg-app-panel p-4 shadow-card"
		>
			<header className="flex items-start gap-3">
				{/* v3 .tile.tile-ring: the service, neutral; no brand hue. */}
				<span
					aria-hidden="true"
					className="inline-grid size-tile-md shrink-0 place-items-center rounded-tile border border-border bg-app-panel text-text-muted"
				>
					<Plug className="size-4" />
				</span>
				<span className="flex min-w-0 flex-1 flex-col">
					<h3
						className="truncate type-title text-text"
						title={connection.label}
					>
						{onOpen ? (
							<button
								type="button"
								aria-haspopup="dialog"
								data-testid={`connection-open-${connection.id}`}
								className="max-w-full cursor-pointer truncate text-left underline decoration-transparent underline-offset-2 transition-colors duration-(--duration-micro) ease-avel hover:decoration-current"
								onClick={() => onOpen(connection)}
							>
								{connection.label}
							</button>
						) : (
							connection.label
						)}
					</h3>
					<span
						data-testid={`connection-kind-${connection.id}`}
						className="type-caption text-text-subtle"
					>
						{CONNECTION_SERVICE[connection.service]}
					</span>
				</span>
				<ConnectionStatusPill connection={connection} />
			</header>
			<dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 type-small">
				<dt className="text-text-subtle">
					{CONNECTION_SCOPE[connection.scopeType]}
				</dt>
				<dd
					data-testid={`connection-scope-${connection.id}`}
					className="truncate type-mono text-text"
					title={connection.scopeValue}
				>
					{connection.scopeValue}
				</dd>
				<dt className="text-text-subtle">Token in</dt>
				{/* The variable's name, never its value (contract: credentialRef). */}
				<dd
					data-testid={`connection-credential-${connection.id}`}
					className="truncate type-mono text-text-muted"
					title={connection.credentialRef}
				>
					{connection.credentialRef}
				</dd>
				<dt className="text-text-subtle">For</dt>
				<dd className="min-w-0">
					<EngagementLink
						engagementId={connection.engagementId}
						testId={`connection-engagement-${connection.id}`}
					/>
				</dd>
			</dl>
			<p
				data-testid={`connection-dates-${connection.id}`}
				className="mt-auto border-t border-border pt-2 type-caption text-text-subtle"
			>
				{connectionDates(connection, now)}
			</p>
		</article>
	);
}

/** The engagement a connection belongs to, linked to its client; AVEL's own when none. */
export function EngagementLink({
	engagementId,
	testId,
}: {
	engagementId: string | null;
	testId: string;
}) {
	const engagement = useEngagement(engagementId);
	if (engagementId === null)
		return (
			<span data-testid={testId} className="text-text-muted">
				AVEL's own work
			</span>
		);
	if (engagement.status === "pending")
		return <Skeleton data-testid={`${testId}-loading`} className="h-4 w-28" />;
	if (engagement.status === "error")
		return (
			<span data-testid={testId} className="text-text-subtle">
				Engagement could not be read
			</span>
		);
	return (
		<Link
			to="/clients/$id"
			params={{ id: engagement.data.clientId }}
			data-testid={testId}
			title={engagement.data.name}
			className="inline-block max-w-full truncate py-0.5 align-middle text-text underline decoration-border underline-offset-2 hover:decoration-current"
		>
			{engagement.data.name}
		</Link>
	);
}

/** The dashed card that closes the grid: where a new connection starts. */
function NewConnectionCard() {
	return (
		<NewConnection>
			{(open) => (
				<button
					type="button"
					aria-haspopup="dialog"
					data-testid="connections-card-new"
					className="flex h-full min-h-48 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border-strong bg-app-hollow p-4 text-center text-text-muted transition-colors duration-(--duration-micro) ease-avel hover:bg-app-raised hover:text-text"
					onClick={open}
				>
					<span className="inline-grid size-tile-md place-items-center rounded-tile border border-border bg-app-panel">
						<Plus aria-hidden="true" className="size-4" />
					</span>
					<span className="type-body font-medium">New connection</span>
					<span className="type-caption max-w-56 text-text-subtle">
						A GitHub owner or repository, and the variable that holds its token.
					</span>
				</button>
			)}
		</NewConnection>
	);
}

// ---------------------------------------------------------------------------
// The list.

/** Skeleton cards, or rows, in the content's real shape: few, so it does not promise many. */
function ConnectionListSkeleton({ view }: { view: ConnectionView }) {
	if (view === "table")
		return (
			<div
				data-testid="connection-list-skeleton"
				className="flex flex-col gap-0.5"
			>
				{[0, 1, 2].map((i) => (
					<div
						key={i}
						data-testid="connection-list-skeleton-row"
						className="flex items-center gap-4 px-3 py-2"
					>
						<Skeleton className="h-4 flex-1" />
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-5 w-16 rounded-sm" />
						<Skeleton className="h-4 w-20" />
					</div>
				))}
			</div>
		);
	return (
		<div data-testid="connection-list-skeleton" className={GRID}>
			{[0, 1, 2].map((i) => (
				<div
					key={i}
					data-testid="connection-list-skeleton-row"
					className="flex flex-col gap-3 rounded-card border border-border bg-app-panel p-4 shadow-card"
				>
					<span className="flex items-center gap-3">
						<Skeleton className="size-tile-md rounded-tile" />
						<Skeleton className="h-4 flex-1" />
						<Skeleton className="h-5 w-14 rounded-sm" />
					</span>
					<Skeleton className="h-4 w-3/4" />
					<Skeleton className="h-4 w-1/2" />
				</div>
			))}
		</div>
	);
}

const GRID = "grid gap-4 sm:grid-cols-2 xl:grid-cols-3";

const EMPTY_COPY = {
	connected: {
		title: "No connected accounts",
		description: "No connection is active. Revoked ones are under Revoked.",
	},
	revoked: {
		title: "Nothing revoked",
		description:
			"No connection has been revoked. Closing an engagement revokes its connections.",
	},
	all: {
		title: "No connections yet",
		description:
			"A connection is a GitHub account AVEL may deliver through, scoped to an owner or one repository. Its token stays in an environment variable; only the variable's name is kept here.",
	},
} as const satisfies Record<
	ConnectionFilter,
	{ title: string; description: string }
>;

export function ConnectionList({
	query,
	view = "board",
	filter = "all",
	now,
	onOpen,
}: {
	/** The live list for the filter, owned by the route. */
	query: ReturnType<typeof useConnections>;
	view?: ConnectionView;
	filter?: ConnectionFilter;
	/** Fixed by the page, so relative ages render once. */
	now: number;
	/** Opens one connection's details: a card's name, or a row. */
	onOpen?: (connection: Connection) => void;
}) {
	return (
		<Surface
			data-testid="connection-list"
			query={query}
			isEmpty={(data) => loadedConnections(data).length === 0}
			loading={
				<div className={view === "table" ? undefined : "p-4"}>
					<ConnectionListSkeleton view={view} />
				</div>
			}
			empty={
				<div className="p-4">
					<EmptyState
						data-testid="connections-empty"
						icon={linkFor("/settings/connections").icon}
						title={EMPTY_COPY[filter].title}
						description={EMPTY_COPY[filter].description}
						action={<NewConnectionButton data-testid="connections-empty-new" />}
					/>
				</div>
			}
			error={(props) => (
				<div className="p-4">
					<ErrorState {...props} />
				</div>
			)}
		>
			{(data) => {
				const rows = loadedConnections(data);
				// The table runs to the panel's edges; the cards sit in its padding.
				return (
					<div className={view === "table" ? undefined : "p-4"}>
						{view === "table" ? (
							<DataTable
								label="Connections"
								data-testid="connection-table"
								columns={COLUMNS}
								rows={rows}
								getRowId={(row) => row.id}
								onRowClick={onOpen}
								stickyHeader={false}
							/>
						) : (
							<ul data-testid="connection-board" className={GRID}>
								{rows.map((connection) => (
									<li key={connection.id} className="min-w-0">
										<ConnectionCard
											connection={connection}
											now={now}
											onOpen={onOpen}
										/>
									</li>
								))}
								<li className="min-w-0">
									<NewConnectionCard />
								</li>
							</ul>
						)}
					</div>
				);
			}}
		</Surface>
	);
}
