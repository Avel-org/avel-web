import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { activityActorKind, activityEntityType } from "avel-server/contract";
import { z } from "zod";
import { ActivityFilterBar } from "@/components/avel/activity-filters";
import { ActivityLog } from "@/components/avel/activity-log";
import {
	type ActivityFilters,
	activityCountLabel,
	useActivity,
} from "@/lib/api/activity";
import { useNow } from "@/lib/use-now";
import { Page, pageHead } from "../shell/page";

/**
 * The page's filters in the URL, so a filtered log is a link. Each takes the
 * contract's own enum; anything else is dropped rather than sent.
 */
export const activitySearch = z.object({
	entityType: activityEntityType.optional().catch(undefined),
	actorKind: activityActorKind.optional().catch(undefined),
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
	};
	const activity = useActivity(filters);
	const now = useNow();
	const filtered =
		filters.entityType !== undefined || filters.actorKind !== undefined;
	const total = activity.data?.pages[0]?.meta.total;

	const setFilters = (next: ActivityFilters) =>
		navigate({
			// A new filter closes the record: its entry may no longer be listed.
			search: { entityType: next.entityType, actorKind: next.actorKind },
			replace: true,
		});

	return (
		<Page
			to="/activity"
			subtitle={
				total === undefined ? undefined : activityCountLabel(total, filtered)
			}
		>
			<div className="flex flex-1 flex-col gap-4">
				<ActivityFilterBar filters={filters} onChange={setFilters} />
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
			</div>
		</Page>
	);
}
