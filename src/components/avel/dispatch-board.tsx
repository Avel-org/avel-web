import {
	DISPATCH_STATUSES,
	type Dispatch,
	type DispatchStatus,
} from "avel-server/contract";
import { ChevronDown } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { whenLabel } from "./agent-activity";
import { DispatchBudget, DispatchTokenSplit } from "./dispatch-budget";
import { DISPATCH_STATUS_LABEL } from "./dispatch-labels";
import { ShortHash } from "./short-hash";
import { StatusGlyph, type StatusTone } from "./status-pill";

/*
 * A mission's dispatches as a board (module 6): one lane per status, the
 * open ones first (waiting, running, blocked), then the closed ones. Each
 * card names the agent, the brief it runs, the identity and model frozen at
 * its start, its times and its budget, and opens in place for the token
 * split. No generated id is visible text.
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

/** "None waiting to start.", per lane, for an empty one. */
const EMPTY_LANE = {
	queued: "None waiting to start.",
	running: "None running.",
	blocked: "None blocked.",
	complete: "None complete.",
	failed: "None failed.",
	halted: "None halted.",
} as const satisfies Record<DispatchStatus, string>;

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

export function DispatchBoard({
	dispatches,
	now = Date.now(),
	renderReport,
}: {
	dispatches: Dispatch[];
	/** For the minutes a running dispatch has run so far. */
	now?: number;
	renderReport?: RenderReport;
}) {
	const open = DISPATCH_LANES.filter(isOpenLane);
	const closed = DISPATCH_LANES.filter((s) => !isOpenLane(s));
	const lane = (status: DispatchStatus) => (
		<Lane
			key={status}
			status={status}
			dispatches={laneOrder(dispatches.filter((d) => d.status === status))}
			now={now}
			renderReport={renderReport}
		/>
	);
	return (
		<div data-testid="dispatch-board" className="flex flex-col gap-4">
			<div
				data-testid="dispatch-board-open"
				className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3"
			>
				{open.map(lane)}
			</div>
			<div
				data-testid="dispatch-board-closed"
				className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3"
			>
				{closed.map(lane)}
			</div>
		</div>
	);
}

function Lane({
	status,
	dispatches,
	now,
	renderReport,
}: {
	status: DispatchStatus;
	dispatches: Dispatch[];
	now: number;
	renderReport?: RenderReport;
}) {
	const headingId = useId();
	return (
		<section
			aria-labelledby={headingId}
			data-testid={`dispatch-lane-${status}`}
			data-open={isOpenLane(status)}
			className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-app-recessed p-2"
		>
			<header className="flex items-center gap-2 px-1.5 pt-1">
				<StatusGlyph
					tone={DISPATCH_STATUS_TONE[status]}
					className={TONE_TEXT[DISPATCH_STATUS_TONE[status]]}
				/>
				<h3 id={headingId} className="type-small font-medium text-foreground">
					{DISPATCH_STATUS_LABEL[status]}
				</h3>
				<span
					data-testid={`dispatch-lane-${status}-count`}
					className="type-mono-small text-text-subtle tabular-nums"
				>
					{dispatches.length}
				</span>
			</header>
			{dispatches.length === 0 ? (
				<p
					data-testid={`dispatch-lane-${status}-none`}
					className="type-small px-1.5 pb-1 text-text-subtle"
				>
					{EMPTY_LANE[status]}
				</p>
			) : (
				<ul className="stagger-in flex flex-col gap-2">
					{dispatches.map((d) => (
						<li key={d.id}>
							<DispatchCard
								dispatch={d}
								now={now}
								renderReport={renderReport}
							/>
						</li>
					))}
				</ul>
			)}
		</section>
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
}: {
	dispatch: Dispatch;
	now?: number;
	renderReport?: RenderReport;
}) {
	const [open, setOpen] = useState(false);
	const nameId = useId();
	const detailsId = useId();
	const { agent } = dispatch;
	return (
		<article
			aria-labelledby={nameId}
			data-testid={`dispatch-card-${dispatch.id}`}
			data-status={dispatch.status}
			data-open={open}
			className="plate flex flex-col gap-2.5 rounded-md border p-3"
		>
			{/* The agent: name and title, the slug beneath. */}
			<div className="flex items-start gap-2">
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
						<span
							id={nameId}
							data-testid={`dispatch-card-name-${dispatch.id}`}
							className="type-body font-medium text-foreground"
						>
							{agent.name}
						</span>
						{agent.title ? (
							<span
								data-testid={`dispatch-card-title-${dispatch.id}`}
								className="type-small text-text-muted"
							>
								{agent.title}
							</span>
						) : null}
					</p>
					<span
						data-testid={`dispatch-card-slug-${dispatch.id}`}
						className="type-mono-small text-text-subtle"
					>
						{agent.slug}
					</span>
				</div>
				<Button
					variant="ghost"
					size="icon-sm"
					className="-mt-1 -mr-1.5"
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
			<Brief dispatch={dispatch} />
			<Pinned dispatch={dispatch} />
			<Times dispatch={dispatch} />
			<DispatchBudget dispatch={dispatch} now={now} />
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
					<div className="flex flex-col gap-2 border-t border-border pt-2.5">
						<p className="type-small text-text-muted">
							{"Territory "}
							{dispatch.territory === null ? (
								<span className="text-text-subtle">none</span>
							) : (
								<span
									data-testid={`dispatch-card-territory-${dispatch.id}`}
									className="type-mono-small text-foreground"
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
				</div>
			</div>
		</article>
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
					<span className="type-mono-small text-foreground">
						{brief.moduleId}
					</span>
					{brief.requirementIds.map((id) => (
						<span
							key={id}
							className="rounded-xs border border-border bg-app-recessed px-1.5 type-mono-small text-text-muted"
						>
							{id}
						</span>
					))}
				</>
			)}
		</div>
	);
}

/** The identity version and model frozen when the dispatch started. */
function Pinned({ dispatch }: { dispatch: Dispatch }) {
	return (
		<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
			<span
				data-testid={`dispatch-card-ref-${dispatch.id}`}
				data-pinned={dispatch.agentVersionRef !== null}
				className="flex min-w-0 items-center gap-1.5"
			>
				{dispatch.agentVersionRef === null ? (
					<span className="type-caption text-text-subtle">
						Identity set when it starts
					</span>
				) : (
					<>
						<span className="truncate rounded-xs border border-border bg-app-recessed px-1.5 type-mono-small text-text-muted">
							{dispatch.agentVersionRef}
						</span>
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
						: "type-mono-small text-text-muted",
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
