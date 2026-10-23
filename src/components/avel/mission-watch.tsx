import {
	EXPORT_STATUSES,
	type ExportStatus,
	type MissionListItem,
} from "avel-server/contract";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ApiError } from "@/lib/api/errors";
import { QUERY_STALE_MS } from "@/lib/api/provider";
import { cn } from "@/lib/utils";
import { DataPanel } from "./data-panel";
import {
	ClientName,
	ExportSince,
	MISSION_ROW,
	MISSION_ROW_SUBJECT,
	MISSION_ROW_TIME,
} from "./mission-columns";
import {
	type MissionList,
	type MissionListParams,
	rowsOf,
	totalOf,
	useMissionList,
} from "./mission-data";
import { MissionRowsSkeleton } from "./mission-panels";
import { ReadAge } from "./read-age";
import { ROW_LINK_GROUP, RowChevron } from "./row-link";
import {
	EXPORT_STATUS_LABEL,
	EXPORT_TARGET_LABEL,
	exportStatusTone,
	StatusPill,
} from "./status-pill";
import { ErrorState, Surface, type SurfaceQuery } from "./surface";

/**
 * How many days without activity make an active mission "quiet". A constant
 * for now; it moves to Settings when Settings exists.
 */
export const QUIET_AFTER_DAYS = 3;

/** Rows a strip shows until it is opened up. */
export const WATCH_ROWS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Where each export status stands for the in-flight strip, keyed on the
 * contract's union so a new status fails the build until it is placed.
 * Moving is the pipeline at work; waiting is a person's turn (previewed, a
 * pull request open). Pending has not started; done, closed and failed are
 * over.
 */
export const EXPORT_PHASE = {
	pending: null,
	rendering: "moving",
	verifying: "moving",
	previewing: "moving",
	delivering: "moving",
	previewed: "waiting",
	"pr-open": "waiting",
	done: null,
	closed: null,
	failed: null,
} as const satisfies Record<ExportStatus, "moving" | "waiting" | null>;

/** The statuses the in-flight strip asks the server for. */
export const IN_FLIGHT_STATUSES: readonly ExportStatus[] =
	EXPORT_STATUSES.filter((status) => EXPORT_PHASE[status] !== null);

/** Whole days since `iso`, or null when there has been no activity at all. */
export function quietDays(iso: string | null, now: number): number | null {
	return iso === null ? null : Math.floor((now - Date.parse(iso)) / DAY_MS);
}

/** "No activity yet", or "No activity for 4 days". */
export function quietText(iso: string | null, now: number): string {
	const days = quietDays(iso, now);
	if (days === null) return "No activity yet";
	return `No activity for ${days} ${days === 1 ? "day" : "days"}`;
}

/**
 * The quietBefore instant: QUIET_AFTER_DAYS ago, rounded down to the hour.
 * The query is keyed on it, so the rounding keeps one key (and one request)
 * for the hour instead of a new one every minute the clock moves.
 */
export function quietBefore(now: number): string {
	const cutoff = now - QUIET_AFTER_DAYS * DAY_MS;
	return new Date(cutoff - (cutoff % HOUR_MS)).toISOString();
}

/** "Showing 5 of 12" when there are more than the strip shows. */
export function coverage(
	shown: number,
	total: number | undefined,
): string | null {
	return total !== undefined && total > shown
		? `Showing ${shown} of ${total}`
		: null;
}

/** A strip row: its badges, and what its time column says. */
type Watched = {
	mission: MissionListItem;
	badges?: React.ReactNode;
	time: React.ReactNode;
};

/**
 * One watch strip: a collapsible panel of up to five rows from its own
 * server-filtered list, with the exact total in its badge. "Show all" opens
 * it up to every loaded row and pages for the rest. Compact, for a narrow
 * column (the Missions dashboard's side), each row takes two lines: the
 * mission, then its badges and time.
 */
function WatchStrip({
	id,
	title,
	tone,
	list,
	rows,
	empty,
	onOpen,
	compact = false,
}: {
	id: "quiet" | "in-flight";
	title: string;
	tone: "warn" | "pending";
	list: MissionList;
	rows: Watched[];
	empty: string;
	onOpen: (mission: MissionListItem) => void;
	compact?: boolean;
}) {
	const [all, setAll] = useState(false);
	const testId = `missions-watch-${id}`;
	const total = totalOf(list);
	const shown = all ? rows : rows.slice(0, WATCH_ROWS);
	const query: SurfaceQuery<Watched[], ApiError> =
		list.status === "success"
			? { status: "success", data: rows }
			: list.status === "error"
				? {
						status: "error",
						error: list.error,
						refetch: list.refetch,
						isFetching: list.isFetching,
					}
				: { status: "pending" };
	const footer = coverage(shown.length, total);
	return (
		<DataPanel
			data-testid={testId}
			title={title}
			tone={tone}
			count={total}
			storageKey={`avel.missions.watch.${id}`}
			// The one panel footer: when the list was read on the left; how
			// many are shown, and the way to the rest, on the right.
			footer={
				list.status === "success" ? (
					<>
						<ReadAge
							data-testid={`${testId}-read-age`}
							readAt={list.dataUpdatedAt}
							staleAfterMs={QUERY_STALE_MS}
							onRefresh={() => list.refetch()}
							refreshing={list.isFetching}
						/>
						{footer ? (
							<span
								data-testid={`${testId}-coverage`}
								className="flex items-center gap-2"
							>
								<span className="type-caption text-text-subtle tabular-nums">
									{footer}
								</span>
								<Button
									variant="ghost"
									size="sm"
									data-testid={`${testId}-more`}
									disabled={all && list.isFetchingNextPage}
									onClick={() => {
										if (!all) setAll(true);
										else list.fetchNextPage();
									}}
								>
									{!all
										? "Show all"
										: list.isFetchingNextPage
											? "Loading"
											: "Load more"}
								</Button>
							</span>
						) : null}
					</>
				) : undefined
			}
		>
			<Surface
				data-testid={`${testId}-list`}
				query={query}
				loading={<MissionRowsSkeleton rows={2} testId={`${testId}-skeleton`} />}
				empty={
					<p
						data-testid={`${testId}-empty`}
						className="px-4 py-3 type-small text-text-subtle"
					>
						{empty}
					</p>
				}
				error={ErrorState}
			>
				{() => (
					<>
						<ul className="flex flex-col divide-y divide-border">
							{shown.map(({ mission, badges, time }) => (
								<li key={mission.id}>
									<button
										type="button"
										data-testid={`${testId}-row-${mission.id}`}
										data-compact={compact || undefined}
										onClick={() => onOpen(mission)}
										className={cn(
											compact
												? "flex min-h-10 w-full min-w-0 items-center gap-3 py-2"
												: MISSION_ROW,
											ROW_LINK_GROUP,
											"px-4 text-left transition-colors duration-(--duration-micro) ease-avel focus-inset hover:bg-app-raised",
										)}
									>
										{compact && !badges ? (
											// Nothing but the client and its time: one line.
											<span className="flex min-w-0 flex-1 items-baseline gap-3">
												<span className="min-w-0 flex-1 truncate type-small text-text">
													<ClientName mission={mission} />
												</span>
												<span
													data-testid={`${testId}-time`}
													className="shrink-0 type-caption text-text-subtle"
												>
													{time}
												</span>
											</span>
										) : compact ? (
											<span className="flex min-w-0 flex-1 flex-col gap-1">
												<span className="truncate type-small text-text">
													<ClientName mission={mission} />
												</span>
												<span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
													{badges}
													<span
														data-testid={`${testId}-time`}
														className="type-caption text-text-subtle"
													>
														{time}
													</span>
												</span>
											</span>
										) : (
											<>
												<span className={MISSION_ROW_SUBJECT}>
													<ClientName mission={mission} />
												</span>
												{badges}
												<span
													data-testid={`${testId}-time`}
													className={MISSION_ROW_TIME}
												>
													{time}
												</span>
											</>
										)}
										<RowChevron />
									</button>
								</li>
							))}
						</ul>
					</>
				)}
			</Surface>
		</DataPanel>
	);
}

/**
 * Active missions with no activity for QUIET_AFTER_DAYS: the stuck mission
 * nobody noticed. The server filters them (quietBefore) and sorts them
 * quietest first, never-active ones first of all (lastActivity, ascending).
 */
export function GoingQuiet({
	params,
	now,
	onOpen,
	compact = false,
}: {
	/** The page's scope; the strip narrows it. */
	params: MissionListParams;
	now: number;
	onOpen: (mission: MissionListItem) => void;
	/** Two-line rows, for a narrow column. */
	compact?: boolean;
}) {
	const list = useMissionList({
		...params,
		status: ["active"],
		quietBefore: quietBefore(now),
		sort: "lastActivity",
		direction: "asc",
	});
	return (
		<WatchStrip
			id="quiet"
			title="Going quiet"
			tone="warn"
			list={list}
			rows={rowsOf(list).map((mission) => ({
				mission,
				time: quietText(mission.lastActivityAt, now),
			}))}
			empty="Nothing has gone quiet."
			onOpen={onOpen}
			compact={compact}
		/>
	);
}

/**
 * Missions whose last export is still moving, or waiting on a person, and
 * for how long: "since" is when the export entered its current status
 * (lastExport.statusChangedAt).
 */
export function InFlight({
	params,
	now,
	onOpen,
	compact = false,
}: {
	params: MissionListParams;
	now: number;
	onOpen: (mission: MissionListItem) => void;
	/** Two-line rows, for a narrow column. */
	compact?: boolean;
}) {
	const list = useMissionList({
		...params,
		lastExportStatus: IN_FLIGHT_STATUSES,
	});
	return (
		<WatchStrip
			id="in-flight"
			title="Deliveries in flight"
			tone="pending"
			list={list}
			rows={rowsOf(list).map((mission) => {
				const last = mission.lastExport;
				if (!last) return { mission, time: null };
				return {
					mission,
					time: (
						<ExportSince at={last.statusChangedAt} now={now} className="" />
					),
					badges: (
						// min-w-0: the badges give way before the row overflows, and the
						// export method ellipsises first (whole on hover).
						<span className="flex min-w-0 items-center gap-2">
							{EXPORT_PHASE[last.status] === "waiting" ? (
								<StatusPill
									size="sm"
									tone="warn"
									label="Waiting on you"
									data-testid="missions-watch-waiting"
								/>
							) : null}
							<StatusPill
								size="sm"
								tone={exportStatusTone(last.status)}
								label={EXPORT_STATUS_LABEL[last.status]}
							/>
							<span
								title={EXPORT_TARGET_LABEL[last.targetKind]}
								className="min-w-0 truncate type-small text-text-muted"
							>
								{EXPORT_TARGET_LABEL[last.targetKind]}
							</span>
						</span>
					),
				};
			})}
			empty="Nothing in flight."
			onOpen={onOpen}
			compact={compact}
		/>
	);
}
