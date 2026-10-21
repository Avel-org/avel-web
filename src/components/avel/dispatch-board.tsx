import {
	DISPATCH_STATUSES,
	type Dispatch,
	type DispatchStatus,
} from "avel-server/contract";
import { ChevronDown } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDispatch } from "@/lib/api/dispatches";
import { cn } from "@/lib/utils";
import { ActorMark } from "./actor";
import { whenLabel } from "./agent-activity";
import { DispatchBriefLine } from "./dispatch-brief";
import {
	DispatchBudget,
	DispatchTokenSplit,
	formatUsd,
	minutesRun,
} from "./dispatch-budget";
import { DISPATCH_STATUS_LABEL } from "./dispatch-labels";
import { IdentityVersionTrigger, lookupRef } from "./identity-version-sheet";
import { CompactBudget } from "./missions-dashboard";
import { ShortHash } from "./short-hash";
import { StatusGlyph, type StatusTone } from "./status-pill";

/*
 * A mission's dispatches as a board (module 6): one lane per status, the
 * open ones first (waiting, running, blocked), then the closed ones. Each
 * dispatch is a row in the Missions dashboard's Running now look (the agent,
 * its status, the compact budget, spend and wall clock), with its evidence
 * and controls under it; it opens in place for the brief, the identity and
 * model frozen at its start, its times, the full budget and the token split.
 * No generated id is visible text.
 */

/**
 * Where each status's lane sits. Keyed on the contract's enum, so a status
 * the server adds fails the build until it has a place.
 */
const LANE_PLACE = {
	queued: 0,
	running: 1,
	blocked: 2,
	complete: 3,
	failed: 4,
	halted: 5,
} as const satisfies Record<DispatchStatus, number>;

/** The lanes in board order. */
export const DISPATCH_LANES: readonly DispatchStatus[] = [
	...DISPATCH_STATUSES,
].sort((a, b) => LANE_PLACE[a] - LANE_PLACE[b]);

/** Open lanes still move; closed lanes hold dispatches that ended. */
export function isOpenLane(status: DispatchStatus): boolean {
	return LANE_PLACE[status] < LANE_PLACE.complete;
}

/**
 * Each status as a tone, read as the export statuses are (ruling 27): in
 * motion is pending, waiting on a person is warn, done is pass, failed is
 * block, and halted is stale: stopped at a limit or by the operator, with
 * nothing in the system broken.
 */
export const DISPATCH_STATUS_TONE = {
	queued: "pending",
	running: "pending",
	blocked: "warn",
	complete: "pass",
	failed: "block",
	halted: "stale",
} as const satisfies Record<DispatchStatus, StatusTone>;

/**
 * A lane's cards in order: waiting ones oldest first (the next to start
 * leads); the rest latest first, by when they closed or started.
 */
export function laneOrder(dispatches: Dispatch[]): Dispatch[] {
	const at = (d: Dispatch) =>
		Date.parse(d.closedAt ?? d.startedAt ?? d.createdAt);
	return [...dispatches].sort((a, b) =>
		a.status === "queued" ? at(a) - at(b) : at(b) - at(a),
	);
}

/**
 * What an opened closed card shows beneath its details: its completion
 * report, rendered by the page that reads the reports.
 */
export type RenderReport = (dispatch: Dispatch) => ReactNode;

/** What a card shows under its budget: Start or Halt, from the page. */
export type RenderControls = (dispatch: Dispatch) => ReactNode;

/**
 * What a closed card leads with: its evidence summary, from the report the
 * page has read (audit F5). Nothing while the report is not in hand.
 */
export type RenderEvidence = (dispatch: Dispatch) => ReactNode;

export function DispatchBoard({
	dispatches,
	now = Date.now(),
	renderReport,
	renderControls,
	renderEvidence,
	live = false,
}: {
	dispatches: Dispatch[];
	/** For the minutes a running dispatch has run so far. */
	now?: number;
	renderReport?: RenderReport;
	renderControls?: RenderControls;
	renderEvidence?: RenderEvidence;
	/** An opened card reads its dispatch on its own (useDispatch). */
	live?: boolean;
}) {
	// Only the statuses that hold a dispatch: an empty group is noise. The
	// page shows its one empty state when there is no dispatch at all.
	const held = DISPATCH_LANES.filter((s) =>
		dispatches.some((d) => d.status === s),
	);
	const open = held.filter(isOpenLane);
	const closed = held.filter((s) => !isOpenLane(s));
	const lane = (status: DispatchStatus) => (
		<Lane
			key={status}
			status={status}
			dispatches={laneOrder(dispatches.filter((d) => d.status === status))}
			now={now}
			renderReport={renderReport}
			renderControls={renderControls}
			renderEvidence={renderEvidence}
			live={live}
		/>
	);
	// The groups stack as sub-sections of the panel, open ones first, each a
	// list of rows in the dashboard's Running now look, so a mission's board
	// and the Missions dashboard read the same.
	return (
		<div data-testid="dispatch-board" className="flex flex-col gap-4">
			{open.length > 0 ? (
				<div data-testid="dispatch-board-open" className="flex flex-col gap-4">
					{open.map(lane)}
				</div>
			) : null}
			{closed.length > 0 ? (
				<div
					data-testid="dispatch-board-closed"
					className="flex flex-col gap-4"
				>
					{closed.map(lane)}
				</div>
			) : null}
		</div>
	);
}

function Lane({
	status,
	dispatches,
	now,
	renderReport,
	renderControls,
	renderEvidence,
	live,
}: {
	status: DispatchStatus;
	dispatches: Dispatch[];
	now: number;
	renderReport?: RenderReport;
	renderControls?: RenderControls;
	renderEvidence?: RenderEvidence;
	live: boolean;
}) {
	const headingId = useId();
	return (
		<section
			aria-labelledby={headingId}
			data-testid={`dispatch-lane-${status}`}
			data-open={isOpenLane(status)}
			className="flex min-w-0 flex-col gap-2"
		>
			<header className="flex items-center gap-2">
				<StatusGlyph
					tone={DISPATCH_STATUS_TONE[status]}
					className={TONE_TEXT[DISPATCH_STATUS_TONE[status]]}
				/>
				<h3 id={headingId} className="type-eyebrow">
					{DISPATCH_STATUS_LABEL[status]}
				</h3>
				<Badge variant="count" data-testid={`dispatch-lane-${status}-count`}>
					{dispatches.length}
				</Badge>
				<span aria-hidden="true" className="h-px flex-1 bg-border" />
			</header>
			<ul className="flex flex-col divide-y divide-border overflow-clip rounded-card border border-border bg-app-panel [contain:inline-size]">
				{dispatches.map((d) => (
					<li key={d.id}>
						<DispatchCard
							dispatch={d}
							now={now}
							renderReport={renderReport}
							renderControls={renderControls}
							renderEvidence={renderEvidence}
							live={live}
						/>
					</li>
				))}
			</ul>
		</section>
	);
}

/**
 * A dispatch card while the board loads, in the card's own shape (v3 UX 8,
 * .skel-row and .skel-pill): the agent's name and slug, a pill where the
 * status sits, the budget track and its line.
 */
export function DispatchCardSkeleton() {
	return (
		<div
			data-testid="dispatch-card-skeleton"
			aria-hidden="true"
			className="flex flex-col gap-2.5 rounded-card border border-border bg-app-panel p-3"
		>
			<div className="flex items-center gap-2">
				<div className="flex flex-1 flex-col gap-1.5">
					<Skeleton className="h-3 w-28" />
					<Skeleton className="h-3 w-16" />
				</div>
				<Skeleton
					data-testid="dispatch-card-skeleton-pill"
					className="h-[22px] w-16 rounded-sm"
				/>
			</div>
			<Skeleton className="h-2 w-full rounded-full" />
			<Skeleton className="h-3 w-2/3" />
		</div>
	);
}

const TONE_TEXT: Record<StatusTone, string> = {
	pass: "text-gate-pass",
	block: "text-gate-block",
	warn: "text-gate-warn",
	pending: "text-gate-pending",
	stale: "text-gate-stale",
};

/** One dispatch: who, on what, as which version, when, and its budget. */
export function DispatchCard({
	dispatch,
	now = Date.now(),
	renderReport,
	renderControls,
	renderEvidence,
	live = false,
}: {
	dispatch: Dispatch;
	now?: number;
	renderReport?: RenderReport;
	renderControls?: RenderControls;
	renderEvidence?: RenderEvidence;
	/** Opened, it reads its dispatch on its own: needs the data layer. */
	live?: boolean;
}) {
	const [open, setOpen] = useState(false);
	// A link to "#dispatch-<id>" (a gate refusal names the dispatch it
	// blocked on) opens its card, on arrival and when the hash changes.
	useEffect(() => {
		const openIfNamed = () => {
			if (window.location.hash === `#dispatch-${dispatch.id}`) setOpen(true);
		};
		openIfNamed();
		window.addEventListener("hashchange", openIfNamed);
		return () => window.removeEventListener("hashchange", openIfNamed);
	}, [dispatch.id]);
	const nameId = useId();
	const detailsId = useId();
	const { agent } = dispatch;
	const minutes = minutesRun(dispatch, now);
	return (
		<article
			// The anchor a gate refusal links to: "#dispatch-<id>" on the mission page.
			id={`dispatch-${dispatch.id}`}
			aria-labelledby={nameId}
			data-testid={`dispatch-card-${dispatch.id}`}
			data-status={dispatch.status}
			data-open={open}
			className="flex flex-col gap-2 px-4 py-2"
		>
			{/* The row, as the dashboard's Running now draws it: the agent's
			    tile, name and title over its slug, the budget at a glance, then
			    the toggle. Its status is the group's heading. */}
			<div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 md:grid-cols-[auto_minmax(0,1fr)_12rem_auto]">
				<ActorMark kind="agent" name={agent.name} className="size-6" />
				{/* The agent and its title on one line; its slug is in the details. */}
				<span className="flex min-w-0 items-baseline gap-1.5">
					<span
						id={nameId}
						data-testid={`dispatch-card-name-${dispatch.id}`}
						className="shrink-0 type-small font-medium text-text"
					>
						{agent.name}
					</span>
					{agent.title ? (
						<span
							data-testid={`dispatch-card-title-${dispatch.id}`}
							className="min-w-0 truncate type-caption text-text-subtle"
							title={agent.title}
						>
							{agent.title}
						</span>
					) : null}
				</span>
				<div className="col-span-3 row-start-2 flex min-w-0 flex-col gap-1 md:col-span-1 md:row-start-auto">
					<CompactBudget dispatch={dispatch} />
					<span className="flex items-baseline justify-between gap-2 type-caption">
						<span className="type-mono text-text-muted">
							{formatUsd(dispatch.spendUsd)}
						</span>
						<span className="type-mono text-text-subtle">
							{minutes === null
								? `${dispatch.wallClockMinutes} min limit`
								: `${minutes} of ${dispatch.wallClockMinutes} min`}
						</span>
					</span>
				</div>
				<Button
					variant="ghost"
					size="icon-sm"
					className="col-start-3 row-start-1 md:col-start-auto md:row-start-auto"
					aria-expanded={open}
					aria-controls={detailsId}
					aria-label={`${open ? "Hide" : "Show"} details for ${agent.name}`}
					data-testid={`dispatch-card-toggle-${dispatch.id}`}
					onClick={() => setOpen((o) => !o)}
				>
					<ChevronDown
						aria-hidden="true"
						className={cn(
							"transition-transform duration-(--duration-state) ease-avel",
							open && "rotate-180",
						)}
					/>
				</Button>
			</div>
			{/* A closed dispatch leads with its evidence (audit F5); the
			    controls stay on the row. */}
			{renderEvidence?.(dispatch)}
			{renderControls?.(dispatch)}
			{/* The rest opens in place, inert while closed. */}
			<div
				className={cn(
					"grid transition-[grid-template-rows] duration-(--duration-state) ease-avel",
					open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
				)}
			>
				<div
					id={detailsId}
					data-testid={`dispatch-card-details-${dispatch.id}`}
					className="min-h-0 overflow-hidden"
					inert={!open}
				>
					{live && open ? (
						<LiveDispatchDetails
							seed={dispatch}
							now={now}
							renderReport={renderReport}
						/>
					) : (
						<DispatchDetails
							dispatch={dispatch}
							now={now}
							open={open}
							renderReport={renderReport}
						/>
					)}
				</div>
			</div>
		</article>
	);
}

/**
 * What an opened card shows: the brief, the identity and model frozen at
 * its start, its times, the full budget and the token split, then its
 * report once it has one.
 */
function DispatchDetails({
	dispatch,
	now,
	open,
	renderReport,
}: {
	dispatch: Dispatch;
	now: number;
	open: boolean;
	renderReport?: RenderReport;
}) {
	return (
		<div className="flex flex-col gap-2.5 border-t border-border pt-2.5">
			<p className="type-small text-text-muted">
				{"Agent "}
				<span
					data-testid={`dispatch-card-slug-${dispatch.id}`}
					className="type-mono text-foreground"
				>
					{dispatch.agent.slug}
				</span>
			</p>
			<Brief dispatch={dispatch} />
			<Pinned dispatch={dispatch} />
			<Times dispatch={dispatch} />
			<DispatchBudget dispatch={dispatch} now={now} />
			<p className="type-small text-text-muted">
				{"Territory "}
				{dispatch.territory === null ? (
					<span className="text-text-subtle">none</span>
				) : (
					<span
						data-testid={`dispatch-card-territory-${dispatch.id}`}
						className="type-mono text-foreground"
					>
						{dispatch.territory}
					</span>
				)}
			</p>
			<DispatchTokenSplit dispatch={dispatch} />
			{dispatch.skillsSha256 === null ? null : (
				<p className="type-small flex items-center gap-1.5 text-text-muted">
					Skills
					<ShortHash
						value={dispatch.skillsSha256}
						label="the skills' SHA-256"
						data-testid={`dispatch-card-skills-${dispatch.id}`}
					/>
				</p>
			)}
			<DispatchBriefLine dispatch={dispatch} agentName={dispatch.agent.name} />
			{/* Rendered only while open: it may read the report. */}
			{open && dispatch.reportId !== null && renderReport ? (
				<div
					data-testid={`dispatch-card-report-${dispatch.id}`}
					className="border-t border-border pt-2.5"
				>
					{renderReport(dispatch)}
				</div>
			) : null}
		</div>
	);
}

/**
 * The opened details, read on their own (GET /api/dispatches/:id): seeded
 * from the mission's list, so nothing flashes, then polled while the
 * dispatch waits or runs, so an open card stays live by itself. Until the
 * read answers, or if it fails, the list's copy stands in.
 */
function LiveDispatchDetails({
	seed,
	now,
	renderReport,
}: {
	seed: Dispatch;
	now: number;
	renderReport?: RenderReport;
}) {
	const live = useDispatch(seed.missionId, seed.id);
	return (
		<DispatchDetails
			dispatch={live.data ?? seed}
			now={now}
			open
			renderReport={renderReport}
		/>
	);
}

/** The module and requirement ids from the plan, or that it has none. */
function Brief({ dispatch }: { dispatch: Dispatch }) {
	const brief = dispatch.briefRef;
	return (
		<div
			data-testid={`dispatch-card-brief-${dispatch.id}`}
			className="flex min-w-0 flex-wrap items-center gap-1.5"
		>
			{brief === null ? (
				<span className="type-small text-text-subtle">No brief</span>
			) : (
				<>
					<span className="type-small text-text-muted">Module</span>
					<span className="type-mono text-foreground">{brief.moduleId}</span>
					{brief.requirementIds.map((id) => (
						<span
							key={id}
							className="rounded-xs border border-border bg-app-well px-1.5 type-mono text-text-muted"
						>
							{id}
						</span>
					))}
				</>
			)}
		</div>
	);
}

/**
 * The identity version and model frozen when the dispatch started. The
 * version opens what the agent was told, read by its hash.
 */
function Pinned({ dispatch }: { dispatch: Dispatch }) {
	const lookup = lookupRef(
		dispatch.agentVersionRef,
		dispatch.agentVersionSha256,
	);
	return (
		<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
			<span
				data-testid={`dispatch-card-ref-${dispatch.id}`}
				data-pinned={dispatch.agentVersionRef !== null}
				className="flex min-w-0 items-center gap-1.5"
			>
				{dispatch.agentVersionRef === null || lookup === null ? (
					<span className="type-caption text-text-subtle">
						Identity set when it starts
					</span>
				) : (
					<>
						<IdentityVersionTrigger
							lookup={lookup}
							label={dispatch.agentVersionRef}
							data-testid={`dispatch-card-version-${dispatch.id}`}
							className="truncate border border-border bg-app-well px-1.5 type-mono text-text-muted no-underline hover:bg-app-raised hover:text-text"
						>
							{dispatch.agentVersionRef}
						</IdentityVersionTrigger>
						{dispatch.agentVersionSha256 === null ? null : (
							<ShortHash
								value={dispatch.agentVersionSha256}
								label="the identity's SHA-256"
								data-testid={`dispatch-card-sha-${dispatch.id}`}
							/>
						)}
					</>
				)}
			</span>
			<span
				data-testid={`dispatch-card-model-${dispatch.id}`}
				className={cn(
					dispatch.model === null
						? "type-caption text-text-subtle"
						: "type-mono text-text-muted",
				)}
			>
				{dispatch.model ?? "Model set when it starts"}
			</span>
		</div>
	);
}

/** Queued, started and closed, in UTC so every viewer reads the same time. */
function Times({ dispatch }: { dispatch: Dispatch }) {
	return (
		<p
			data-testid={`dispatch-card-times-${dispatch.id}`}
			className="type-caption flex flex-wrap gap-x-3 text-text-subtle"
		>
			{dispatch.startedAt === null ? (
				<span>
					{"Queued "}
					<time dateTime={dispatch.createdAt}>
						{whenLabel(dispatch.createdAt)}
					</time>
				</span>
			) : (
				<span>
					{"Started "}
					<time dateTime={dispatch.startedAt}>
						{whenLabel(dispatch.startedAt)}
					</time>
				</span>
			)}
			{dispatch.closedAt === null ? null : (
				<span data-testid={`dispatch-card-closed-${dispatch.id}`}>
					{"Closed "}
					<time dateTime={dispatch.closedAt}>
						{whenLabel(dispatch.closedAt)}
					</time>
				</span>
			)}
		</p>
	);
}
