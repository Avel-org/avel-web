import {
	EXPORT_STATUSES,
	type ExportStatus,
	type MissionListItem,
} from "avel-server/contract";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/api/clients";
import type { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { DataPanel } from "./data-panel";
import {
	ClientName,
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
import { exportStatusTone, StatusPill } from "./status-pill";
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
 * it up to every loaded row and pages for the rest.
 */
function WatchStrip({
	id,
	title,
	tone,
	list,
	rows,
	empty,
	onOpen,
}: {
	id: "quiet" | "in-flight";
	title: string;
	tone: "warn" | "pending";
	list: MissionList;
	rows: Watched[];
	empty: string;
	onOpen: (mission: MissionListItem) => void;
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
										onClick={() => onOpen(mission)}
										className={cn(
											MISSION_ROW,
											"px-4 text-left transition-colors duration-(--duration-micro) ease-avel focus-inset hover:bg-state-hover",
										)}
									>
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
									</button>
								</li>
							))}
						</ul>
						{footer ? (
							<div
								data-testid={`${testId}-coverage`}
								className="flex items-center justify-between gap-2 border-t border-border px-4 py-2"
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
							</div>
						) : null}
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
}: {
	/** The page's scope; the strip narrows it. */
	params: MissionListParams;
	now: number;
	onOpen: (mission: MissionListItem) => void;
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
}: {
	params: MissionListParams;
	now: number;
	onOpen: (mission: MissionListItem) => void;
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
					time: `since ${relativeTime(last.statusChangedAt, now)}`,
					badges: (
						<span className="flex shrink-0 items-center gap-2">
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
								label={last.status}
							/>
							<span className="type-mono-small text-text-subtle">
								{last.targetKind}
							</span>
						</span>
					),
				};
			})}
			empty="Nothing in flight."
			onOpen={onOpen}
		/>
	);
}
