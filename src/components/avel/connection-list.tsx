import type { Connection } from "avel-server/contract";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { isoDate } from "@/lib/api/clients";
import {
	CONNECTION_SCOPE,
	CONNECTION_SERVICE,
	CONNECTION_STATUS,
	connectionsTotal,
	loadedConnections,
	type useConnections,
} from "@/lib/api/connections";
import { linkFor } from "../../shell/nav";
import { type DataColumn, DataTable } from "./data-table";
import { EmptyState } from "./empty-state";
import { StatusPill } from "./status-pill";
import { ErrorState, Surface } from "./surface";

/*
 * Connected accounts, /settings/connections (module 2): each connection's
 * scope, kind, status and age, live from GET /api/connections. Tokens are
 * never displayed; a row shows only the name of the environment variable
 * that holds one. Creating a connection has a route (POST /api/connections)
 * and no form yet, so the control is real and disabled with its reason.
 */

export const CONNECTION_WRITE_REASON =
	"Adding a connection isn't wired into this page yet";

export function NewConnectionButton({
	"data-testid": testId = "connections-new",
}: {
	"data-testid"?: string;
}) {
	return (
		<Button
			size="sm"
			data-testid={testId}
			disabledReason={CONNECTION_WRITE_REASON}
		>
			<Plus aria-hidden="true" />
			New connection
		</Button>
	);
}

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
					className="type-mono-small text-text-subtle"
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
					className="type-mono-small text-foreground"
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
		cell: (row) => {
			const { tone, label } = CONNECTION_STATUS[row.status];
			return (
				<StatusPill
					size="sm"
					tone={tone}
					label={label}
					data-testid={`connection-status-${row.id}`}
				/>
			);
		},
	},
	{
		id: "created",
		header: "Created",
		width: "7rem",
		mono: true,
		cell: (row) => isoDate(row.createdAt),
	},
];

/** Three rows in the table's shape: few, so it does not promise many. */
function ConnectionListSkeleton() {
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
					<Skeleton className="h-5 w-16 rounded-full" />
					<Skeleton className="h-4 w-20" />
				</div>
			))}
		</div>
	);
}

export function ConnectionList({
	query,
}: {
	/** The live list, owned by the route. */
	query: ReturnType<typeof useConnections>;
}) {
	return (
		<Surface
			data-testid="connection-list"
			query={query}
			isEmpty={(data) => loadedConnections(data).length === 0}
			loading={<ConnectionListSkeleton />}
			empty={
				<EmptyState
					data-testid="connections-empty"
					icon={linkFor("/settings/connections").icon}
					title="No connections yet"
					description="A connection is a GitHub account AVEL may deliver through, scoped to an owner or one repository. Its token stays in an environment variable; only the variable's name is kept here."
					action={<NewConnectionButton data-testid="connections-empty-new" />}
				/>
			}
			error={ErrorState}
		>
			{(data) => (
				<div className="flex flex-col gap-2">
					<DataTable
						label="Connections"
						data-testid="connection-table"
						columns={COLUMNS}
						rows={loadedConnections(data)}
						getRowId={(row) => row.id}
						stickyHeader={false}
					/>
					<div className="flex items-center justify-between gap-2 px-3">
						<p
							data-testid="connections-showing"
							className="type-caption text-text-subtle tabular-nums"
						>
							{`Showing ${loadedConnections(data).length} of ${connectionsTotal(data) ?? loadedConnections(data).length}`}
						</p>
						{query.hasNextPage ? (
							<Button
								variant="ghost"
								size="sm"
								data-testid="connections-load-more"
								disabled={query.isFetchingNextPage}
								onClick={() => query.fetchNextPage()}
							>
								{query.isFetchingNextPage ? "Loading" : "Load more"}
							</Button>
						) : null}
					</div>
				</div>
			)}
		</Surface>
	);
}
