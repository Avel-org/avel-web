import { Link } from "@tanstack/react-router";
import type {
	ActivityEntry,
	AgentRosterEntry,
	AgentTemplate,
} from "avel-server/contract";
import { History } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTemplateRosterEntries } from "@/lib/api/access";
import { useEntriesActivity } from "@/lib/api/activity";
import { ACTION_COPY } from "./activity-copy";
import { entryLabel, short } from "./agent-access";
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
				<EntryActivity name={agent.name} entries={entries.data} />
			)}
		</SectionPanel>
	);
}

export type MissionGroup = {
	missionId: string;
	/** The roster entry on that mission, when the agent is still on it. */
	entry: AgentRosterEntry | undefined;
	rows: ActivityEntry[];
};

/**
 * The log's rows grouped by the mission they happened on, in the order the
 * newest row of each arrives, rows newest first inside each. A row with no
 * mission on it takes its roster entry's.
 */
export function byMission(
	rows: readonly ActivityEntry[],
	entries: readonly AgentRosterEntry[],
): MissionGroup[] {
	const groups = new Map<string, MissionGroup>();
	for (const row of rows) {
		const missionId =
			row.missionId ??
			entries.find((e) => e.entryId === row.entityId)?.missionId;
		if (missionId === undefined) continue;
		const group = groups.get(missionId) ?? {
			missionId,
			entry: entries.find((e) => e.missionId === missionId),
			rows: [],
		};
		group.rows.push(row);
		groups.set(missionId, group);
	}
	return [...groups.values()];
}

function EntryActivity({
	name,
	entries,
}: {
	name: string;
	entries: readonly AgentRosterEntry[];
}) {
	const entryIds = entries.map((e) => e.entryId);
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
		<div data-testid="agent-activity-list" className="flex flex-col gap-4">
			{byMission(activity.entries, entries).map((group) => (
				<section
					key={group.missionId}
					aria-labelledby={`agent-activity-${group.missionId}`}
					data-testid={`agent-activity-group-${group.missionId}`}
					className="flex flex-col"
				>
					<h3
						id={`agent-activity-${group.missionId}`}
						className="flex min-w-0 items-baseline gap-2 border-b border-border pb-1.5"
					>
						<Link
							to="/missions/$id"
							params={{ id: group.missionId }}
							data-testid={`agent-activity-mission-${group.missionId}`}
							className="min-w-0 truncate rounded-xs type-small font-medium text-foreground underline-offset-4 hover:underline"
						>
							{group.entry ? entryLabel(group.entry) : "A mission it has left"}
						</Link>
						<span className="type-mono-small text-text-subtle">
							{short(group.missionId)}
						</span>
					</h3>
					<ActivityRows rows={group.rows} />
				</section>
			))}
		</div>
	);
}

function ActivityRows({ rows }: { rows: readonly ActivityEntry[] }) {
	return (
		<ol className="flex flex-col">
			{rows.map((entry) => (
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
