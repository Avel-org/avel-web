import { Link } from "@tanstack/react-router";
import type {
	GateReasonWire,
	GateRun,
	GateRunSummary,
} from "avel-server/contract";
import { ChevronRight, Play, ShieldCheck } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { ApiError } from "@/lib/api/errors";
import {
	type GateAttempt,
	type GateOverride,
	gateAttemptFor,
	useGateRun,
	useGateRuns,
	useRunGate,
} from "@/lib/api/gate";
import { cn } from "@/lib/utils";
import { useIsPreview } from "@/shell/auth-gate";
import { issuesOf } from "./action-modal";
import { shortStamp } from "./activity-audit";
import {
	EFFECT_WORDS,
	IGNORED_WHY,
	RESULT,
	RULE_WORDS,
	SEVERITY,
} from "./gate-copy";
import { GatePolicyGlyph } from "./gate-policy-glyph";
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
	const preview = useIsPreview();
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
						preview
							? "Sign in to run the gate"
							: runGate.isPending
								? "The gate is judging"
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
	return (
		<div data-testid="gate-receipt" className="flex flex-col gap-3">
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
									tone={d.status === "failed" ? "block" : "stale"}
									label={d.status}
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
						<span className="flex items-center gap-1.5 type-caption text-text-subtle">
							<span>Holds for commit</span>
							<ShortHash value={commitSha} label="the commit it holds for" />
							<span>. Sent with the next run.</span>
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
