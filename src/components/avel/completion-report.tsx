import { Link } from "@tanstack/react-router";
import type {
	ArtifactRef,
	Blocker,
	CompletionReport,
	CompletionStatus,
	Dispatch,
	EdgeMismatch,
	ReportFiledBy,
} from "avel-server/contract";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ActorMark, FILED_BY_ACTOR, HaltActor } from "./actor";
import { DISPATCH_STATUS_LABEL } from "./dispatch-labels";
import { HiddenId, ShortHash } from "./short-hash";
import { StatusPill, type StatusTone } from "./status-pill";
import { VersionChip } from "./version-chip";

/*
 * A completion report (module 8): how one dispatch ended, what it read and
 * wrote, and what got in its way. Unmounted until the report routes land;
 * the dispatch it closed and the producers of what it read are props, so
 * the page that mounts it owns the reads.
 */

/** The agent a dispatch ran, as the dispatch carries it. */
export type DispatchAgent = Dispatch["agent"];

/**
 * Each way a report ends, as a tone: complete passed, blocked waits on
 * someone, failed is a failure, and halted ended without failing (a limit
 * or the operator stopped it), so it reads as stale, as a closed export does.
 */
export const REPORT_STATUS_TONE = {
	complete: "pass",
	blocked: "warn",
	failed: "block",
	halted: "stale",
} as const satisfies Record<CompletionStatus, StatusTone>;

export const FILED_BY_LABEL = {
	agent: "Filed by the agent",
	system: "Filed by the runner",
} as const satisfies Record<ReportFiledBy, string>;

const n = (v: number) => v.toLocaleString("en-US");
const plural = (count: number, one: string, many: string) =>
	`${n(count)} ${count === 1 ? one : many}`;

/**
 * The tokens a report used, against the dispatch's estimate when known:
 * "12,400 of 15,000 estimated", and how far over when it went over.
 */
export function tokensAgainstEstimate(
	actual: number,
	estimated: number | undefined,
): { line: string; over: string | null } {
	if (estimated === undefined)
		return { line: plural(actual, "token", "tokens"), over: null };
	const line = `${n(actual)} of ${n(estimated)} estimated tokens`;
	return {
		line,
		over:
			actual > estimated ? `${n(actual - estimated)} over the estimate` : null,
	};
}

/** A blocker's workaround in words; the agent may have had none. */
export function workaroundText(blocker: Blocker): string {
	const text = blocker.workaround.trim();
	return text === "" ? "No workaround." : `Workaround: ${text}`;
}

// ---------------------------------------------------------------------------

function Section({
	title,
	testId,
	children,
}: {
	title: string;
	testId: string;
	children: ReactNode;
}) {
	return (
		<section data-testid={testId} className="flex flex-col gap-2">
			<h3 className="type-small font-medium text-foreground">{title}</h3>
			{children}
		</section>
	);
}

/** The agent version: linked to the agent's page, its ref and hash. */
function AgentVersion({
	report,
	agent,
}: {
	report: CompletionReport;
	agent: DispatchAgent | undefined;
}) {
	const ref = report.agentVersionRef;
	const slug = agent?.slug ?? ref?.split("@")[0];
	return (
		<div
			data-testid="report-agent-version"
			className="flex flex-wrap items-center gap-x-2 gap-y-1 type-small text-text-muted"
		>
			{slug ? (
				<Link
					to="/catalog/agents/$slug"
					params={{ slug }}
					data-testid="report-agent-link"
					className="py-1.5 -my-1.5 font-medium text-foreground underline-offset-4 hover:underline"
				>
					{agent?.name ?? slug}
				</Link>
			) : (
				<span className="font-medium text-foreground">Agent</span>
			)}
			<VersionChip
				versionRef={ref}
				source={report.versionSource}
				data-testid="report-version"
			/>
			<ShortHash
				value={report.agentVersionSha256}
				label={`the hash of ${ref ?? "the agent version"}`}
				data-testid="report-agent-hash"
			/>
			<span className="type-caption">
				Model <span className="type-mono">{report.model}</span>
			</span>
		</div>
	);
}

function ArtifactList({
	artifacts,
	testId,
	verb,
}: {
	artifacts: readonly ArtifactRef[];
	testId: string;
	verb: string;
}) {
	if (artifacts.length === 0)
		return (
			<p data-testid={`${testId}-none`} className="type-small text-text-muted">
				Nothing {verb}.
			</p>
		);
	return (
		<ul data-testid={testId} className="flex flex-col gap-1">
			{artifacts.map((a, i) => (
				<li
					key={`${a.path}:${a.sha256}`}
					data-testid={`${testId}-${i}`}
					className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5"
				>
					<span className="type-mono break-all text-foreground">{a.path}</span>
					<ShortHash value={a.sha256} label={`the hash of ${a.path}`} />
				</li>
			))}
		</ul>
	);
}

function BlockerItem({ blocker, index }: { blocker: Blocker; index: number }) {
	const testId = `report-blocker-${index}`;
	return (
		<li
			data-testid={testId}
			data-provisioning-gap={blocker.provisioningGap || undefined}
			className={cn(
				"flex flex-col gap-1 rounded-card border px-3 py-2",
				blocker.provisioningGap ? "border-gate-warn-line" : "border-border",
			)}
		>
			{blocker.provisioningGap ? (
				<StatusPill
					tone="warn"
					size="sm"
					label="Provisioning gap"
					data-testid={`${testId}-gap`}
				/>
			) : null}
			<p className="type-small text-foreground">{blocker.description}</p>
			{blocker.provisioningGap ? (
				<p className="type-caption text-gate-warn">
					Something the agent needed was not provided. Provide it, then run the
					agent again.
				</p>
			) : null}
			<p
				data-testid={`${testId}-workaround`}
				className="type-caption text-text-muted"
			>
				{workaroundText(blocker)}
			</p>
		</li>
	);
}

/**
 * "Read src/a.ts at abc1234, but Leon wrote def5678": the producer's agent
 * by name, or "the agent that wrote it" behind its dispatch id when the
 * mounting page could not name it.
 */
function MismatchItem({
	mismatch,
	index,
	producer,
}: {
	mismatch: EdgeMismatch;
	index: number;
	producer: DispatchAgent | undefined;
}) {
	const testId = `report-mismatch-${index}`;
	return (
		<li
			data-testid={testId}
			className="flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-card border border-gate-block-line bg-gate-block-soft px-3 py-2 type-small text-foreground"
		>
			<span>Read</span>
			<span className="type-mono break-all">{mismatch.path}</span>
			<span>at</span>
			<ShortHash
				value={mismatch.readSha256}
				label={`the hash read of ${mismatch.path}`}
				data-testid={`${testId}-read`}
			/>
			<span>, but</span>
			{producer ? (
				<Link
					to="/catalog/agents/$slug"
					params={{ slug: producer.slug }}
					data-testid={`${testId}-producer`}
					className="py-1.5 -my-1.5 font-medium underline-offset-4 hover:underline"
				>
					{producer.name}
				</Link>
			) : (
				<HiddenId
					id={mismatch.producerDispatchId}
					label="the producing dispatch's id"
					data-testid={`${testId}-producer`}
				>
					the agent that wrote it
				</HiddenId>
			)}
			<span>wrote</span>
			<ShortHash
				value={mismatch.writtenSha256}
				label={`the hash written of ${mismatch.path}`}
				data-testid={`${testId}-written`}
			/>
		</li>
	);
}

/**
 * One completion report. `dispatch` is the dispatch it closed, for the
 * estimate and the agent's name; `producers` names the agent of each
 * dispatch an edge mismatch points at, keyed by dispatch id.
 */
export function CompletionReportView({
	report,
	dispatch,
	producers = {},
	"data-testid": testId = "completion-report",
}: {
	report: CompletionReport;
	dispatch?: Pick<Dispatch, "agent" | "estimatedTokens">;
	producers?: Readonly<Record<string, DispatchAgent>>;
	"data-testid"?: string;
}) {
	const tokens = tokensAgainstEstimate(
		report.actualTokens,
		dispatch?.estimatedTokens,
	);
	const {
		artifactsRead,
		artifactsWritten,
		blockers,
		edgeMismatches,
		fileTypesTouched,
	} = report;
	return (
		<article
			data-testid={testId}
			data-status={report.status}
			className="flex flex-col gap-5"
		>
			<header className="flex flex-col gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<StatusPill
						tone={REPORT_STATUS_TONE[report.status]}
						label={DISPATCH_STATUS_LABEL[report.status]}
						data-testid="report-status"
					/>
					{report.status === "halted" && report.haltReason ? (
						<HaltActor
							reason={report.haltReason}
							data-testid="report-halt-reason"
						/>
					) : null}
					<span className="inline-flex items-center gap-1.5">
						<ActorMark
							kind={FILED_BY_ACTOR[report.filedBy]}
							name={dispatch?.agent.name}
							data-testid="report-filed-by-mark"
						/>
						<span
							data-testid="report-filed-by"
							className="type-caption text-text-muted"
						>
							{FILED_BY_LABEL[report.filedBy]}
						</span>
					</span>
				</div>
				<AgentVersion report={report} agent={dispatch?.agent} />
			</header>

			{edgeMismatches.length > 0 ? (
				<Section
					title={`Read a different version than was written (${edgeMismatches.length})`}
					testId="report-mismatches"
				>
					<ul className="flex flex-col gap-1.5">
						{edgeMismatches.map((m, i) => (
							<MismatchItem
								key={`${m.path}:${m.producerDispatchId}`}
								mismatch={m}
								index={i}
								producer={producers[m.producerDispatchId]}
							/>
						))}
					</ul>
				</Section>
			) : null}

			{blockers.length > 0 ? (
				<Section
					title={`Blockers (${blockers.length})`}
					testId="report-blockers"
				>
					<ul className="flex flex-col gap-1.5">
						{blockers.map((b, i) => (
							<BlockerItem
								// Blockers have no id; their order is the agent's.
								// biome-ignore lint/suspicious/noArrayIndexKey: a fixed list
								key={i}
								blocker={b}
								index={i}
							/>
						))}
					</ul>
				</Section>
			) : null}

			<Section title="Tokens" testId="report-tokens">
				<p className="type-small text-foreground">
					<span data-testid="report-tokens-line" className="tabular-nums">
						{tokens.line}
					</span>
					{tokens.over ? (
						<span
							data-testid="report-tokens-over"
							className="ml-2 type-caption text-gate-warn"
						>
							{tokens.over}
						</span>
					) : null}
				</p>
				{report.softCeilingCrossed ? (
					<p
						data-testid="report-soft-ceiling"
						className="type-caption text-gate-warn"
					>
						Went past its soft token limit.
					</p>
				) : null}
			</Section>

			<Section title="Artifacts" testId="report-artifacts">
				<div className="grid gap-4 md:grid-cols-2">
					<div className="flex flex-col gap-1.5">
						<h4 className="type-caption text-text-subtle">
							{`Read (${artifactsRead.length})`}
						</h4>
						<ArtifactList
							artifacts={artifactsRead}
							testId="report-read"
							verb="read"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<h4 className="type-caption text-text-subtle">
							{`Written (${artifactsWritten.length})`}
						</h4>
						<ArtifactList
							artifacts={artifactsWritten}
							testId="report-written"
							verb="written"
						/>
					</div>
				</div>
			</Section>

			<Section title="Footprint" testId="report-footprint">
				<p className="type-small text-foreground">
					<span data-testid="report-files-touched">
						{plural(report.filesTouched, "file touched", "files touched")}
					</span>
					{", "}
					<span data-testid="report-rereads">
						{plural(report.rereads, "reread", "rereads")}
					</span>
				</p>
				{fileTypesTouched.length > 0 ? (
					<ul data-testid="report-file-types" className="flex flex-wrap gap-1">
						{fileTypesTouched.map((t) => (
							<li
								key={t}
								className="rounded-xs border border-border px-1.5 type-mono text-text-muted"
							>
								{t}
							</li>
						))}
					</ul>
				) : null}
			</Section>
		</article>
	);
}
