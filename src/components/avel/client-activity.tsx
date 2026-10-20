import { Link } from "@tanstack/react-router";
import type { ActivityEntry, Client } from "avel-server/contract";
import { History } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientActivity } from "@/lib/api/activity";
import { useClientEngagements, useClientMissions } from "@/lib/api/clients";
import { cn } from "@/lib/utils";
import { ACTION_COPY } from "./activity-copy";
import { whenLabel } from "./agent-activity";
import { ActorLabel } from "./agent-actor";
import { EmptyState } from "./empty-state";
import { Paging, PanelFooter } from "./panel-footer";
import { SectionPanel } from "./section-panel";
import { ErrorState, Surface } from "./surface";

/*
 * A client's Activity tab: the log's entries for the client, its engagements
 * and their missions, newest first, as a timeline. One paged read
 * (activity.list by clientId, the rows Client.lastActivityAt reads), with
 * Load more. Each entry names what it was about and links to its decision
 * record.
 */

/**
 * A dot's tone from what happened: made, changed, or ended. A change is a
 * record of the system's, not something to act on, so it takes the pending
 * grey, never the accent (audit D3).
 */
function toneOf(entry: ActivityEntry): string {
	if (entry.action.endsWith(".created")) return "bg-gate-pass-solid";
	if (entry.action.endsWith(".closed")) return "bg-text-subtle";
	return "bg-gate-pending-solid";
}

export function ClientActivity({ client }: { client: Client }) {
	const activity = useClientActivity(client.id);
	const names = useSubjectNames(client.id);
	return (
		<SectionPanel
			title="Activity"
			description="Everything logged on this client, its engagements and their missions, newest first."
			data-testid="client-activity"
			footer={
				<PanelFooter
					data-testid="client-activity-read-age"
					queries={[activity]}
				>
					{activity.hasNextPage ? (
						<Paging
							loaded={activity.data?.pages.flatMap((p) => p.data).length ?? 0}
							total={activity.data?.pages[0]?.meta.total}
							hasMore
							loadingMore={activity.isFetchingNextPage}
							onLoadMore={() => activity.fetchNextPage()}
							testIdPrefix="client-activity"
						/>
					) : null}
				</PanelFooter>
			}
		>
			<Surface
				data-testid="client-activity-surface"
				query={activity}
				isEmpty={(data) => data.pages.every((page) => page.data.length === 0)}
				loading={<ActivitySkeleton />}
				empty={
					<EmptyState
						data-testid="client-activity-empty"
						compact
						icon={History}
						title="Nothing logged yet"
						description={`No change to ${client.name}, its engagements or their missions has been logged. Editing it, or adding or closing an engagement, writes here.`}
					/>
				}
				error={ErrorState}
			>
				{(data) => {
					const entries = data.pages.flatMap((page) => page.data);
					return (
						<div className="flex flex-col gap-3">
							<Timeline entries={entries} names={names} />
						</div>
					);
				}}
			</Surface>
		</SectionPanel>
	);
}

/**
 * Names for the ids the log keys rows by: the client's engagements, and its
 * missions as "type, sprint n". Both are the Overview's own reads, so they
 * are usually in the cache; until they arrive a row simply names nothing.
 */
function useSubjectNames(clientId: string) {
	const engagements = useClientEngagements(clientId);
	const missions = useClientMissions(clientId);
	return {
		engagements: new Map(
			(engagements.data?.pages ?? [])
				.flatMap((page) => page.data)
				.map((e) => [e.id, e.name] as const),
		),
		missions: new Map(
			(missions.data?.pages ?? [])
				.flatMap((page) => page.data)
				.map((m) => [m.id, `${m.type}, sprint ${m.sprintN}`] as const),
		),
	};
}

type SubjectNames = ReturnType<typeof useSubjectNames>;

/** What a row was about, after its action: an engagement or a mission. */
function subjectOf(entry: ActivityEntry, names: SubjectNames): string {
	if (entry.entityType === "engagement") {
		return `: ${names.engagements.get(entry.entityId) ?? "an engagement"}`;
	}
	if (entry.missionId !== null) {
		const mission = names.missions.get(entry.missionId);
		return mission ? `: ${mission}` : "";
	}
	return "";
}

function Timeline({
	entries,
	names,
}: {
	entries: readonly ActivityEntry[];
	names: SubjectNames;
}) {
	return (
		<ol
			data-testid="client-activity-list"
			className="relative ml-1.5 flex flex-col border-l border-border"
		>
			{entries.map((entry) => (
				<li
					key={entry.id}
					data-testid={`client-activity-row-${entry.id}`}
					className="relative flex flex-col gap-0.5 py-2.5 pl-5 sm:flex-row sm:items-baseline sm:gap-3"
				>
					<span
						aria-hidden="true"
						className={cn(
							"absolute top-4 -left-1 size-2 rounded-full ring-4 ring-app-panel",
							toneOf(entry),
						)}
					/>
					<time
						dateTime={entry.at}
						className="type-mono shrink-0 text-text-subtle tabular-nums sm:w-28"
					>
						{whenLabel(entry.at)}
					</time>
					<span className="type-small min-w-0 flex-1 text-foreground">
						{ACTION_COPY[entry.action]}
						<span
							data-testid={`client-activity-subject-${entry.id}`}
							className="text-text-muted"
						>
							{subjectOf(entry, names)}
						</span>
						<span className="text-text-subtle">
							{" by "}
							<ActorLabel
								actor={entry.actor}
								data-testid={`client-activity-actor-${entry.id}`}
							/>
						</span>
					</span>
					<Link
						to="/activity"
						search={{ entry: entry.id }}
						data-testid={`client-activity-open-${entry.id}`}
						className="py-1.5 -my-1.5 type-caption w-fit rounded-xs text-accent-text underline-offset-4 hover:underline"
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
