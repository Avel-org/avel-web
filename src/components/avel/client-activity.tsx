import { Link } from "@tanstack/react-router";
import type { ActivityEntry, Client } from "avel-server/contract";
import { History } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientActivity, useClientEngagements } from "@/lib/api/clients";
import { cn } from "@/lib/utils";
import { ACTION_COPY } from "./activity-copy";
import { whenLabel } from "./agent-activity";
import { EmptyState } from "./empty-state";
import { SectionPanel } from "./section-panel";
import { ErrorState } from "./surface";

/*
 * A client's Activity tab: the log's latest entries for the client itself
 * and for each of its engagements, merged newest first, as a timeline. Each
 * entry names what it was about and links to its decision record.
 */

/** A dot's tone from what happened: made, changed, or ended. */
function toneOf(entry: ActivityEntry): string {
	if (entry.action.endsWith(".created")) return "bg-gate-pass";
	if (entry.action.endsWith(".closed")) return "bg-text-subtle";
	return "bg-accent";
}

export function ClientActivity({ client }: { client: Client }) {
	// The same cache entry the Overview's board reads, so this is usually warm.
	const engagements = useClientEngagements(client.id);
	return (
		<SectionPanel
			title="Activity"
			description="The latest entries for this client and each of its engagements, newest first."
			data-testid="client-activity"
		>
			{engagements.status === "pending" ? (
				<ActivitySkeleton />
			) : engagements.status === "error" ? (
				<ErrorState
					error={engagements.error}
					retry={() => engagements.refetch()}
					retrying={engagements.isFetching}
				/>
			) : (
				<Timeline
					client={client}
					names={
						new Map(
							engagements.data.pages
								.flatMap((page) => page.data)
								.map((e) => [e.id, e.name] as const),
						)
					}
				/>
			)}
		</SectionPanel>
	);
}

function Timeline({
	client,
	names,
}: {
	client: Client;
	/** Engagement names by id: the subjects the log keys by id. */
	names: Map<string, string>;
}) {
	const activity = useClientActivity(client.id, [...names.keys()]);
	if (activity.status === "pending") return <ActivitySkeleton />;
	if (activity.status === "error" && activity.error)
		return (
			<ErrorState
				error={activity.error}
				retry={activity.retry}
				retrying={activity.retrying}
			/>
		);
	if (activity.entries.length === 0)
		return (
			<EmptyState
				data-testid="client-activity-empty"
				compact
				icon={History}
				title="Nothing logged yet"
				description={`No change to ${client.name} or its engagements has been logged. Editing it, or adding or closing an engagement, writes here.`}
			/>
		);
	return (
		<ol
			data-testid="client-activity-list"
			className="relative ml-1.5 flex flex-col border-l border-border"
		>
			{activity.entries.map((entry) => (
				<li
					key={entry.id}
					data-testid={`client-activity-row-${entry.id}`}
					className="relative flex flex-col gap-0.5 py-2.5 pl-5 sm:flex-row sm:items-baseline sm:gap-3"
				>
					<span
						aria-hidden="true"
						className={cn(
							"absolute top-4 -left-1 size-2 rounded-full ring-4 ring-app-plate",
							toneOf(entry),
						)}
					/>
					<time
						dateTime={entry.at}
						className="type-mono-small shrink-0 text-text-subtle tabular-nums sm:w-28"
					>
						{whenLabel(entry.at)}
					</time>
					<span className="type-small min-w-0 flex-1 text-foreground">
						{ACTION_COPY[entry.action]}
						<span
							data-testid={`client-activity-subject-${entry.id}`}
							className="text-text-muted"
						>
							{entry.entityType === "engagement"
								? `: ${names.get(entry.entityId) ?? "an engagement"}`
								: ""}
						</span>
						<span className="text-text-subtle">{` by ${entry.actor.display}`}</span>
					</span>
					<Link
						to="/activity"
						search={{ entry: entry.id }}
						data-testid={`client-activity-open-${entry.id}`}
						className="type-caption w-fit rounded-xs text-accent-text underline-offset-4 hover:underline"
					>
						Record
					</Link>
				</li>
			))}
		</ol>
	);
}

function ActivitySkeleton() {
	return (
		<div data-testid="client-activity-skeleton" className="flex flex-col gap-2">
			<Skeleton className="h-6 w-full" />
			<Skeleton className="h-6 w-full" />
			<Skeleton className="h-6 w-2/3" />
		</div>
	);
}
