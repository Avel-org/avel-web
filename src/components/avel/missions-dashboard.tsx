import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type {
	Dispatch,
	MissionListItem,
	MissionStatus,
	needsYouReason,
} from "avel-server/contract";
import { ChevronRight } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiClient } from "@/lib/api";
import { activityQuery, loadedActivity } from "@/lib/api/activity";
import { relativeTime } from "@/lib/api/clients";
import { DISPATCH_POLL_MS, useLiveDispatches } from "@/lib/api/dispatches";
import { QUERY_STALE_MS } from "@/lib/api/provider";
import { cn } from "@/lib/utils";
import { missionLabel } from "@/shell/command-search";
import { ActivityRows } from "./activity-log";
import { ActorMark } from "./actor";
import { DataPanel } from "./data-panel";
import {
	formatTokens,
	formatUsd,
	minutesRun,
	multipleOf,
	tokenTrack,
} from "./dispatch-budget";
import { DISPATCH_STATUS_LABEL, DISPATCH_STATUS_TONE } from "./dispatch-labels";
import { MISSION_STATUS_TONE } from "./mission-columns";
import {
	MISSIONS_PAGE_SIZE,
	type MissionListParams,
	missionListQuery,
	type NewestParams,
	newestMissionQuery,
	rowsOf,
	totalOf,
	useMissionList,
} from "./mission-data";
import type { MissionCounts } from "./mission-filters";
import { STATUS_PANEL, type StatusFilter } from "./mission-search";
import { GoingQuiet, InFlight } from "./mission-watch";
import { ReadAge } from "./read-age";
import {
	StatusGlyph,
	StatusPill,
	type StatusTone,
	TONE_TEXT,
} from "./status-pill";
import { ErrorState, Surface, type SurfaceQuery } from "./surface";

/*
 * The top of the Missions page (MISSIONS-DASHBOARD.md): what needs the
 * operator, what is moving right now, what is going quiet, and what just
 * happened, above the full list. Every number is the server's: list counts
 * from meta.counts, dispatches from each active mission's dispatch list.
 * Nothing is pushed: the board re-reads every DISPATCH_POLL_MS only while a
 * dispatch is queued or running, says so while it does, and says "Final"
 * after (audit F1). It never says "Live".
 */

type NeedsYouReason = z.infer<typeof needsYouReason>;

/** What a needs-you row asks of the operator. Keyed on the contract's union. */
export const NEEDS_YOU_DETAIL = {
	export_previewed: "Export previewed: read it, then deliver or close",
	pr_open: "Pull request open",
} as const satisfies Record<NeedsYouReason, string>;

/** The needs-you card's sub-line words, one and many. */
const NEEDS_YOU_COUNT = {
	export_previewed: ["preview to read", "previews to read"],
	pr_open: ["PR open", "PRs open"],
} as const satisfies Record<NeedsYouReason, readonly [string, string]>;

/** How many rows the Needs you column shows before "All N". */
export const NEEDS_YOU_ROWS = 5;

/** A card: a status, or the needs-you lens. */
type CardId = Exclude<StatusFilter, "all">;

/**
 * The status a card press sets: its own, as the old status chip did, or
 * every status again when it was already the one pressed.
 */
export function nextStatus(card: CardId, current: StatusFilter): StatusFilter {
	return current === card ? "all" : card;
}

export function MissionsDashboard({
	base,
	counts,
	status,
	includeArchived,
	now,
	onStatus,
	onOpen,
	missions,
}: {
	/** The page's scope (origin, search, sort, archived): every region narrows it. */
	base: MissionListParams;
	counts?: MissionCounts;
	/** The URL's status filter: the pressed card, or "all". */
	status: StatusFilter;
	includeArchived: boolean;
	now: number;
	onStatus: (status: StatusFilter) => void;
	/** Opens a mission in the details drawer (Going quiet, Deliveries in flight). */
	onOpen: (mission: MissionListItem) => void;
	/** The Missions panel: the full list, in the grid's wide column. */
	missions: ReactNode;
}) {
	const api = useApiClient();
	// While a dispatch moves, the active list re-reads with it, so a mission
	// the runner halts leaves the board, and the activity log does too, so
	// the halt appears. The flag is the live view's, one render behind.
	const [polling, setPolling] = useState(false);
	const activeParams: MissionListParams = { ...base, status: ["active"] };
	const active = useInfiniteQuery({
		...missionListQuery(api, activeParams),
		refetchInterval: polling ? DISPATCH_POLL_MS : false,
	});
	const activeMissions = rowsOf(active);
	const live = useLiveDispatches(activeMissions.map((m) => m.id));
	useEffect(() => setPolling(live.polling), [live.polling]);

	const needsYou = useMissionList({ ...base, needsYou: true });

	// One grid of panels, 16px apart both ways and nothing else between
	// them. Desktop: the cards across, then two columns that stack on their
	// own (no shared row heights, so no hole under a short panel): Running
	// now over the Missions panel (8), and Needs you over Going quiet,
	// Deliveries in flight and Recent activity (4). On a phone the columns
	// dissolve (contents) and `order` sets the answer order: running, needs
	// you, the list, then what goes quiet, in flight and recent.
	return (
		<div
			data-testid="missions-dashboard"
			className="flex min-w-0 flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start"
		>
			<div className="min-w-0 lg:col-span-12">
				<StatusCards
					base={base}
					counts={counts}
					status={status}
					includeArchived={includeArchived}
					needsYou={rowsOf(needsYou)}
					needsYouStatus={needsYou.status}
					activeStatus={active.status}
					live={live}
					now={now}
					onStatus={onStatus}
				/>
			</div>
			<div
				data-testid="missions-dashboard-main"
				className="max-lg:contents lg:col-span-8 lg:flex lg:min-w-0 lg:flex-col lg:gap-4"
			>
				<div className="order-1 min-w-0">
					<RunningNow
						active={active}
						missions={activeMissions}
						live={live}
						now={now}
					/>
				</div>
				<div data-testid="missions-dashboard-list" className="order-3 min-w-0">
					{missions}
				</div>
			</div>
			<div
				data-testid="missions-dashboard-side"
				className="max-lg:contents lg:col-span-4 lg:flex lg:min-w-0 lg:flex-col lg:gap-4"
			>
				<div className="order-2 min-w-0">
					<NeedsYouColumn
						list={needsYou}
						total={counts?.needsYou}
						now={now}
						onAll={() => onStatus("needs-you")}
					/>
				</div>
				<div className="order-4 min-w-0">
					<GoingQuiet params={base} now={now} onOpen={onOpen} compact />
				</div>
				<div className="order-5 min-w-0">
					<InFlight params={base} now={now} onOpen={onOpen} compact />
				</div>
				<div className="order-6 min-w-0">
					<RecentActivity polling={polling} now={now} />
				</div>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// 1. Status cards

type LiveView = ReturnType<typeof useLiveDispatches>;

/** "2 previews to read, 1 PR open", over the needs-you rows read. */
export function needsYouSubline(rows: readonly MissionListItem[]): string {
	const by = new Map<NeedsYouReason, number>();
	for (const row of rows) {
		if (row.needsYou)
			by.set(row.needsYou.reason, (by.get(row.needsYou.reason) ?? 0) + 1);
	}
	const parts = (Object.keys(NEEDS_YOU_COUNT) as NeedsYouReason[])
		.filter((reason) => (by.get(reason) ?? 0) > 0)
		.map((reason) => {
			const n = by.get(reason) ?? 0;
			return `${n} ${NEEDS_YOU_COUNT[reason][n === 1 ? 0 : 1]}`;
		});
	return parts.length ? parts.join(", ") : "Nothing waiting on you";
}

/**
 * The Needs you card's line, from its own read (review 3): null while it
 * reads (the card draws a skeleton), "Couldn't load these" when it failed,
 * else the reasons, with "+N more" when the count is past the rows read.
 * Never "Nothing waiting on you" under a count above zero.
 */
export function needsYouLine(
	status: "pending" | "error" | "success",
	rows: readonly MissionListItem[],
	count: number | undefined,
): string | null {
	if (status === "error") return "Couldn't load these";
	if (status === "pending") return null;
	const more = count === undefined ? 0 : count - rows.length;
	if (rows.length === 0) {
		return more > 0 ? `${more} waiting on you` : needsYouSubline(rows);
	}
	const line = needsYouSubline(rows);
	return more > 0 ? `${line}, +${more} more` : line;
}

/**
 * What the live view holds, zero parts left out: "1 dispatch running",
 * "1 queued", "2 running, 1 queued", or "Nothing running".
 */
export function activeSubline(moving: readonly Dispatch[]): string {
	const running = moving.filter((d) => d.status === "running").length;
	const queued = moving.length - running;
	if (running === 0 && queued === 0) return "Nothing running";
	if (queued === 0)
		return `${running} ${running === 1 ? "dispatch" : "dispatches"} running`;
	if (running === 0) return `${queued} queued`;
	return `${running} running, ${queued} queued`;
}

/**
 * A mission as a row's first line: its type and sprint, the part that tells
 * one client's missions apart. The client goes on a quieter line below.
 */
export function missionShortLabel(
	mission: Pick<MissionListItem, "type" | "sprintN">,
): string {
	return `${mission.type}, sprint ${mission.sprintN}`;
}

/**
 * The newest mission of a status by its last activity, as a card's two
 * lines: "template-booking, sprint 2", then "3 hours ago". `full` is the
 * whole label, client included, for the card's hover.
 */
export function newestOf(
	rows: readonly MissionListItem[],
	now: number,
): { label: string; age: string; full: string } | null {
	const newest = [...rows]
		.filter((m) => m.lastActivityAt !== null)
		.sort((a, b) =>
			(b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""),
		)[0];
	if (!newest?.lastActivityAt) return null;
	return {
		label: missionShortLabel(newest),
		age: relativeTime(newest.lastActivityAt, now),
		full: missionLabel(newest),
	};
}

const NEWEST_STATUSES = [
	"draft",
	"halted",
	"shipped",
	"archived",
] as const satisfies readonly MissionStatus[];

function StatusCards({
	base,
	counts,
	status,
	includeArchived,
	needsYou,
	needsYouStatus,
	activeStatus,
	live,
	now,
	onStatus,
}: {
	base: MissionListParams;
	counts?: MissionCounts;
	status: StatusFilter;
	includeArchived: boolean;
	needsYou: MissionListItem[];
	/** The needs-you list's own read: the card's line waits on it. */
	needsYouStatus: "pending" | "error" | "success";
	/** The active list's own read: the card's line waits on it first. */
	activeStatus: "pending" | "error" | "success";
	live: LiveView;
	now: number;
	onStatus: (status: StatusFilter) => void;
}) {
	// The fade says there is more to the right, so it lifts at the end.
	const [atEnd, setAtEnd] = useState(false);
	const cards: {
		id: CardId;
		label: string;
		tone: StatusTone;
		count?: number;
		subline: React.ReactNode;
		/** Beside the label, at the row's end: the newest mission's age. */
		aside?: React.ReactNode;
	}[] = [
		{
			id: "needs-you",
			label: "Needs you",
			tone: "warn",
			count: counts?.needsYou,
			subline: needsYouLine(needsYouStatus, needsYou, counts?.needsYou) ?? (
				<Skeleton
					data-testid="missions-card-needs-you-pending"
					className="h-3 w-28"
				/>
			),
		},
		{
			id: "active",
			label: STATUS_PANEL.active.label,
			// In motion: the pending tone, never the accent (audit D3).
			tone: MISSION_STATUS_TONE.active,
			count: counts?.byStatus.active,
			// The active list first: with no list there are no dispatches to
			// read, and an empty live view is not "Nothing running".
			subline:
				activeStatus === "error" ? (
					"Can't read the active missions"
				) : activeStatus === "pending" ? (
					<Skeleton
						data-testid="missions-card-active-pending"
						className="h-3 w-24"
					/>
				) : live.status === "error" ? (
					"Dispatches could not be read"
				) : live.status === "pending" ? (
					<Skeleton
						data-testid="missions-card-active-pending"
						className="h-3 w-24"
					/>
				) : (
					activeSubline(live.moving)
				),
		},
		...NEWEST_STATUSES.filter((s) => s !== "archived" || includeArchived).map(
			(s) => ({
				id: s,
				label: STATUS_PANEL[s].label,
				tone: MISSION_STATUS_TONE[s],
				count: counts?.byStatus[s],
				subline: (
					<NewestLine params={newestParams(base, s)} now={now} part="label" />
				),
				aside: (
					<NewestLine params={newestParams(base, s)} now={now} part="age" />
				),
			}),
		),
	];

	return (
		<fieldset
			data-testid="missions-status-cards"
			// min-w-0: a fieldset is min-content wide by default. Below lg,
			// Needs you spans two columns so the other four pair up evenly
			// (2 by 2 on a phone, 3 by 2 on a tablet). Six cards never pair
			// evenly, so with Archived the row scrolls sideways under a fade
			// that says there is more, until the row is scrolled to its end.
			onScroll={(e) => {
				const el = e.currentTarget;
				setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
			}}
			className={cn(
				"min-w-0 gap-3",
				includeArchived
					? cn(
							"no-scrollbar -mx-4 flex overflow-x-auto px-4 lg:mx-0 lg:grid lg:grid-cols-6 lg:overflow-visible lg:px-0 lg:[mask-image:none]",
							!atEnd &&
								"[mask-image:linear-gradient(to_right,var(--color-text)_88%,transparent)]",
						)
					: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
			)}
		>
			<legend className="sr-only">Filter by status</legend>
			{cards.map((card) => {
				const pressed = status === card.id;
				return (
					<button
						key={card.id}
						type="button"
						aria-pressed={pressed}
						data-testid={`missions-card-${card.id}`}
						// A changed count is a new number, keyed, and fades in.
						data-enter="fade"
						onClick={() => onStatus(nextStatus(card.id, status))}
						// v3 .option: a card that answers the pointer with the strong
						// edge, and takes the one selected state when pressed (R10).
						className={cn(
							"flex min-w-0 flex-col gap-1 rounded-card border border-border bg-app-panel px-3.5 py-3 text-left shadow-card transition-[background-color,border-color] duration-(--duration-micro) ease-avel hover:border-border-strong active:scale-[0.995] aria-pressed:border-selected-border aria-pressed:bg-selected",
							includeArchived
								? "w-40 shrink-0 lg:w-auto"
								: card.id === "needs-you" && "max-lg:col-span-2",
						)}
					>
						<span className="flex min-w-0 items-center gap-1.5">
							<span className="flex items-center gap-1.5 type-eyebrow">
								<StatusGlyph
									tone={card.tone}
									className={TONE_TEXT[card.tone]}
								/>
								{card.label}
							</span>
							{card.aside ? (
								<span
									data-testid={`missions-card-${card.id}-age`}
									className="ml-auto truncate type-caption text-text-subtle"
								>
									{card.aside}
								</span>
							) : null}
						</span>
						<span
							key={card.count ?? "unknown"}
							data-testid={`missions-card-${card.id}-count`}
							className="type-metric text-text"
						>
							{card.count === undefined ? (
								<>
									<span aria-hidden="true">—</span>
									<span className="sr-only">count not available</span>
								</>
							) : (
								card.count
							)}
						</span>
						{/* One line on every card: a sentence, or the newest
						    mission's label (its age sits beside the status). */}
						<span
							data-testid={`missions-card-${card.id}-subline`}
							className="flex min-h-4 min-w-0 flex-col type-caption"
						>
							{card.subline}
						</span>
					</button>
				);
			})}
		</fieldset>
	);
}

/**
 * One status's newest mission by last activity: a one-row read sorted by
 * lastActivity, newest first (limit 1), so the page's own sort never picks
 * it and no card reads a full page for one line.
 */
function NewestLine({
	params,
	now,
	part,
}: {
	params: NewestParams;
	now: number;
	/** The mission's label (the sub-line) or its age (beside the status). */
	part: "label" | "age";
}) {
	const newestRead = useQuery(newestMissionQuery(useApiClient(), params));
	if (newestRead.status !== "success") return null;
	const newest = newestOf(newestRead.data ? [newestRead.data] : [], now);
	if (!newest) return part === "label" ? <span>None yet</span> : null;
	return part === "age" ? (
		newest.age
	) : (
		<span className="truncate" title={newest.full}>
			{newest.label}
		</span>
	);
}

/** One status's newest-mission read: the page's filters, not its sort. */
const newestParams = (base: MissionListParams, status: MissionStatus) => ({
	origin: base.origin,
	q: base.q,
	includeArchived: base.includeArchived,
	status: [status],
});

// ---------------------------------------------------------------------------
// 2. Running now

function RunningNow({
	active,
	missions,
	live,
	now,
}: {
	active: ReturnType<typeof useMissionList>;
	missions: MissionListItem[];
	live: LiveView;
	now: number;
}) {
	const byId = new Map(missions.map((m) => [m.id, m]));
	const total = totalOf(active);
	// The active list's state first: no ids, no dispatches to read.
	const query: SurfaceQuery<Dispatch[], unknown> =
		active.status === "error"
			? {
					status: "error",
					error: active.error,
					refetch: active.refetch,
					isFetching: active.isFetching,
				}
			: active.status === "pending" || live.status === "pending"
				? { status: "pending" }
				: live.status === "error"
					? {
							status: "error",
							error: undefined,
							refetch: live.refetch,
							isFetching: live.isFetching,
						}
					: { status: "success", data: live.moving };
	const capped = total !== undefined && total > MISSIONS_PAGE_SIZE;
	return (
		<DataPanel
			data-testid="missions-running"
			title="Running now"
			tone="pending"
			count={
				active.status === "success" && live.status === "success"
					? live.moving.length
					: undefined
			}
			footer={
				live.status === "success" && live.readAt > 0 ? (
					<>
						<ReadAge
							data-testid="missions-running-read-age"
							readAt={live.readAt}
							staleAfterMs={QUERY_STALE_MS}
							onRefresh={live.refetch}
							refreshing={live.isFetching}
							polling={live.polling ? "polling" : "final"}
						/>
						{capped ? (
							<p
								data-testid="missions-running-capped"
								className="type-caption text-text-subtle"
							>
								{`Showing the first ${MISSIONS_PAGE_SIZE} active missions`}
							</p>
						) : null}
					</>
				) : undefined
			}
		>
			<Surface
				data-testid="missions-running-list"
				query={query}
				loading={<BoardSkeleton />}
				empty={
					<p
						data-testid="missions-running-empty"
						className="px-4 py-3 type-small text-text-subtle"
					>
						Nothing is running. Queue a dispatch from an active mission.
					</p>
				}
				error={({ retry, retrying, error }) =>
					error === undefined ? (
						<div className="flex items-center gap-2 px-4 py-3 type-small text-text-muted">
							Dispatches could not be read.
							<Button
								variant="link"
								size="sm"
								onClick={retry}
								disabled={retrying}
							>
								{retrying ? "Retrying" : "Retry"}
							</Button>
						</div>
					) : (
						<ErrorState
							error={error as never}
							retry={retry}
							retrying={retrying}
						/>
					)
				}
			>
				{(moving) => (
					// No intrinsic width: long labels ellipsise inside the panel
					// instead of widening it.
					<ul className="flex flex-col divide-y divide-border [contain:inline-size]">
						{moving.map((dispatch) => (
							<RunningRow
								key={dispatch.id}
								dispatch={dispatch}
								mission={byId.get(dispatch.missionId)}
								now={now}
							/>
						))}
					</ul>
				)}
			</Surface>
		</DataPanel>
	);
}

/** One queued or running dispatch: who, on what, how far into its limits. */
function RunningRow({
	dispatch,
	mission,
	now,
}: {
	dispatch: Dispatch;
	mission?: MissionListItem;
	now: number;
}) {
	const minutes = minutesRun(dispatch, now);
	return (
		<li
			data-testid={`missions-running-row-${dispatch.id}`}
			data-status={dispatch.status}
			className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-2 md:grid-cols-[auto_minmax(0,1fr)_auto_12rem]"
		>
			<ActorMark kind="agent" name={dispatch.agent.name} className="size-6" />
			<span className="flex min-w-0 flex-col">
				{/* The agent and its title on one line; the mission under it. */}
				<span className="flex min-w-0 items-baseline gap-1.5">
					<span className="shrink-0 type-small font-medium text-text">
						{dispatch.agent.name}
					</span>
					{dispatch.agent.title ? (
						<span
							className="min-w-0 truncate type-caption text-text-subtle"
							title={dispatch.agent.title}
						>
							{dispatch.agent.title}
						</span>
					) : null}
				</span>
				{mission ? (
					<span className="flex min-w-0 items-baseline gap-1 type-caption">
						<Link
							to="/missions/$id"
							params={{ id: mission.id }}
							data-testid={`missions-running-mission-${dispatch.id}`}
							title={missionLabel(mission)}
							className="inline-block max-w-full shrink-0 truncate py-0.5 text-text-muted underline decoration-border underline-offset-2 hover:text-text hover:decoration-current"
						>
							{missionShortLabel(mission)}
						</Link>
						{mission.client ? (
							<span className="min-w-0 truncate text-text-subtle">
								{mission.client.name}
							</span>
						) : null}
					</span>
				) : null}
			</span>
			{/* Queued and running are both in motion: the pending tone, a
			    hollow glyph, never the accent (audit D3). */}
			<StatusPill
				size="sm"
				tone={DISPATCH_STATUS_TONE[dispatch.status]}
				label={DISPATCH_STATUS_LABEL[dispatch.status]}
				data-testid={`missions-running-status-${dispatch.id}`}
			/>
			<div className="col-span-3 flex min-w-0 flex-col gap-1 md:col-span-1">
				<CompactBudget dispatch={dispatch} />
				<span className="flex items-baseline justify-between gap-2 type-caption">
					<span
						data-testid={`missions-running-spend-${dispatch.id}`}
						className="type-mono text-text-muted"
					>
						{formatUsd(dispatch.spendUsd)}
					</span>
					<span
						data-testid={`missions-running-clock-${dispatch.id}`}
						className="type-mono text-text-subtle"
					>
						{minutes === null
							? `${dispatch.wallClockMinutes} min limit`
							: `${minutes} of ${dispatch.wallClockMinutes} min`}
					</span>
				</span>
			</div>
		</li>
	);
}

/**
 * dispatch-budget's track model (tokenTrack), drawn small: the track ends at
 * the hard ceiling, where the runner halts; marks at the estimate and the
 * soft ceiling; the fill neutral, warn once the soft ceiling is crossed
 * (audit D4).
 */
export function CompactBudget({ dispatch }: { dispatch: Dispatch }) {
	const track = tokenTrack(dispatch);
	const soft = multipleOf(dispatch.tokenSoftCeiling, dispatch.estimatedTokens);
	return (
		<div
			className="relative h-1.5"
			data-testid={`missions-running-budget-${dispatch.id}`}
			title={`${formatTokens(dispatch.tokensUsed)} of ${formatTokens(dispatch.tokenHardCeiling)} tokens; estimate ${formatTokens(dispatch.estimatedTokens)}${soft ? `, soft ceiling ${soft}` : ""}`}
		>
			<meter
				className="sr-only"
				aria-label={`Tokens used against the hard limit of ${formatTokens(dispatch.tokenHardCeiling)}`}
				min={0}
				max={track.max}
				high={dispatch.tokenSoftCeiling}
				optimum={0}
				value={dispatch.tokensUsed}
			/>
			<div
				aria-hidden="true"
				className="absolute inset-0 overflow-hidden rounded-full bg-border"
			>
				<div
					data-testid={`missions-running-fill-${dispatch.id}`}
					data-tone={track.tone}
					className={cn("h-full rounded-full", track.fillClass)}
					style={{ width: `${track.usedPercent}%` }}
				/>
			</div>
			<span
				aria-hidden="true"
				className="absolute -inset-y-0.5 w-px bg-text-muted"
				style={{ left: `${track.estimatePercent}%` }}
			/>
			<span
				aria-hidden="true"
				className="absolute -inset-y-0.5 w-px bg-gate-warn-solid"
				style={{ left: `${track.softPercent}%` }}
			/>
		</div>
	);
}

function BoardSkeleton() {
	return (
		<div
			data-testid="missions-running-skeleton"
			className="flex flex-col divide-y divide-border"
		>
			{[0, 1].map((i) => (
				<div key={i} className="flex items-center gap-3 px-4 py-3">
					<Skeleton className="size-6 rounded-sm" />
					<span className="flex flex-1 flex-col gap-1.5">
						<Skeleton className="h-3.5 w-32" />
						<Skeleton className="h-3 w-48" />
					</span>
					<Skeleton className="h-5 w-16 rounded-sm" />
					<Skeleton className="hidden h-1.5 w-48 rounded-full md:block" />
				</div>
			))}
		</div>
	);
}

// ---------------------------------------------------------------------------
// 3. Needs you

function NeedsYouColumn({
	list,
	total,
	now,
	onAll,
}: {
	list: ReturnType<typeof useMissionList>;
	total?: number;
	now: number;
	onAll: () => void;
}) {
	const query: SurfaceQuery<MissionListItem[], unknown> =
		list.status === "error"
			? {
					status: "error",
					error: list.error,
					refetch: list.refetch,
					isFetching: list.isFetching,
				}
			: list.status === "pending"
				? { status: "pending" }
				: {
						status: "success",
						data: rowsOf(list),
						dataUpdatedAt: list.dataUpdatedAt,
						refetch: list.refetch,
						isFetching: list.isFetching,
					};
	return (
		<DataPanel
			data-testid="missions-needs-you"
			title="Needs you"
			tone="warn"
			count={total}
			footer={
				list.status === "success" ? (
					<>
						<ReadAge
							data-testid="missions-needs-you-read-age"
							readAt={list.dataUpdatedAt}
							staleAfterMs={QUERY_STALE_MS}
							onRefresh={() => list.refetch()}
							refreshing={list.isFetching}
						/>
						{total !== undefined && total > 0 ? (
							<Button
								variant="link"
								size="sm"
								data-testid="missions-needs-you-all"
								onClick={onAll}
							>
								{`All ${total}`}
							</Button>
						) : null}
					</>
				) : undefined
			}
		>
			<Surface
				data-testid="missions-needs-you-list"
				query={query}
				loading={
					<div className="flex flex-col gap-3 p-4">
						<Skeleton className="h-12 w-full rounded-control" />
						<Skeleton className="h-12 w-full rounded-control" />
					</div>
				}
				empty={
					<p
						data-testid="missions-needs-you-empty"
						className="px-4 py-3 type-small text-text-subtle"
					>
						Nothing is waiting on you.
					</p>
				}
				error={({ retry, retrying, error }) => (
					<ErrorState
						error={error as never}
						retry={retry}
						retrying={retrying}
					/>
				)}
			>
				{(rows) => (
					// No intrinsic width, as the board's rows.
					<ul className="flex flex-col divide-y divide-border [contain:inline-size]">
						{rows.slice(0, NEEDS_YOU_ROWS).map((mission) => (
							<li key={mission.id}>
								<NeedsYouRow mission={mission} now={now} />
							</li>
						))}
					</ul>
				)}
			</Surface>
		</DataPanel>
	);
}

/** v3 .row-link to the mission's full page, where it is acted on (audit F6). */
function NeedsYouRow({
	mission,
	now,
}: {
	mission: MissionListItem;
	now: number;
}) {
	const reason = mission.needsYou?.reason;
	const since = mission.lastExport?.statusChangedAt;
	return (
		<Link
			to="/missions/$id"
			params={{ id: mission.id }}
			data-testid={`missions-needs-you-row-${mission.id}`}
			className="group/row focus-inset flex min-h-10 w-full items-center gap-2.5 px-4 py-2 text-left transition-colors duration-(--duration-micro) ease-avel hover:bg-app-raised"
		>
			<StatusGlyph tone="warn" className="text-gate-warn" />
			{/* Two lines, each a fact: the mission and its client, then what
				    it waits on and since when. */}
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="flex min-w-0 items-baseline gap-1.5">
					<span
						data-testid={`missions-needs-you-label-${mission.id}`}
						className="truncate type-small font-medium text-text"
						title={missionLabel(mission)}
					>
						{missionShortLabel(mission)}
					</span>
					{mission.client ? (
						<span
							data-testid={`missions-needs-you-meta-${mission.id}`}
							className="min-w-0 shrink-0 type-caption text-text-subtle"
						>
							{mission.client.name}
						</span>
					) : null}
				</span>
				<span className="type-caption text-gate-warn">
					{reason ? NEEDS_YOU_DETAIL[reason] : null}
					{since ? (
						<span className="text-text-subtle">{`, since ${relativeTime(since, now)}`}</span>
					) : null}
				</span>
			</span>
			<ChevronRight
				aria-hidden="true"
				className="size-3.5 shrink-0 text-text-subtle transition-transform duration-(--duration-micro) ease-avel group-hover/row:translate-x-0.5 group-hover/row:text-text"
			/>
		</Link>
	);
}

// ---------------------------------------------------------------------------
// 5. Recent activity

/** How many of the newest log entries the dashboard shows. */
export const RECENT_ACTIVITY_ROWS = 8;

function RecentActivity({ polling, now }: { polling: boolean; now: number }) {
	// The Activity page's own query, so the cache is shared; it re-reads with
	// the board while a dispatch moves, so a runner halt appears.
	const query = useInfiniteQuery({
		...activityQuery(useApiClient(), {}),
		refetchInterval: polling ? DISPATCH_POLL_MS : false,
	});
	return (
		<DataPanel
			data-testid="missions-activity"
			title="Recent activity"
			count={query.data?.pages[0]?.meta.total}
			footer={
				query.status === "success" ? (
					<>
						<ReadAge
							data-testid="missions-activity-read-age"
							readAt={query.dataUpdatedAt}
							staleAfterMs={QUERY_STALE_MS}
							onRefresh={() => query.refetch()}
							refreshing={query.isFetching}
							polling={polling ? "polling" : undefined}
						/>
						<Link
							to="/activity"
							data-testid="missions-activity-all"
							className="inline-block py-1 type-small text-accent-text underline-offset-3 hover:underline"
						>
							All activity
						</Link>
					</>
				) : undefined
			}
		>
			<Surface
				data-testid="missions-activity-list"
				query={query}
				isEmpty={(data) => loadedActivity(data).length === 0}
				loading={
					<div className="flex flex-col gap-3 p-4">
						<Skeleton className="h-4 w-3/4" />
						<Skeleton className="h-4 w-2/3" />
						<Skeleton className="h-4 w-1/2" />
					</div>
				}
				empty={
					<p
						data-testid="missions-activity-empty"
						className="px-4 py-3 type-small text-text-subtle"
					>
						Nothing has happened yet.
					</p>
				}
				error={ErrorState}
			>
				{(data) => (
					<div className="px-4">
						<ActivityRows
							entries={loadedActivity(data).slice(0, RECENT_ACTIVITY_ROWS)}
							now={now}
						/>
					</div>
				)}
			</Surface>
		</DataPanel>
	);
}
