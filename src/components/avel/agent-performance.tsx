import { Link } from "@tanstack/react-router";
import type {
	AgentTemplate,
	DispatchStatus,
	TemplateDispatch,
} from "avel-server/contract";
import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	useCompletionReport,
	useTemplateDispatches,
} from "@/lib/api/dispatches";
import { cn } from "@/lib/utils";
import { missionLabel } from "@/shell/command-search";
import { whenLabel } from "./agent-activity";
import { CompletionReportView, FILED_BY_LABEL } from "./completion-report";
import { DISPATCH_LANES, DISPATCH_STATUS_TONE } from "./dispatch-board";
import { formatTokens, formatUsd } from "./dispatch-budget";
import { DISPATCH_STATUS_LABEL, HALT_REASON_LABEL } from "./dispatch-labels";
import { SectionPanel } from "./section-panel";
import { StatusGlyph } from "./status-pill";
import { ErrorState, Surface } from "./surface";

/*
 * An agent's Performance tab, from its dispatches across every mission
 * (GET /api/agent-templates/:id/dispatches): how its runs ended, what they
 * spent, the tokens they used against their estimates, and each run by
 * mission or by identity version, opening onto its report. The measures
 * come from the server's totals, so they count every run, not only the
 * pages loaded. No generated id is visible text.
 */

export type DispatchTotals = {
	total: number;
	byStatus: Record<DispatchStatus, number>;
	spendUsd: number;
	tokensUsed: number;
	estimatedTokens: number;
};

/**
 * Each status's fill in the outcome bar. Running takes the accent so it
 * reads apart from waiting, which shares its pending tone on the board.
 */
const MIX_FILL = {
	queued: "bg-gate-pending",
	running: "bg-accent",
	blocked: "bg-gate-warn",
	complete: "bg-gate-pass",
	failed: "bg-gate-block",
	halted: "bg-gate-stale",
} as const satisfies Record<DispatchStatus, string>;

/** The bar's segments: every status with a run, in board order, by share. */
export function mixSegments(
	byStatus: Record<DispatchStatus, number>,
): { status: DispatchStatus; count: number; share: number }[] {
	const total = DISPATCH_LANES.reduce((sum, s) => sum + byStatus[s], 0);
	if (total === 0) return [];
	return DISPATCH_LANES.filter((s) => byStatus[s] > 0).map((status) => ({
		status,
		count: byStatus[status],
		share: byStatus[status] / total,
	}));
}

/** Tokens used as a share of the estimate; null with no estimate. */
export function estimateShare(
	totals: Pick<DispatchTotals, "tokensUsed" | "estimatedTokens">,
): number | null {
	return totals.estimatedTokens === 0
		? null
		: totals.tokensUsed / totals.estimatedTokens;
}

export type RunGrouping = "mission" | "version";

export type RunGroup = {
	key: string;
	runs: TemplateDispatch[];
} & (
	| { by: "mission"; mission: TemplateDispatch["mission"] }
	| { by: "version"; ref: string | null }
);

/**
 * Runs in groups, in the server's order (newest first): each group where
 * its newest run falls, its runs newest first. A run not started yet has
 * no version, and those group together.
 */
export function groupRuns(
	runs: readonly TemplateDispatch[],
	by: RunGrouping,
): RunGroup[] {
	const groups = new Map<string, RunGroup>();
	for (const run of runs) {
		const key =
			by === "mission" ? run.mission.id : (run.agentVersionRef ?? "unstarted");
		const group =
			groups.get(key) ??
			(by === "mission"
				? { key, by, mission: run.mission, runs: [] }
				: { key, by, ref: run.agentVersionRef, runs: [] });
		group.runs.push(run);
		groups.set(key, group);
	}
	return [...groups.values()];
}

const plural = (n: number, one: string, many: string) =>
	`${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------

/** Wired to avel-server: the totals unfiltered, the runs by the chosen status. */
export function AgentPerformance({ agent }: { agent: AgentTemplate }) {
	const [status, setStatus] = useState<DispatchStatus | null>(null);
	const [grouping, setGrouping] = useState<RunGrouping>("mission");
	const all = useTemplateDispatches(agent.id);
	// With no filter this is the same query as `all`: one request.
	const shown = useTemplateDispatches(agent.id, status);
	return (
		<SectionPanel
			title="Performance"
			data-testid="agent-performance"
			description="Every run of this agent, across its missions and versions."
		>
			<Surface
				data-testid="agent-performance-surface"
				query={all}
				isEmpty={(data) => (data.pages[0]?.meta.totals.total ?? 0) === 0}
				loading={
					<div className="flex flex-col gap-3">
						<Skeleton className="h-16 w-full" />
						<Skeleton className="h-32 w-full" />
					</div>
				}
				empty={
					<p
						data-testid="agent-performance-empty"
						className="type-small text-text-subtle"
					>
						This agent hasn't been dispatched yet. Its runs show here once a
						mission dispatches it.
					</p>
				}
				error={ErrorState}
			>
				{(data) => {
					const totals = data.pages[0]?.meta.totals;
					if (!totals) return null;
					const runs = (shown.data?.pages ?? []).flatMap((p) => p.data);
					return (
						<PerformanceView
							totals={totals}
							runs={runs}
							status={status}
							onStatus={setStatus}
							grouping={grouping}
							onGrouping={setGrouping}
							loadingRuns={shown.status === "pending"}
							hasMore={shown.hasNextPage}
							loadingMore={shown.isFetchingNextPage}
							onMore={() => shown.fetchNextPage()}
						/>
					);
				}}
			</Surface>
		</SectionPanel>
	);
}

/** The tab given its data: rendered alone in tests. */
export function PerformanceView({
	totals,
	runs,
	status,
	onStatus,
	grouping,
	onGrouping,
	loadingRuns = false,
	hasMore = false,
	loadingMore = false,
	onMore = () => {},
}: {
	totals: DispatchTotals;
	runs: readonly TemplateDispatch[];
	/** The status the runs are filtered to, or null for every run. */
	status: DispatchStatus | null;
	onStatus: (status: DispatchStatus | null) => void;
	grouping: RunGrouping;
	onGrouping: (grouping: RunGrouping) => void;
	loadingRuns?: boolean;
	hasMore?: boolean;
	loadingMore?: boolean;
	onMore?: () => void;
}) {
	return (
		<div data-testid="agent-performance-view" className="flex flex-col gap-5">
			<div className="grid gap-4 lg:grid-cols-2">
				<OutcomeMix totals={totals} status={status} onStatus={onStatus} />
				<SpendAndTokens totals={totals} />
			</div>
			<Runs
				runs={runs}
				status={status}
				onStatus={onStatus}
				grouping={grouping}
				onGrouping={onGrouping}
				loading={loadingRuns}
				hasMore={hasMore}
				loadingMore={loadingMore}
				onMore={onMore}
			/>
		</div>
	);
}

/** How the runs ended, as one bar; each status filters the runs below. */
function OutcomeMix({
	totals,
	status,
	onStatus,
}: {
	totals: DispatchTotals;
	status: DispatchStatus | null;
	onStatus: (status: DispatchStatus | null) => void;
}) {
	const segments = mixSegments(totals.byStatus);
	return (
		<section
			aria-label="How its runs ended"
			data-testid="agent-performance-mix"
			className="flex flex-col gap-2.5 rounded-md border border-border p-3"
		>
			<p className="type-small text-text-muted">
				<span className="type-h2 text-foreground tabular-nums">
					{totals.total.toLocaleString("en-US")}
				</span>{" "}
				{totals.total === 1 ? "run" : "runs"}
			</p>
			<div
				aria-hidden="true"
				className="flex h-2.5 w-full overflow-hidden rounded-full bg-app-recessed"
			>
				{segments.map((s) => (
					<span
						key={s.status}
						data-testid={`agent-performance-mix-bar-${s.status}`}
						className={cn(
							"h-full transition-opacity duration-(--duration-state) ease-avel",
							MIX_FILL[s.status],
							status !== null && status !== s.status && "opacity-30",
						)}
						style={{ width: `${s.share * 100}%` }}
					/>
				))}
			</div>
			<ul className="flex flex-wrap gap-1.5">
				{DISPATCH_LANES.map((s) => {
					const count = totals.byStatus[s];
					const on = status === s;
					return (
						<li key={s}>
							<button
								type="button"
								aria-pressed={on}
								disabled={count === 0}
								data-testid={`agent-performance-mix-${s}`}
								data-count={count}
								onClick={() => onStatus(on ? null : s)}
								className={cn(
									"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 type-small transition-colors duration-(--duration-micro) ease-avel",
									"disabled:cursor-default disabled:opacity-(--opacity-disabled)",
									on
										? "border-accent bg-accent-soft text-foreground"
										: "border-border text-text-muted hover:bg-state-hover",
								)}
							>
								<span
									aria-hidden="true"
									className={cn("size-2 rounded-full", MIX_FILL[s])}
								/>
								{DISPATCH_STATUS_LABEL[s]}
								<span className="type-mono-small tabular-nums">{count}</span>
							</button>
						</li>
					);
				})}
			</ul>
		</section>
	);
}

/** What the runs spent, and their tokens against what was estimated. */
function SpendAndTokens({ totals }: { totals: DispatchTotals }) {
	const share = estimateShare(totals);
	const over = share !== null && share > 1;
	return (
		<section
			aria-label="Spend and tokens"
			data-testid="agent-performance-spend"
			className="flex flex-col gap-2.5 rounded-md border border-border p-3"
		>
			<p className="type-small text-text-muted">
				<span
					data-testid="agent-performance-spend-usd"
					className="type-h2 text-foreground tabular-nums"
				>
					{formatUsd(totals.spendUsd)}
				</span>{" "}
				spent
				{totals.total > 0 ? (
					<span className="text-text-subtle">
						{`, ${formatUsd(totals.spendUsd / totals.total)} a run`}
					</span>
				) : null}
			</p>
			<div
				aria-hidden="true"
				className="relative h-2.5 w-full overflow-hidden rounded-full bg-app-recessed"
			>
				<span
					data-testid="agent-performance-tokens-bar"
					data-over={over}
					className={cn(
						"absolute inset-y-0 left-0 rounded-full",
						over ? "bg-gate-warn" : "bg-gate-pass",
					)}
					style={{ width: `${Math.min(share ?? 0, 1) * 100}%` }}
				/>
			</div>
			<p
				data-testid="agent-performance-tokens"
				data-over={over}
				className="type-small text-text-muted"
			>
				<span className="type-mono text-foreground tabular-nums">
					{formatTokens(totals.tokensUsed)}
				</span>
				{" of "}
				<span className="type-mono tabular-nums">
					{formatTokens(totals.estimatedTokens)}
				</span>
				{" estimated tokens"}
				{share === null ? null : (
					<span
						className={cn(
							"ml-1.5 type-mono-small tabular-nums",
							over ? "text-gate-warn" : "text-text-subtle",
						)}
					>
						{`${Math.round(share * 100)}%`}
					</span>
				)}
			</p>
		</section>
	);
}

const GROUPINGS = [
	{ value: "mission", label: "By mission" },
	{ value: "version", label: "By version" },
] as const satisfies readonly { value: RunGrouping; label: string }[];

function Runs({
	runs,
	status,
	onStatus,
	grouping,
	onGrouping,
	loading,
	hasMore,
	loadingMore,
	onMore,
}: {
	runs: readonly TemplateDispatch[];
	status: DispatchStatus | null;
	onStatus: (status: DispatchStatus | null) => void;
	grouping: RunGrouping;
	onGrouping: (grouping: RunGrouping) => void;
	loading: boolean;
	hasMore: boolean;
	loadingMore: boolean;
	onMore: () => void;
}) {
	const groups = groupRuns(runs, grouping);
	return (
		<section
			aria-label="Runs"
			data-testid="agent-performance-runs"
			data-grouping={grouping}
			className="flex flex-col gap-3"
		>
			<div className="flex flex-wrap items-center gap-2">
				<fieldset className="inline-flex rounded-full border border-border p-0.5">
					<legend className="sr-only">Group runs</legend>
					{GROUPINGS.map((g) => (
						<button
							key={g.value}
							type="button"
							aria-pressed={grouping === g.value}
							data-testid={`agent-performance-by-${g.value}`}
							onClick={() => onGrouping(g.value)}
							className={cn(
								"rounded-full px-2.5 py-0.5 type-small transition-colors duration-(--duration-micro) ease-avel",
								grouping === g.value
									? "bg-state-selected text-foreground"
									: "text-text-muted hover:bg-state-hover",
							)}
						>
							{g.label}
						</button>
					))}
				</fieldset>
				{status === null ? null : (
					<p
						data-testid="agent-performance-filter"
						className="flex items-center gap-2 type-small text-text-muted"
					>
						{`Showing ${DISPATCH_STATUS_LABEL[status].toLowerCase()} runs`}
						<Button
							variant="ghost"
							size="sm"
							onClick={() => onStatus(null)}
							data-testid="agent-performance-filter-clear"
						>
							Show every run
						</Button>
					</p>
				)}
			</div>
			{loading ? (
				<Skeleton className="h-24 w-full" />
			) : groups.length === 0 ? (
				<p
					data-testid="agent-performance-runs-none"
					className="type-small text-text-subtle"
				>
					No runs with this status.
				</p>
			) : (
				<ul className="flex flex-col gap-3">
					{groups.map((group) => (
						<li key={group.key}>
							<Group group={group} />
						</li>
					))}
				</ul>
			)}
			{hasMore ? (
				<Button
					variant="outline"
					size="sm"
					className="self-start"
					onClick={onMore}
					disabledReason={loadingMore ? "Loading" : undefined}
					data-testid="agent-performance-more"
				>
					{loadingMore ? "Loading" : "Load more runs"}
				</Button>
			) : null}
		</section>
	);
}

/** One group: the mission (linked) or the version, then its runs. */
function Group({ group }: { group: RunGroup }) {
	return (
		<section
			data-testid={`agent-performance-group-${group.key}`}
			className="flex flex-col gap-1 rounded-md border border-border bg-app-recessed p-2"
		>
			<header className="flex flex-wrap items-baseline gap-x-2 px-1.5 pt-0.5">
				{group.by === "mission" ? (
					<>
						<Link
							to="/missions/$id"
							params={{ id: group.mission.id }}
							data-testid={`agent-performance-mission-${group.mission.id}`}
							className="type-small font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-current"
						>
							{missionLabel(group.mission)}
						</Link>
						<span className="type-caption text-text-subtle">
							{group.mission.origin === "client" ? "Client" : "Internal"}
						</span>
					</>
				) : (
					<span className="type-mono-small text-foreground">
						{group.ref ?? "Not started yet"}
					</span>
				)}
				<span className="type-caption text-text-subtle">
					{plural(group.runs.length, "run", "runs")}
				</span>
			</header>
			<ul className="flex flex-col">
				{group.runs.map((run) => (
					<li key={run.id}>
						<Run run={run} grouping={group.by} />
					</li>
				))}
			</ul>
		</section>
	);
}

/**
 * One run as a row that opens in place: how it ended, its brief, spend and
 * tokens, then its report's summary and the full report on request.
 */
function Run({
	run,
	grouping,
}: {
	run: TemplateDispatch;
	grouping: RunGrouping;
}) {
	const [open, setOpen] = useState(false);
	const detailsId = useId();
	const tone = DISPATCH_STATUS_TONE[run.status];
	return (
		<div
			data-testid={`agent-performance-run-${run.id}`}
			data-status={run.status}
			data-open={open}
			className="rounded-sm"
		>
			<button
				type="button"
				aria-expanded={open}
				aria-controls={detailsId}
				data-testid={`agent-performance-run-toggle-${run.id}`}
				onClick={() => setOpen((o) => !o)}
				className="focus-inset grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-2.5 rounded-sm px-1.5 py-1.5 text-left transition-colors duration-(--duration-micro) ease-avel hover:bg-state-hover"
			>
				<StatusGlyph tone={tone} className="translate-y-0.5" />
				<span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
					<span className="type-small text-foreground">
						{DISPATCH_STATUS_LABEL[run.status]}
					</span>
					<span className="type-mono-small text-text-muted">
						{run.briefRef
							? [run.briefRef.moduleId, ...run.briefRef.requirementIds].join(
									" ",
								)
							: "No brief"}
					</span>
					<span className="type-caption text-text-subtle">
						{grouping === "mission"
							? (run.agentVersionRef ?? "Not started")
							: missionLabel(run.mission)}
					</span>
				</span>
				<span className="flex items-baseline gap-2.5">
					<span className="type-mono-small text-text-muted tabular-nums">
						{formatUsd(run.spendUsd)}
					</span>
					<span className="type-mono-small text-text-subtle tabular-nums">
						{`${formatTokens(run.tokensUsed)} / ${formatTokens(run.estimatedTokens)}`}
					</span>
					<time
						dateTime={run.startedAt ?? run.createdAt}
						className="hidden type-caption text-text-subtle tabular-nums sm:inline"
					>
						{whenLabel(run.startedAt ?? run.createdAt)}
					</time>
					<ChevronDown
						aria-hidden="true"
						className={cn(
							"size-3.5 self-center text-text-subtle transition-transform duration-(--duration-state) ease-avel",
							open && "rotate-180",
						)}
					/>
				</span>
			</button>
			{open ? (
				<div
					id={detailsId}
					data-testid={`agent-performance-run-details-${run.id}`}
					className="flex flex-col gap-2 px-1.5 pt-1 pb-2.5 pl-7"
				>
					<RunSummary run={run} />
				</div>
			) : null}
		</div>
	);
}

/** The report's summary, or why there is none yet; the full report on request. */
function RunSummary({ run }: { run: TemplateDispatch }) {
	const [full, setFull] = useState(false);
	const { report } = run;
	return (
		<>
			{run.status === "halted" && run.haltReason ? (
				<p className="type-small text-gate-block">
					{HALT_REASON_LABEL[run.haltReason]}
				</p>
			) : null}
			{report === null ? (
				<p
					data-testid={`agent-performance-run-noreport-${run.id}`}
					className="type-small text-text-subtle"
				>
					{`No report yet: it is ${DISPATCH_STATUS_LABEL[run.status].toLowerCase()}.`}
				</p>
			) : (
				<>
					<p
						data-testid={`agent-performance-run-report-${run.id}`}
						className="type-small text-text-muted"
					>
						{`${FILED_BY_LABEL[report.filedBy]}. ${plural(report.actualTokens, "token", "tokens")}, ${plural(report.blockers, "blocker", "blockers")}, ${plural(report.edgeMismatches, "handoff mismatch", "handoff mismatches")}.`}
					</p>
					<Button
						variant="outline"
						size="sm"
						className="self-start"
						aria-expanded={full}
						onClick={() => setFull((f) => !f)}
						data-testid={`agent-performance-run-open-${run.id}`}
					>
						{full ? "Hide the report" : "Open the report"}
					</Button>
					{full ? <FullReport id={report.id} run={run} /> : null}
				</>
			)}
		</>
	);
}

/** The full report, read on its own once asked for. */
function FullReport({ id, run }: { id: string; run: TemplateDispatch }) {
	const report = useCompletionReport(id);
	return (
		<Surface
			data-testid={`agent-performance-run-full-${run.id}`}
			query={report}
			isEmpty={() => false}
			loading={<Skeleton className="h-40 w-full" />}
			empty={null}
			error={ErrorState}
		>
			{(data) => (
				<CompletionReportView
					report={data}
					dispatch={run}
					data-testid={`agent-performance-report-${run.id}`}
				/>
			)}
		</Surface>
	);
}
