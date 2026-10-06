import { getRouteApi } from "@tanstack/react-router";
import type { MissionListItem, MissionStatus } from "avel-server/contract";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataPanel, type DataPanelTone } from "./data-panel";
import { DataTable } from "./data-table";
import { MissionCard, missionColumns, needsYouColumn } from "./mission-columns";
import {
	asSurface,
	type MissionList,
	type MissionListParams,
	rowsOf,
	totalOf,
	useMissionList,
} from "./mission-data";
import type { MissionCounts } from "./mission-filters";
import {
	NEEDS_YOU,
	STATUS_PANEL,
	showsNeedsYou,
	visibleStatuses,
} from "./mission-search";
import { ErrorState, Surface } from "./surface";

const route = getRouteApi("/missions");

/** A panel on the Missions page: one status, or the needs-you lens. */
export type PanelId = "needs-you" | MissionStatus;

/**
 * Where a panel remembers being open or closed, per viewer. Every viewer
 * preference shares the `avel.` namespace, beside avel.theme and avel.sidebar.
 */
export function panelStorageKey(panel: PanelId): string {
	return `avel.missions.panel.${panel}`;
}

/** A content-shaped placeholder: mission rows, at the real row height. */
export function MissionRowsSkeleton({
	rows,
	testId,
}: {
	rows: number;
	testId: string;
}) {
	return (
		<div data-testid={testId} className="flex flex-col divide-y divide-border">
			{Array.from({ length: rows }, (_, i) => (
				// Placeholders in a fixed order: the index is their identity.
				// biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
				<div key={i} className="flex h-10 items-center gap-4 px-4">
					<Skeleton className="h-3 w-16" />
					<Skeleton className="h-3 w-40" />
					<Skeleton className="h-3 w-24" />
					<Skeleton className="ml-auto h-3 w-20" />
				</div>
			))}
		</div>
	);
}

/**
 * The next page, when there is one, with how many rows are shown of how many
 * the list's own filters keep (meta.total: exact, the same on every page).
 */
export function LoadMore({
	list,
	testId,
}: {
	list: MissionList;
	testId: string;
}) {
	if (!list.hasNextPage) return null;
	return (
		<div
			data-testid={testId}
			className="flex items-center justify-between gap-2 border-t border-border px-4 py-2"
		>
			<span className="type-caption text-text-subtle tabular-nums">
				{`Showing ${rowsOf(list).length} of ${totalOf(list) ?? "—"}`}
			</span>
			<Button
				variant="ghost"
				size="sm"
				data-testid={`${testId}-button`}
				disabled={list.isFetchingNextPage}
				onClick={() => list.fetchNextPage()}
			>
				{list.isFetchingNextPage ? "Loading" : "Load more"}
			</Button>
		</div>
	);
}

/**
 * Missions grouped by where they stand: Needs you first (the server derives
 * it from the last export, so it cuts across statuses), then one panel per
 * status in the order an operator acts on them. Each panel pages its own
 * query; its badge is the status's count from meta.counts. A status filter
 * shows only its panel.
 */
export function MissionPanels({
	params,
	counts,
	now,
	onOpen,
}: {
	/** The page's filters, without a status: each panel adds its own. */
	params: MissionListParams;
	counts?: MissionCounts;
	now: number;
	onOpen: (mission: MissionListItem) => void;
}) {
	const search = route.useSearch();
	return (
		<div data-testid="missions-panels" className="flex flex-col gap-4">
			{showsNeedsYou(search.status) ? (
				<MissionPanel
					panel="needs-you"
					title={NEEDS_YOU.label}
					tone={NEEDS_YOU.tone}
					defaultOpen={NEEDS_YOU.defaultOpen}
					params={{ ...params, needsYou: true }}
					count={counts?.needsYou}
					empty="Nothing needs you right now."
					now={now}
					onOpen={onOpen}
				/>
			) : null}
			{visibleStatuses(search).map((status) => (
				<MissionPanel
					key={status}
					panel={status}
					title={STATUS_PANEL[status].label}
					tone={STATUS_PANEL[status].tone}
					defaultOpen={STATUS_PANEL[status].defaultOpen}
					params={{ ...params, status: [status] }}
					count={counts?.byStatus[status]}
					empty={`No ${STATUS_PANEL[status].label.toLowerCase()} missions.`}
					now={now}
					onOpen={onOpen}
				/>
			))}
		</div>
	);
}

function MissionPanel({
	panel,
	title,
	tone,
	defaultOpen,
	params,
	count,
	empty,
	now,
	onOpen,
}: {
	panel: PanelId;
	title: string;
	tone: DataPanelTone;
	defaultOpen: boolean;
	params: MissionListParams;
	count?: number;
	empty: string;
	now: number;
	onOpen: (mission: MissionListItem) => void;
}) {
	const list = useMissionList(params);
	const testId = `missions-panel-${panel}`;
	// A status panel needs no status column: the panel says it. The needs-you
	// lens keeps it, and adds why.
	const columns = useMemo(() => {
		const all = missionColumns(now);
		return panel === "needs-you"
			? [...all, needsYouColumn()]
			: all.filter((column) => column.id !== "status");
	}, [now, panel]);

	return (
		<DataPanel
			data-testid={testId}
			title={title}
			tone={tone}
			count={count}
			defaultOpen={defaultOpen}
			storageKey={panelStorageKey(panel)}
		>
			<Surface
				data-testid={`${testId}-list`}
				query={asSurface(list)}
				loading={<MissionRowsSkeleton rows={3} testId={`${testId}-skeleton`} />}
				empty={
					<p
						data-testid={`${testId}-empty`}
						className="px-4 py-6 text-center type-small text-text-subtle"
					>
						{empty}
					</p>
				}
				error={ErrorState}
			>
				{(rows) => (
					<>
						<DataTable
							data-testid={`${testId}-table`}
							label={`${title} missions`}
							columns={columns}
							rows={rows}
							getRowId={(mission) => mission.id}
							density="compact"
							onRowClick={onOpen}
							renderCard={(mission) => (
								<MissionCard mission={mission} now={now} />
							)}
						/>
						<LoadMore list={list} testId={`${testId}-more`} />
					</>
				)}
			</Surface>
		</DataPanel>
	);
}
