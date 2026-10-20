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
import { entryLabel } from "./agent-access";
import { ActorLabel } from "./agent-actor";
import { EmptyState } from "./empty-state";
import { Paging, PanelFooter } from "./panel-footer";
import { SectionPanel } from "./section-panel";
import { ErrorState } from "./surface";

/*
 * An agent's recent activity, on its Overview: what happened to its places
 * on missions (added, changed, removed), read from the activity log in one
 * request naming all of its roster entries (entityId, up to 100), the
 * latest few at a time with Load more. What the agent itself does on a run
 * is logged once dispatch runs agents (module 6); until then these are the
 * operator's and the system's entries about it.
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
	// Read here, not in the list, so its paging sits in the footer band. Off
	// until the entries are in: an empty id list reads nothing.
	const activity = useEntriesActivity(
		entries.data?.map((e) => e.entryId) ?? [],
	);
	return (
		<SectionPanel
			title="Recent activity"
			description={`When ${agent.name} was added to, changed on or removed from a mission. Its own work shows here once agents run (module 6).`}
			data-testid="agent-activity"
			footer={
				<PanelFooter
					data-testid="agent-activity-read-age"
					queries={[entries, activity]}
				>
					{activity.hasNextPage ? (
						<Paging
							loaded={activity.data?.pages.flatMap((p) => p.data).length ?? 0}
							total={activity.data?.pages[0]?.meta.total}
							hasMore
							loadingMore={activity.isFetchingNextPage}
							onLoadMore={() => activity.fetchNextPage()}
							testIdPrefix="agent-activity"
						/>
					) : null}
				</PanelFooter>
			}
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
					entries={entries.data}
					activity={activity}
				/>
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
	activity,
}: {
	name: string;
	entries: readonly AgentRosterEntry[];
	activity: ReturnType<typeof useEntriesActivity>;
}) {
	const entryIds = entries.map((e) => e.entryId);
	const rows = activity.data?.pages.flatMap((page) => page.data) ?? [];
	if (entryIds.length === 0)
		return (
			<EmptyState
				data-testid="agent-activity-empty"
				compact
				icon={History}
				title="Not on a mission"
				description={`${name} hasn't been added to a mission yet, so there's no activity to show.`}
			/>
		);
	if (activity.status === "pending") return <ActivitySkeleton />;
	if (activity.status === "error")
		return (
			<ErrorState
				error={activity.error}
				retry={() => activity.refetch()}
				retrying={activity.isFetching}
			/>
		);
	if (rows.length === 0)
		return (
			<EmptyState
				data-testid="agent-activity-empty"
				compact
				icon={History}
				title="Nothing logged yet"
				description={`Nothing has been logged for ${name} yet. Adding it to a mission, changing it there or removing it shows here.`}
			/>
		);
	return (
		<div data-testid="agent-activity-list" className="flex flex-col gap-4">
			{byMission(rows, entries).map((group) => (
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
							className="py-1.5 -my-1.5 min-w-0 truncate rounded-xs type-small font-medium text-foreground underline-offset-4 hover:underline"
						>
							{group.entry ? entryLabel(group.entry) : "A mission it has left"}
						</Link>
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
						className="type-mono text-text-subtle tabular-nums"
					>
						{whenLabel(entry.at)}
					</time>
					<span className="min-w-0 type-small text-foreground">
						{ACTION_COPY[entry.action]}
						<span className="text-text-subtle">
							{" by "}
							<ActorLabel
								actor={entry.actor}
								data-testid={`agent-activity-actor-${entry.id}`}
							/>
						</span>
					</span>
					<Link
						to="/activity"
						search={{ entry: entry.id }}
						data-testid={`agent-activity-open-${entry.id}`}
						className="py-1.5 -my-1.5 rounded-xs type-caption text-accent-text underline-offset-4 hover:underline"
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
