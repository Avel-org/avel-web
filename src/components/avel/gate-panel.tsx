import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type {
	GateJob,
	GateReasonWire,
	GateRun,
	GateRunSummary,
} from "avel-server/contract";
import { ChevronRight, Play, ShieldCheck } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { ApiError } from "@/lib/api/errors";
import {
	afterGateRun,
	type GateAttempt,
	type GateOverride,
	gateAttemptFor,
	jobInMotion,
	useGateJob,
	useGateRun,
	useGateRuns,
	useRunGate,
} from "@/lib/api/gate";
import { GATE_JOB_FAILURE_COPY, PRECONDITION_COPY } from "@/lib/error-map";
import { cn } from "@/lib/utils";
import { issuesOf } from "./action-modal";
import { shortStamp } from "./activity-audit";
import { DISPATCH_STATUS_LABEL, DISPATCH_STATUS_TONE } from "./dispatch-labels";
import {
	EFFECT_WORDS,
	IGNORED_WHY,
	RESULT,
	RULE_WORDS,
	SEVERITY,
} from "./gate-copy";
import { GatePolicyGlyph } from "./gate-policy-glyph";
import { useMission } from "./mission-data";
import { PanelFooter } from "./panel-footer";
import { Reason } from "./reason";
import { retryOf } from "./retry";
import { SectionPanel } from "./section-panel";
import { ShortHash } from "./short-hash";
import { StatusGlyph, StatusPill } from "./status-pill";
import { ErrorState, Surface } from "./surface";

/*
 * The gate on a mission's page (module 9). The latest run is the result
 * now: its pill and the commit it judged in the header, each listed gate
 * with its policy and result, and each gate's reasons on expand. A blocking
 * reason a written override would clear offers one; the rationale is bound
 * to the run's commit and kept until the commit changes. Run gate re-judges,
 * sending the overrides; a resend of the same attempt replays, never judges
 * twice. A refusal says why, with each dispatch or path it names.
 */

/** The overrides being written, for one commit: a new commit starts empty. */
type Drafts = { commitSha: string; byId: Record<string, string> };

export function GatePanel({ missionId }: { missionId: string }) {
	const runs = useGateRuns(missionId);
	const summaries = runs.data?.pages.flatMap((p) => p.data) ?? [];
	const latest = summaries[0] ?? null;
	const total = runs.data?.pages[0]?.meta.total;
	return (
		// The anchor a finding that blocks the gate links to: "#gate".
		<div id="gate">
			<SectionPanel
				title="Gate"
				data-testid="gate-panel"
				actions={
					latest ? (
						<span className="flex items-center gap-2">
							<StatusPill
								size="sm"
								tone={RESULT[latest.result].tone}
								label={RESULT[latest.result].label}
								data-testid="gate-result"
							/>
						</span>
					) : null
				}
				footer={
					<PanelFooter data-testid="gate-read-age" queries={[runs]}>
						{runs.status === "success" ? (
							<span
								data-testid="gate-run-count"
								className="type-caption text-text-subtle tabular-nums"
							>
								{runCount(total ?? summaries.length)}
							</span>
						) : null}
					</PanelFooter>
				}
			>
				<Surface
					data-testid="gate-runs"
					query={runs}
					isEmpty={() => latest === null}
					loading={<GateSkeleton />}
					empty={<GateBody missionId={missionId} latest={null} />}
					error={ErrorState}
				>
					{() => <GateBody missionId={missionId} latest={latest} />}
				</Surface>
			</SectionPanel>
		</div>
	);
}

const runCount = (n: number) => (n === 1 ? "1 run" : `${n} runs`);

/** The latest run's receipt, Run gate, and a refusal when there is one. */
function GateBody({
	missionId,
	latest,
}: {
	missionId: string;
	latest: GateRunSummary | null;
}) {
	const run = useGateRun(missionId, latest?.id ?? null);
	const runGate = useRunGate(missionId);
	// The newest job seen: the one this page started, or, after a reload or
	// from another tab, the one the mission has queued or running. It is kept
	// once the mission's activeGateJob clears, so a failure stays on screen.
	const mission = useMission(missionId);
	const seed = useNewestJob(
		runGate.data?.job ?? null,
		mission.data?.activeGateJob ?? null,
	);
	const job = useGateJob(seed?.id ?? null, seed);
	const moving = jobInMotion(job.data);
	useJobEnd(missionId, job.data);
	const [last, setLast] = useState<GateAttempt | null>(null);
	const sent = { onSuccess: () => setLast(null) };
	const [drafts, setDrafts] = useState<Drafts>({ commitSha: "", byId: {} });
	const commitSha = latest?.commitSha ?? "";
	// Written for another commit: not this run's, so not shown or sent.
	const byId = drafts.commitSha === commitSha ? drafts.byId : {};
	const overrides: GateOverride[] = Object.entries(byId)
		.filter(([, rationale]) => rationale.trim() !== "")
		.map(([findingId, rationale]) => ({
			findingId,
			commitSha,
			rationale: rationale.trim(),
		}));

	const judge = () => {
		const attempt = gateAttemptFor(last, overrides);
		setLast(attempt);
		runGate.mutate(attempt, sent);
	};

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-2">
				{latest ? (
					<p
						data-testid="gate-judged"
						className="flex flex-wrap items-center gap-x-1.5 gap-y-1 type-small text-text-muted"
					>
						<span>Judged</span>
						<ShortHash
							value={latest.commitSha}
							label="the judged commit"
							data-testid="gate-commit"
						/>
						<span>on base</span>
						<ShortHash
							value={latest.baseSha}
							label="the base commit"
							data-testid="gate-base"
						/>
					</p>
				) : (
					<p className="type-small text-text-muted">
						The gate hasn't judged this mission yet.
					</p>
				)}
				<Button
					type="button"
					size="sm"
					className="ml-auto"
					data-testid="gate-run"
					disabledReason={
						runGate.isPending
							? "Queuing the gate run"
							: job.data?.status === "queued"
								? "A gate run is already queued"
								: job.data?.status === "running"
									? "The gate is running"
									: undefined
					}
					onClick={judge}
				>
					<Play aria-hidden="true" />
					{overrides.length > 0
						? `Run gate with ${overrides.length} ${overrides.length === 1 ? "override" : "overrides"}`
						: "Run gate"}
				</Button>
			</div>
			{job.data && (moving || job.data.status === "failed") ? (
				<GateJobLine job={job.data} />
			) : null}
			{runGate.data?.existing && runGate.variables?.overrides.length ? (
				<p
					data-testid="gate-overrides-unsent"
					className="type-small text-text-muted"
				>
					A gate run was already queued for this mission, so your overrides were
					not sent. Run the gate again with them once it ends.
				</p>
			) : null}
			{runGate.error ? (
				<GateRefusal
					error={runGate.error}
					missionId={missionId}
					{...retryOf(runGate, sent)}
				/>
			) : null}
			{latest === null ? null : run.status === "success" ? (
				<GateReceipt
					run={run.data}
					drafts={byId}
					onDraft={(findingId, rationale) =>
						setDrafts({ commitSha, byId: { ...byId, [findingId]: rationale } })
					}
				/>
			) : run.status === "error" ? (
				<ErrorState
					error={run.error}
					retry={() => run.refetch()}
					retrying={run.isFetching}
				/>
			) : (
				<GateSkeleton />
			)}
		</div>
	);
}

/**
 * The confirmed defects this run was checked against (module 12): each
 * prior_finding reason names one finding's permanent check, and a match is
 * its prior_finding_failed rule.
 */
export function priorChecks(run: Pick<GateRun, "reasons">): {
	checked: number;
	matched: number;
} {
	const checked = new Set<string>();
	const matched = new Set<string>();
	for (const r of run.reasons) {
		if (r.kind !== "prior_finding") continue;
		checked.add(r.findingId);
		if (r.rule === "prior_finding_failed") matched.add(r.findingId);
	}
	return { checked: checked.size, matched: matched.size };
}

/** "Checked against 3 confirmed defects, none found again", or how many were. */
export function priorChecksLabel({
	checked,
	matched,
}: {
	checked: number;
	matched: number;
}): string {
	const what = `Checked against ${checked} confirmed ${checked === 1 ? "defect" : "defects"}`;
	if (matched === 0) return `${what}, none found again`;
	return `${what}, ${matched} found again`;
}

/** The later-queued of two jobs, either of which may be absent. */
export function newerJob(a: GateJob | null, b: GateJob | null): GateJob | null {
	if (a === null) return b;
	if (b === null) return a;
	return Date.parse(b.queuedAt) > Date.parse(a.queuedAt) ? b : a;
}

/**
 * The newest job either source has named, held while both go quiet: the
 * mission's activeGateJob clears when a job ends, and the POST's answer
 * stays on an old job when another tab queues a newer one.
 */
function useNewestJob(
	started: GateJob | null,
	active: GateJob | null,
): GateJob | null {
	const [held, setHeld] = useState<GateJob | null>(null);
	const newest = newerJob(held, newerJob(started, active));
	if (newest !== null && newest.id !== held?.id) setHeld(newest);
	return newest;
}

/**
 * When a job this page followed ends, the runs, findings, mission and log
 * read again, once per job: a done job's run becomes the latest receipt.
 */
function useJobEnd(missionId: string, job: GateJob | undefined) {
	const queryClient = useQueryClient();
	const ended = useRef<string | null>(null);
	useEffect(() => {
		if (!job || jobInMotion(job) || ended.current === job.id) return;
		ended.current = job.id;
		void afterGateRun(queryClient, missionId);
	}, [job, missionId, queryClient]);
}

/** "Queued, 1 run ahead", "Queued, next to run". */
export function queuedLabel(ahead: number | null): string {
	if (ahead === null || ahead === 0) return "Queued, next to run";
	return `Queued, ${ahead} ${ahead === 1 ? "run" : "runs"} ahead`;
}

/** "Running checks, 3 of 7", or plain "Running" before any count. */
export function runningLabel(progress: GateJob["progress"]): string {
	if (!progress || progress.checksTotal === 0) return "Running";
	return `Running checks, ${progress.checksDone} of ${progress.checksTotal}`;
}

/**
 * A background run in motion, or why it ended without one. In motion is
 * the pending tone, never the accent (audit D3): queued with how many runs
 * are ahead, or running with the checks done, the one it is on, and a bar.
 */
function GateJobLine({ job }: { job: GateJob }) {
	if (job.status === "failed" && job.failure) {
		const { code, reason } = job.failure;
		const copy =
			code === "precondition_failed" && reason
				? PRECONDITION_COPY[reason]
				: GATE_JOB_FAILURE_COPY[code];
		return (
			<div
				data-testid="gate-job"
				data-status="failed"
				data-failure={code}
				className="flex items-start gap-2.5 rounded-control border border-gate-block-line bg-gate-block-soft p-3"
			>
				<StatusGlyph tone="block" className="mt-0.5 text-gate-block" />
				<div className="flex min-w-0 flex-col gap-0.5">
					<p className="type-small font-medium text-text">{copy.what}</p>
					<p className="type-small text-text-muted">{copy.next}</p>
				</div>
			</div>
		);
	}
	const progress = job.progress;
	const share =
		progress && progress.checksTotal > 0
			? Math.min(1, progress.checksDone / progress.checksTotal)
			: null;
	return (
		<div
			data-testid="gate-job"
			data-status={job.status}
			className="flex flex-col gap-2 rounded-control border border-border bg-app-hollow px-3 py-2.5"
		>
			<p className="flex flex-wrap items-center gap-x-2 gap-y-1 type-small text-text">
				<StatusGlyph tone="pending" className="text-gate-pending" />
				<span data-testid="gate-job-label">
					{job.status === "queued"
						? queuedLabel(job.ahead)
						: runningLabel(progress)}
				</span>
				{progress?.currentCheckId ? (
					<code
						data-testid="gate-job-check"
						className="rounded-xs border border-border px-1 type-mono text-text-muted"
					>
						{progress.currentCheckId}
					</code>
				) : null}
				<span className="ml-auto type-caption text-text-subtle">
					Updating every 2 s
				</span>
			</p>
			{share === null ? null : (
				<span
					role="progressbar"
					aria-label="Checks done"
					aria-valuemin={0}
					aria-valuemax={progress?.checksTotal}
					aria-valuenow={progress?.checksDone}
					className="h-1.5 overflow-hidden rounded-full bg-app-raised"
				>
					<span
						className="block h-full rounded-full bg-gate-pending-solid transition-[width] duration-(--duration-state) ease-avel"
						style={{ width: `${Math.round(share * 100)}%` }}
					/>
				</span>
			)}
		</div>
	);
}

function GateSkeleton() {
	return (
		<div data-testid="gate-skeleton" className="flex flex-col gap-2">
			{[0, 1, 2].map((i) => (
				<Skeleton key={i} className="h-10 w-full rounded-control" />
			))}
		</div>
	);
}

/**
 * Why the run was refused, in the error map's words, and each dispatch or
 * file it names: a dispatch links to its row on this page; a path is mono.
 */
export function GateRefusal({
	error,
	missionId,
	retry,
	retrying,
}: {
	error: ApiError;
	missionId: string;
	/** Send the same attempt again; absent when there is none. */
	retry?: () => void;
	retrying?: boolean;
}) {
	const issues = issuesOf(error);
	return (
		<div data-testid="gate-refusal" className="flex flex-col gap-2">
			<ErrorState error={error} retry={retry} retrying={retrying} />
			{issues.length > 0 ? (
				<ul
					data-testid="gate-refusal-issues"
					className="flex flex-col gap-1 pl-1"
				>
					{issues.map(({ path, message }) => {
						const [kind, id] = path.map(String);
						const key = path.join("/");
						return (
							<li
								key={key}
								className="flex flex-wrap items-center gap-2 type-small"
							>
								{kind === "dispatches" && id ? (
									<Link
										to="/missions/$id"
										params={{ id: missionId }}
										hash={`dispatch-${id}`}
										data-testid={`gate-refusal-dispatch-${id}`}
										className="text-text underline decoration-border underline-offset-2 hover:decoration-current"
									>
										A dispatch
									</Link>
								) : (
									<code
										data-testid={`gate-refusal-path-${key}`}
										className="type-mono break-all text-text"
									>
										{id ?? key}
									</code>
								)}
								<span className="text-text-muted">{message}</span>
							</li>
						);
					})}
				</ul>
			) : null}
		</div>
	);
}

/** One run: each listed gate, what it set aside, and the receipt's hash. */
export function GateReceipt({
	run,
	drafts,
	onDraft,
}: {
	run: GateRun;
	drafts: Record<string, string>;
	onDraft: (findingId: string, rationale: string) => void;
}) {
	const priors = priorChecks(run);
	return (
		<div data-testid="gate-receipt" className="flex flex-col gap-3">
			{priors.checked > 0 ? (
				<p
					data-testid="gate-prior-checks"
					data-matched={priors.matched}
					className="flex items-center gap-1.5 type-small text-text-muted"
				>
					<StatusGlyph
						tone={priors.matched > 0 ? "block" : "pass"}
						className={
							priors.matched > 0 ? "text-gate-block" : "text-gate-pass"
						}
					/>
					{priorChecksLabel(priors)}
				</p>
			) : null}
			<ul className="flex flex-col divide-y divide-border rounded-card border border-border">
				{run.gates.map((g) => (
					<GateRow
						key={g.gate}
						gate={g}
						commitSha={run.commitSha}
						drafts={drafts}
						onDraft={onDraft}
					/>
				))}
			</ul>
			{run.ignoredOverrides.length > 0 ? (
				<section
					aria-label="Overrides not applied"
					data-testid="gate-ignored"
					className="flex flex-col gap-1.5"
				>
					<h3 className="type-eyebrow">Overrides not applied</h3>
					<ul className="flex flex-col gap-1">
						{run.ignoredOverrides.map((o) => (
							<li
								key={`${o.findingId}:${o.commitSha}`}
								data-testid={`gate-ignored-${o.findingId}`}
								className="flex flex-col type-small"
							>
								<span className="type-mono break-all text-text">
									{o.findingId}
								</span>
								<span className="text-text-muted">{IGNORED_WHY[o.why]}</span>
							</li>
						))}
					</ul>
				</section>
			) : null}
			{run.excludedDispatches.length > 0 ? (
				<section
					aria-label="Dispatches not judged"
					data-testid="gate-excluded"
					className="flex flex-col gap-1.5"
				>
					<h3 className="type-eyebrow">Dispatches not judged</h3>
					<p className="type-caption text-text-muted">
						Closed without completing, so their work wasn't combined.
					</p>
					<ul className="flex flex-col gap-1">
						{run.excludedDispatches.map((d) => (
							<li
								key={d.dispatchId}
								data-testid={`gate-excluded-${d.dispatchId}`}
								className="flex items-center gap-2 type-small"
							>
								<StatusPill
									size="sm"
									tone={DISPATCH_STATUS_TONE[d.status]}
									label={DISPATCH_STATUS_LABEL[d.status]}
								/>
								<time
									dateTime={d.closedAt}
									title={d.closedAt}
									className="text-text-muted"
								>
									{`closed ${shortStamp(d.closedAt)}`}
								</time>
							</li>
						))}
					</ul>
				</section>
			) : null}
			<p className="flex flex-wrap items-center gap-1.5 type-caption text-text-subtle">
				<ShieldCheck aria-hidden="true" className="size-3.5" />
				<span>Receipt</span>
				<ShortHash
					value={run.receiptSha256}
					label="the receipt's SHA-256"
					data-testid="gate-receipt-sha"
				/>
			</p>
		</div>
	);
}

/** One gate: its policy and result, its reasons on expand. */
function GateRow({
	gate,
	commitSha,
	drafts,
	onDraft,
}: {
	gate: GateRun["gates"][number];
	commitSha: string;
	drafts: Record<string, string>;
	onDraft: (findingId: string, rationale: string) => void;
}) {
	// A blocking gate opens: what stops the ship is read first.
	const [open, setOpen] = useState(gate.result === "fail");
	const panelId = useId();
	const result = RESULT[gate.result];
	return (
		<li data-testid={`gate-row-${gate.gate}`} data-result={gate.result}>
			<button
				type="button"
				aria-expanded={open}
				aria-controls={panelId}
				data-testid={`gate-row-${gate.gate}-toggle`}
				onClick={() => setOpen((o) => !o)}
				className="flex h-10 w-full items-center gap-2.5 px-3 text-left hover:bg-app-raised"
			>
				<ChevronRight
					aria-hidden="true"
					className={cn(
						"size-3.5 shrink-0 text-text-subtle transition-transform duration-(--duration-micro) ease-avel",
						open && "rotate-90",
					)}
				/>
				<GatePolicyGlyph policy={gate.policy} className="size-4" />
				<span className="min-w-0 flex-1 truncate type-mono text-text">
					{gate.gate}
				</span>
				<span className="type-caption text-text-subtle">
					{gate.policy === "mandatory" ? "mandatory" : "warn"}
				</span>
				<StatusPill
					size="sm"
					tone={result.tone}
					label={result.label}
					data-testid={`gate-row-${gate.gate}-result`}
				/>
			</button>
			{open ? (
				<ul
					id={panelId}
					className="flex flex-col gap-2 border-t border-border bg-app-band px-3 py-2.5"
				>
					{gate.reasons.length === 0 ? (
						<li className="type-small text-text-muted">No reasons recorded.</li>
					) : (
						gate.reasons.map((reason) => (
							<ReasonRow
								key={reason.findingId}
								reason={reason}
								commitSha={commitSha}
								draft={drafts[reason.findingId]}
								onDraft={(text) => onDraft(reason.findingId, text)}
							/>
						))
					)}
				</ul>
			) : null}
		</li>
	);
}

/** One reason: what it says, the rule, its effect, severity and source. */
function ReasonRow({
	reason,
	commitSha,
	draft,
	onDraft,
}: {
	reason: GateReasonWire;
	commitSha: string;
	draft: string | undefined;
	onDraft: (text: string) => void;
}) {
	const [writing, setWriting] = useState(draft !== undefined);
	const fieldId = useId();
	const blocking = reason.effect === "block";
	return (
		<li
			data-testid={`gate-reason-${reason.findingId}`}
			data-effect={reason.effect}
			data-degraded={reason.degraded || undefined}
			className="flex flex-col gap-1"
		>
			<p className="type-small break-words text-text">{reason.message}</p>
			<p className="flex flex-wrap items-center gap-x-3 gap-y-1 type-caption text-text-muted">
				{reason.degraded ? (
					// Not installed yet: "not checked", in the stale tone, never a pass.
					<span
						data-testid={`gate-reason-${reason.findingId}-degraded`}
						className="inline-flex items-center gap-1 text-gate-stale"
					>
						<StatusGlyph tone="stale" />
						Not checked yet
					</span>
				) : (
					<span>{EFFECT_WORDS[reason.effect]}</span>
				)}
				<span>{RULE_WORDS[reason.rule]}</span>
				{reason.severity ? (
					<span data-testid={`gate-reason-${reason.findingId}-severity`}>
						{`Model: ${SEVERITY[reason.severity.model].label}`}
						{reason.severity.operator
							? `, operator: ${SEVERITY[reason.severity.operator].label}`
							: ""}
					</span>
				) : null}
				{reason.source ? (
					// A long source ends in an ellipsis, whole on hover: never wider
					// than the row at a phone's width.
					<span
						title={reason.source}
						className="min-w-0 max-w-full truncate type-mono"
					>
						{reason.source}
					</span>
				) : null}
			</p>
			{reason.overrides.length > 0 ? (
				<ul className="flex flex-col gap-0.5 type-caption text-text-muted">
					{reason.overrides.map((r) => (
						<li key={r}>{`Overridden: ${r}`}</li>
					))}
				</ul>
			) : null}
			{blocking && reason.overridable ? (
				writing ? (
					<div className="flex flex-col gap-1.5">
						<label htmlFor={fieldId} className="type-caption text-text-subtle">
							Why ship past it at this commit
						</label>
						<Textarea
							id={fieldId}
							data-testid={`gate-override-${reason.findingId}`}
							rows={2}
							value={draft ?? ""}
							onChange={(e) => onDraft(e.target.value)}
						/>
						<span className="flex flex-wrap items-center gap-x-1.5 type-caption text-text-subtle">
							<span>Holds for commit</span>
							<span className="inline-flex items-center">
								<ShortHash value={commitSha} label="the commit it holds for" />.
							</span>
							<span>Sent with the next run.</span>
						</span>
					</div>
				) : (
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="self-start"
						data-testid={`gate-override-${reason.findingId}-open`}
						onClick={() => setWriting(true)}
					>
						Override…
					</Button>
				)
			) : blocking ? (
				<Reason data-testid={`gate-reason-${reason.findingId}-no-override`}>
					An override doesn't clear this rule.
				</Reason>
			) : null}
		</li>
	);
}
