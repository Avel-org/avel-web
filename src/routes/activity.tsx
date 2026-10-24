import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { activityActorKind, activityEntityType } from "avel-server/contract";
import { X } from "lucide-react";
import { z } from "zod";
import { ActivityFilterBar } from "@/components/avel/activity-filters";
import { ActivityLog } from "@/components/avel/activity-log";
import { DataPanel } from "@/components/avel/data-panel";
import { useMission } from "@/components/avel/mission-data";
import { Paging, PanelFooter } from "@/components/avel/panel-footer";
import { Button } from "@/components/ui/button";
import {
	type ActivityFilters,
	activityCountLabel,
	loadedActivity,
	useActivity,
} from "@/lib/api/activity";
import { useNow } from "@/lib/use-now";
import { missionLabel } from "../shell/command-search";
import { Page, pageHead } from "../shell/page";

/**
 * The page's filters in the URL, so a filtered log is a link. Each takes the
 * contract's own enum; anything else is dropped rather than sent.
 */
export const activitySearch = z.object({
	entityType: activityEntityType.optional().catch(undefined),
	actorKind: activityActorKind.optional().catch(undefined),
	/** One mission's log, from its page's Full log. */
	missionId: z.string().uuid().optional().catch(undefined),
	/** The entry whose decision record is open, so a record is a link. */
	entry: z.string().uuid().optional().catch(undefined),
});

export const Route = createFileRoute("/activity")({
	staticData: { device: "capture" },
	validateSearch: activitySearch,
	head: pageHead("/activity"),
	component: ActivityPage,
});

/**
 * Everything that happened, newest first (contract.activity.list). The top
 * bar counts from meta.total, which follows the filters. Changing a filter
 * changes the query key, so the new list starts from no cursor.
 */
function ActivityPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: "/activity" });
	const filters: ActivityFilters = {
		entityType: search.entityType,
		actorKind: search.actorKind,
		missionId: search.missionId,
	};
	const activity = useActivity(filters);
	const now = useNow();
	const filtered =
		filters.entityType !== undefined ||
		filters.actorKind !== undefined ||
		filters.missionId !== undefined;
	const total = activity.data?.pages[0]?.meta.total;

	const setFilters = (next: ActivityFilters) =>
		navigate({
			// A new filter closes the record: its entry may no longer be listed.
			search: {
				entityType: next.entityType,
				actorKind: next.actorKind,
				missionId: next.missionId,
			},
			replace: true,
		});

	return (
		<Page
			to="/activity"
			subtitle={
				total === undefined ? undefined : activityCountLabel(total, filtered)
			}
		>
			{/* One panel, as every list page: the filters in its toolbar, the
			    paging and read age in its footer band. */}
			<DataPanel
				data-testid="activity-panel"
				title="Activity"
				count={total}
				toolbar={
					<>
						{filters.missionId ? (
							<MissionScope
								missionId={filters.missionId}
								onClear={() => setFilters({ ...filters, missionId: undefined })}
							/>
						) : null}
						<ActivityFilterBar filters={filters} onChange={setFilters} />
					</>
				}
				footer={
					<PanelFooter data-testid="activity-read-age" queries={[activity]}>
						{activity.data ? (
							<Paging
								testIdPrefix="activity"
								loaded={loadedActivity(activity.data).length}
								total={total}
								hasMore={activity.hasNextPage}
								loadingMore={activity.isFetchingNextPage}
								onLoadMore={() => activity.fetchNextPage()}
							/>
						) : null}
					</PanelFooter>
				}
			>
				<ActivityLog
					query={activity}
					filtered={filtered}
					onClearFilters={() => setFilters({})}
					now={now}
					selectedId={search.entry}
					onSelect={(entry) =>
						navigate({ search: (prev) => ({ ...prev, entry }), replace: true })
					}
				/>
			</DataPanel>
		</Page>
	);
}

/** The one mission the log is narrowed to: its name, a link, and clear. */
function MissionScope({
	missionId,
	onClear,
}: {
	missionId: string;
	onClear: () => void;
}) {
	const mission = useMission(missionId);
	return (
		<span
			data-testid="activity-mission-scope"
			className="flex items-center gap-1 rounded-sm border border-border bg-app-raised py-0.5 pr-0.5 pl-2 type-small text-text"
		>
			<Link
				to="/missions/$id"
				params={{ id: missionId }}
				className="underline decoration-border underline-offset-2 hover:decoration-current"
			>
				{mission.data ? missionLabel(mission.data) : "One mission"}
			</Link>
			<Button
				variant="ghost"
				size="icon-xs"
				aria-label="Show every mission's activity"
				data-testid="activity-mission-scope-clear"
				onClick={onClear}
			>
				<X aria-hidden="true" />
			</Button>
		</span>
	);
}
