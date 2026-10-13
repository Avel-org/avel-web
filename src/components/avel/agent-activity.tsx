import { Link } from "@tanstack/react-router";
import type { AgentTemplate } from "avel-server/contract";
import { History } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTemplateRosterEntries } from "@/lib/api/access";
import { useEntriesActivity } from "@/lib/api/activity";
import { ACTION_COPY } from "./activity-copy";
import { EmptyState } from "./empty-state";
import { SectionPanel } from "./section-panel";
import { ErrorState } from "./surface";

/*
 * An agent's recent activity, on its Overview: what happened to its places
 * on missions (added, changed, removed), read from the activity log by each
 * of its roster entries. What the agent itself does on a run is logged once
 * dispatch runs agents (module 6); until then these are the operator's and
 * the system's entries about it.
 */

/** "12 Oct, 14:05", in UTC, so every viewer reads the same time. */
export function whenLabel(iso: string): string {
	const date = new Date(iso);
	const day = date.toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	});
	const time = date.toLocaleTimeString("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "UTC",
	});
	return `${day}, ${time}`;
}

export function AgentActivity({ agent }: { agent: AgentTemplate }) {
	const entries = useTemplateRosterEntries(agent.id);
	return (
		<SectionPanel
			title="Recent activity"
			description={`Changes to ${agent.name}'s places on missions. Its own work is logged once dispatch runs it (module 6).`}
			data-testid="agent-activity"
		>
			{entries.status === "pending" ? (
				<ActivitySkeleton />
			) : entries.status === "error" ? (
				<ErrorState
					error={entries.error}
					retry={() => entries.refetch()}
					retrying={entries.isFetching}
				/>
			) : (
				<EntryActivity
					name={agent.name}
					entryIds={entries.data.map((e) => e.entryId)}
				/>
			)}
		</SectionPanel>
	);
}

function EntryActivity({
	name,
	entryIds,
}: {
	name: string;
	entryIds: string[];
}) {
	const activity = useEntriesActivity(entryIds);
	if (entryIds.length === 0)
		return (
			<EmptyState
				data-testid="agent-activity-empty"
				compact
				icon={History}
				title="Not on a mission"
				description={`${name} has not been put on a mission, so the log has nothing about it.`}
			/>
		);
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
				data-testid="agent-activity-empty"
				compact
				icon={History}
				title="Nothing logged yet"
				description={`No change to ${name}'s places on missions has been logged. Adding, changing or removing it on a mission writes here.`}
			/>
		);
	return (
		<ol data-testid="agent-activity-list" className="flex flex-col">
			{activity.entries.map((entry) => (
				<li
					key={entry.id}
					data-testid={`agent-activity-row-${entry.id}`}
					className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto] items-baseline gap-3 border-b border-border py-2.5 last:border-b-0"
				>
					<time
						dateTime={entry.at}
						className="type-mono-small text-text-subtle tabular-nums"
					>
						{whenLabel(entry.at)}
					</time>
					<span className="min-w-0 type-small text-foreground">
						{ACTION_COPY[entry.action]}
						<span className="text-text-subtle">{` by ${entry.actor.display}`}</span>
					</span>
					<Link
						to="/activity"
						search={{ entry: entry.id }}
						data-testid={`agent-activity-open-${entry.id}`}
						className="rounded-xs type-caption text-accent-text underline-offset-4 hover:underline"
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
		<div data-testid="agent-activity-skeleton" className="flex flex-col gap-2">
			<Skeleton className="h-6 w-full" />
			<Skeleton className="h-6 w-full" />
			<Skeleton className="h-6 w-2/3" />
		</div>
	);
}
