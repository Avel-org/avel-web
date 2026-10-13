import { Link } from "@tanstack/react-router";
import type { MissionListItem, MissionStatus } from "avel-server/contract";
import { Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { useClientMissions } from "@/lib/api/clients";
import { EmptyState } from "./empty-state";
import { MISSION_STATUS_TONE } from "./mission-columns";
import { STATUS_ORDER, STATUS_PANEL } from "./mission-search";
import { StatusGlyph, StatusPill } from "./status-pill";
import { ErrorState, Surface } from "./surface";

/*
 * A client's missions, on its Overview (ruling 45, amended): one
 * missions.list read narrowed by clientId, most recent activity first. The
 * status strip is that read's meta.counts.byStatus and the banner's number
 * is its meta.total, so the page reads the list once for all three.
 */

type MissionsQuery = ReturnType<typeof useClientMissions>;
type MissionsPage = NonNullable<MissionsQuery["data"]>["pages"][number];
type StatusCounts = MissionsPage["meta"]["counts"]["byStatus"];

/** Every mission loaded so far, across the pages fetched. */
function loadedMissions(query: MissionsQuery): MissionListItem[] {
	return query.data?.pages.flatMap((page) => page.data) ?? [];
}

export function ClientMissions({
	query,
	clientName,
}: {
	query: MissionsQuery;
	clientName: string;
}) {
	return (
		<Surface
			data-testid="client-missions"
			query={query}
			isEmpty={(data) => data.pages.every((page) => page.data.length === 0)}
			loading={<ClientMissionsSkeleton />}
			empty={
				<EmptyState
					data-testid="client-missions-empty"
					compact
					icon={Rocket}
					title="No missions yet"
					description={`No mission has run under ${clientName}'s engagements.`}
				/>
			}
			error={ErrorState}
		>
			{(data) => {
				const first = data.pages[0];
				const missions = loadedMissions(query);
				return (
					<div className="flex flex-col gap-3">
						{first ? (
							<MissionStatusCounts counts={first.meta.counts.byStatus} />
						) : null}
						<ul
							aria-label={`${clientName}'s missions`}
							data-testid="client-missions-list"
							className="flex flex-col"
						>
							{missions.map((mission) => (
								<MissionRow key={mission.id} mission={mission} />
							))}
						</ul>
						{query.hasNextPage ? (
							<div className="flex items-center justify-between gap-2">
								<p
									data-testid="client-missions-showing"
									className="type-caption text-text-subtle tabular-nums"
								>
									{`Showing ${missions.length} of ${first?.meta.total ?? missions.length}`}
								</p>
								<Button
									variant="ghost"
									size="sm"
									data-testid="client-missions-load-more"
									disabled={query.isFetchingNextPage}
									onClick={() => query.fetchNextPage()}
								>
									{query.isFetchingNextPage ? "Loading" : "Load more"}
								</Button>
							</div>
						) : null}
					</div>
				);
			}}
		</Surface>
	);
}

/**
 * How many of the client's missions are in each status, from meta.counts.
 * Archived missions are hidden from the list, so Archived shows only when
 * the server counts some. Counts, not filters: the Missions page has no
 * client filter to send them to.
 */
function MissionStatusCounts({ counts }: { counts: StatusCounts }) {
	const shown = STATUS_ORDER.filter(
		(status: MissionStatus) => status !== "archived" || counts.archived > 0,
	);
	return (
		<ul
			aria-label="Missions by status"
			data-testid="client-missions-strip"
			className="flex flex-wrap gap-1.5"
		>
			{shown.map((status) => (
				<li
					key={status}
					data-testid={`client-missions-strip-${status}`}
					data-count={counts[status]}
					className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border px-2.5 type-caption text-text-muted"
				>
					<StatusGlyph tone={MISSION_STATUS_TONE[status]} />
					{STATUS_PANEL[status].label}
					<span className="type-mono-small text-text-subtle tabular-nums">
						{counts[status]}
					</span>
				</li>
			))}
		</ul>
	);
}

/** One mission: its type, sprint and status, as a link to its page. */
function MissionRow({ mission }: { mission: MissionListItem }) {
	return (
		<li className="border-b border-border last:border-b-0">
			<Link
				to="/missions/$id"
				params={{ id: mission.id }}
				data-testid={`client-mission-${mission.id}`}
				className="flex min-w-0 items-center gap-3 rounded-xs px-1 py-2.5 transition-colors duration-(--duration-micro) ease-avel hover:bg-state-hover"
			>
				<span className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span
						data-testid={`client-mission-type-${mission.id}`}
						className="type-small truncate font-medium text-foreground"
					>
						{mission.type}
					</span>
					<span className="type-caption truncate text-text-subtle">
						{`Sprint ${mission.sprintN}`}
						{mission.engagement ? ` · ${mission.engagement.name}` : ""}
					</span>
				</span>
				<StatusPill
					size="sm"
					tone={MISSION_STATUS_TONE[mission.status]}
					label={STATUS_PANEL[mission.status].label}
					data-testid={`client-mission-status-${mission.id}`}
				/>
			</Link>
		</li>
	);
}

function ClientMissionsSkeleton() {
	return (
		<div data-testid="client-missions-skeleton" className="flex flex-col gap-3">
			<div className="flex gap-1.5">
				<Skeleton className="h-7 w-20 rounded-full" />
				<Skeleton className="h-7 w-20 rounded-full" />
				<Skeleton className="h-7 w-16 rounded-full" />
			</div>
			<Skeleton className="h-10 w-full" />
			<Skeleton className="h-10 w-full" />
		</div>
	);
}
