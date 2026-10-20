import type {
	Client,
	Engagement,
	EngagementStatus,
} from "avel-server/contract";
import { MoreHorizontal, Plus } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { isoDate, useClientEngagements } from "@/lib/api/clients";
import { cn } from "@/lib/utils";
import { ErrorState, Surface } from "./surface";

/*
 * A client's engagements as a board (ruling 45): two lanes, Active and
 * Closed, each engagement a card with its scope's opening lines and its
 * dates. Active ends with a place for the next one. The lane counts are the
 * client's own counts, so they hold however many cards are loaded.
 */

const LANES: { status: EngagementStatus; label: string }[] = [
	{ status: "active", label: "Active" },
	{ status: "closed", label: "Closed" },
];

export function EngagementBoard({
	client,
	onNewEngagement,
	onCloseEngagement,
}: {
	client: Client;
	onNewEngagement: () => void;
	onCloseEngagement: (engagement: Engagement) => void;
}) {
	const query = useClientEngagements(client.id);
	const counts: Record<EngagementStatus, number> = {
		active: client.activeEngagementCount,
		closed: client.engagementCount - client.activeEngagementCount,
	};
	return (
		<Surface
			data-testid="engagement-board"
			query={query}
			// No engagements still draws the lanes: the empty Active lane is
			// where the first one starts.
			isEmpty={() => false}
			loading={<EngagementBoardSkeleton />}
			empty={null}
			error={ErrorState}
		>
			{(data) => {
				const all = data.pages.flatMap((page) => page.data);
				return (
					<div className="flex flex-col gap-3">
						<div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
							{LANES.map((lane) => (
								<Lane
									key={lane.status}
									status={lane.status}
									label={lane.label}
									count={counts[lane.status]}
									engagements={all.filter((e) => e.status === lane.status)}
									client={client}
									onNewEngagement={onNewEngagement}
									onCloseEngagement={onCloseEngagement}
								/>
							))}
						</div>
						{query.hasNextPage ? (
							<Button
								variant="ghost"
								size="sm"
								className="self-start"
								data-testid="engagement-board-more"
								disabled={query.isFetchingNextPage}
								onClick={() => query.fetchNextPage()}
							>
								{query.isFetchingNextPage ? "Loading" : "Load more engagements"}
							</Button>
						) : null}
					</div>
				);
			}}
		</Surface>
	);
}

function Lane({
	status,
	label,
	count,
	engagements,
	client,
	onNewEngagement,
	onCloseEngagement,
}: {
	status: EngagementStatus;
	label: string;
	count: number;
	engagements: Engagement[];
	client: Client;
	onNewEngagement: () => void;
	onCloseEngagement: (engagement: Engagement) => void;
}) {
	const headingId = useId();
	return (
		<section
			aria-labelledby={headingId}
			data-testid={`engagement-lane-${status}`}
			className="flex min-w-0 flex-col gap-2 rounded-card border border-border bg-app-well p-2"
		>
			<header className="flex items-center gap-2 px-1.5 pt-1">
				<span
					aria-hidden="true"
					className={cn(
						"size-2 rounded-full",
						status === "active"
							? "bg-gate-pass-solid"
							: "bg-gate-pending-solid",
					)}
				/>
				<h3 id={headingId} className="type-small font-medium text-foreground">
					{label}
				</h3>
				<span
					data-testid={`engagement-lane-${status}-count`}
					className="type-mono text-text-subtle tabular-nums"
				>
					{count}
				</span>
			</header>
			<ul className="flex flex-col gap-2">
				{engagements.map((e) => (
					<li key={e.id}>
						<EngagementCard
							engagement={e}
							onClose={() => onCloseEngagement(e)}
						/>
					</li>
				))}
			</ul>
			{status === "active" ? (
				<Button
					variant="ghost"
					size="sm"
					data-testid={`engagement-board-new-${client.id}`}
					className="justify-start border border-dashed border-border-strong"
					disabledReason={
						client.status === "closed"
							? "Reopen the client to add an engagement."
							: undefined
					}
					onClick={onNewEngagement}
				>
					<Plus aria-hidden="true" />
					New engagement
				</Button>
			) : engagements.length === 0 ? (
				<p
					data-testid="engagement-lane-closed-none"
					className="type-small px-1.5 pb-1 text-text-subtle"
				>
					None closed.
				</p>
			) : null}
		</section>
	);
}

/** One engagement: name, the scope's opening lines, and its dates in mono. */
export function EngagementCard({
	engagement,
	onClose,
}: {
	engagement: Engagement;
	onClose: () => void;
}) {
	const closed = engagement.status === "closed";
	return (
		<article
			aria-label={engagement.name}
			data-testid={`engagement-card-${engagement.id}`}
			data-status={engagement.status}
			className="flex flex-col gap-1.5 p-2.5 rounded-card border border-border bg-app-panel shadow-card"
		>
			<div className="flex items-start gap-2">
				<p
					className={cn(
						"type-body min-w-0 flex-1 truncate font-medium",
						closed ? "text-text-muted" : "text-foreground",
					)}
				>
					{engagement.name}
				</p>
				{closed ? null : (
					<EngagementCardMenu engagement={engagement} onClose={onClose} />
				)}
			</div>
			<p
				data-testid={`engagement-card-scope-${engagement.id}`}
				className={cn(
					"type-small line-clamp-2 whitespace-pre-line",
					engagement.scopeMd ? "text-text-muted" : "text-text-subtle",
				)}
			>
				{engagement.scopeMd ?? "No scope written."}
			</p>
			<p className="type-mono flex flex-wrap gap-x-3 text-text-subtle">
				<span>
					Started{" "}
					<time dateTime={engagement.startedAt}>
						{isoDate(engagement.startedAt)}
					</time>
				</span>
				{engagement.closedAt ? (
					<span data-testid={`engagement-card-closed-${engagement.id}`}>
						Closed{" "}
						<time dateTime={engagement.closedAt}>
							{isoDate(engagement.closedAt)}
						</time>
					</span>
				) : null}
			</p>
		</article>
	);
}

function EngagementCardMenu({
	engagement,
	onClose,
}: {
	engagement: Engagement;
	onClose: () => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					className="-mt-1 -mr-1.5"
					aria-label={`Actions for ${engagement.name}`}
					data-testid={`engagement-card-menu-${engagement.id}`}
				>
					<MoreHorizontal aria-hidden="true" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuItem
					variant="destructive"
					data-testid={`engagement-card-close-${engagement.id}`}
					onSelect={onClose}
				>
					Close engagement
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function EngagementBoardSkeleton() {
	return (
		<div
			data-testid="engagement-board-skeleton"
			className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2"
		>
			{[0, 1].map((lane) => (
				<div
					key={lane}
					className="flex flex-col gap-2 rounded-card border border-border bg-app-well p-2"
				>
					<Skeleton className="mx-1.5 mt-1 h-4 w-20" />
					<Skeleton className="h-24 w-full rounded-card" />
					{lane === 0 ? (
						<Skeleton className="h-8 w-full rounded-control" />
					) : null}
				</div>
			))}
		</div>
	);
}
