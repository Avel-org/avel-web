import type { Client, Engagement } from "avel-server/contract";
import { MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { isoDate, statusTone, useClientEngagements } from "@/lib/api/clients";
import { StatusPill } from "./status-pill";
import { ErrorState, Surface } from "./surface";

/**
 * A client's engagements, inside its expanded row. This fetches
 * contract.engagements.list for the one client, and only once the row opens.
 *
 * `activeOnly` lists only the active ones: the engagements that block closing
 * the client. It says so above the list, with a way back to all of them.
 */
export function EngagementList({
	client,
	activeOnly = false,
	onShowAll,
	onNewEngagement,
	onCloseEngagement,
}: {
	client: Client;
	activeOnly?: boolean;
	onShowAll?: () => void;
	onNewEngagement: () => void;
	onCloseEngagement: (engagement: Engagement) => void;
}) {
	const query = useClientEngagements(
		client.id,
		activeOnly ? "active" : undefined,
	);
	return (
		<div className="flex flex-col gap-2">
			{activeOnly ? (
				<div
					data-testid={`engagements-filter-${client.id}`}
					className="flex items-center gap-2"
				>
					<p className="type-small text-text-muted">
						Showing active engagements only. Close them to close the client.
					</p>
					<Button
						variant="link"
						size="sm"
						className="h-auto px-0"
						data-testid={`engagements-show-all-${client.id}`}
						onClick={onShowAll}
					>
						Show all
					</Button>
				</div>
			) : null}
			<EngagementSurface
				client={client}
				query={query}
				empty={activeOnly ? "No active engagements." : "No engagements yet."}
				onNewEngagement={onNewEngagement}
				onCloseEngagement={onCloseEngagement}
			/>
		</div>
	);
}

function EngagementSurface({
	client,
	query,
	empty,
	onNewEngagement,
	onCloseEngagement,
}: {
	client: Client;
	query: ReturnType<typeof useClientEngagements>;
	empty: string;
	onNewEngagement: () => void;
	onCloseEngagement: (engagement: Engagement) => void;
}) {
	return (
		<Surface
			data-testid={`engagements-${client.id}`}
			query={query}
			isEmpty={(data) => data.pages.every((page) => page.data.length === 0)}
			loading={<EngagementSkeleton />}
			empty={
				<div className="flex flex-wrap items-center gap-3">
					<p className="type-small text-text-muted">{empty}</p>
					<NewEngagementButton client={client} onClick={onNewEngagement} />
				</div>
			}
			error={ErrorState}
		>
			{(data) => (
				<EngagementRows
					client={client}
					engagements={data.pages.flatMap((page) => page.data)}
					hasMore={query.hasNextPage}
					loadingMore={query.isFetchingNextPage}
					onLoadMore={() => query.fetchNextPage()}
					onNewEngagement={onNewEngagement}
					onCloseEngagement={onCloseEngagement}
				/>
			)}
		</Surface>
	);
}

/** The engagements themselves. Presentational, so tests render it directly. */
export function EngagementRows({
	client,
	engagements,
	hasMore,
	loadingMore,
	onLoadMore,
	onNewEngagement,
	onCloseEngagement,
}: {
	client: Client;
	engagements: Engagement[];
	hasMore: boolean;
	loadingMore: boolean;
	onLoadMore: () => void;
	onNewEngagement: () => void;
	onCloseEngagement: (engagement: Engagement) => void;
}) {
	return (
		<div className="flex flex-col gap-2">
			<ul
				aria-label={`Engagements for ${client.name}`}
				data-testid={`engagement-rows-${client.id}`}
				className="flex flex-col divide-y divide-border rounded-control border border-border bg-card"
			>
				{engagements.map((e) => (
					<li
						key={e.id}
						data-testid={`engagement-${e.id}`}
						className="flex items-center gap-3 px-3 py-2"
					>
						<span className="type-body min-w-0 flex-1 truncate text-foreground">
							{e.name}
						</span>
						<StatusPill
							size="sm"
							tone={statusTone(e.status)}
							label={e.status === "active" ? "Active" : "Closed"}
							data-testid={`engagement-status-${e.id}`}
						/>
						<span className="type-mono text-text-muted">
							<span className="sr-only">Started </span>
							<time dateTime={e.startedAt}>{isoDate(e.startedAt)}</time>
						</span>
						<EngagementMenu
							engagement={e}
							onClose={() => onCloseEngagement(e)}
						/>
					</li>
				))}
			</ul>
			<div className="flex items-center gap-2">
				<NewEngagementButton client={client} onClick={onNewEngagement} />
				{hasMore ? (
					<Button
						variant="ghost"
						size="sm"
						data-testid={`engagements-more-${client.id}`}
						disabled={loadingMore}
						onClick={onLoadMore}
					>
						{loadingMore ? "Loading" : "Load more engagements"}
					</Button>
				) : null}
			</div>
		</div>
	);
}

function NewEngagementButton({
	client,
	onClick,
}: {
	client: Client;
	onClick: () => void;
}) {
	return (
		<Button
			variant="outline"
			size="sm"
			data-testid={`engagement-new-${client.id}`}
			disabledReason={
				client.status === "closed"
					? "Reopen the client to add an engagement."
					: undefined
			}
			onClick={onClick}
		>
			<Plus aria-hidden="true" />
			New engagement
		</Button>
	);
}

/** A closed engagement has nothing left to do; its item says so (ruling 20). */
function EngagementMenu({
	engagement,
	onClose,
}: {
	engagement: Engagement;
	onClose: () => void;
}) {
	const closed = engagement.status === "closed";
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={`Actions for ${engagement.name}`}
					data-testid={`engagement-menu-${engagement.id}`}
				>
					<MoreHorizontal aria-hidden="true" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-60">
				<DropdownMenuItem
					variant="destructive"
					disabled={closed}
					data-testid={`engagement-close-${engagement.id}`}
					onSelect={onClose}
				>
					{closed ? (
						<span className="flex flex-col">
							Close engagement
							<span className="type-caption">Already closed</span>
						</span>
					) : (
						"Close engagement"
					)}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function EngagementSkeleton() {
	return (
		<div data-testid="engagements-skeleton" className="flex flex-col gap-2">
			<Skeleton className="h-9 w-full rounded-control" />
			<Skeleton className="h-9 w-full rounded-control" />
		</div>
	);
}
