import { Link } from "@tanstack/react-router";
import type {
	ExportStatus,
	MissionDetail,
	needsYouReason,
} from "avel-server/contract";
import { ArrowLeft, Copy } from "lucide-react";
import type { ReactNode } from "react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import type { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { ClientName, MissionStatusPill } from "./mission-columns";
import { useMission } from "./mission-data";
import { Brief, RecentActivity } from "./mission-details";
import { MissionRowsSkeleton } from "./mission-panels";
import {
	MISSING_ROUTE,
	type SampleStageState,
	sampleExports,
	sampleHaltReason,
	sampleSpend,
	sampleStages,
	sampleTeam,
} from "./mission-placeholders";
import { ORIGIN_LABEL } from "./mission-search";
import {
	EXPORT_PHASE,
	QUIET_AFTER_DAYS,
	quietDays,
	quietText,
} from "./mission-watch";
import { SampleData } from "./sample-data";
import { SectionPanel } from "./section-panel";
import {
	exportStatusTone,
	StatusGlyph,
	StatusPill,
	type StatusTone,
} from "./status-pill";
import { ErrorState, type ErrorStateProps, Surface } from "./surface";

type NeedsYouReason = z.infer<typeof needsYouReason>;

/*
 * The full page for one mission (ROUTES.md, /missions/:id). Everything the
 * contract returns is shown as it is. Where avel-server has no route yet,
 * the section shows labelled sample data instead (AVEL-DESIGN.md ruling 29),
 * from mission-placeholders.ts, under a dashed "Sample data" pill that names
 * the route it waits for. A real value and a sample never share a field.
 */

// ---------------------------------------------------------------------------
// Pure rules, tested directly.

/** A time span in short form: "45m", "2h", "3d". */
export function shortDuration(ms: number): string {
	const minutes = Math.max(0, Math.floor(ms / 60_000));
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 48) return `${hours}h`;
	return `${Math.floor(hours / 24)}d`;
}

/** The banner's words for each needs-you reason. Keyed on the contract's union. */
export const NEEDS_YOU_BANNER = {
	export_previewed: "Preview ready for your approval",
	pr_open: "Pull request open",
} as const satisfies Record<NeedsYouReason, string>;

export type Now =
	| { kind: "needs-you"; text: string }
	| { kind: "halted"; text: string }
	| { kind: "in-flight"; text: string }
	| { kind: "quiet"; text: string };

/**
 * The one line that says what matters now, by priority: the operator's turn,
 * a halt, a delivery moving, a quiet mission. Null when none applies.
 */
export function nowBanner(mission: MissionDetail, now: number): Now | null {
	if (mission.needsYou) {
		return {
			kind: "needs-you",
			text: NEEDS_YOU_BANNER[mission.needsYou.reason],
		};
	}
	if (mission.status === "halted") {
		return { kind: "halted", text: "This mission is halted." };
	}
	const last = mission.lastExport;
	if (last && EXPORT_PHASE[last.status] === "moving") {
		const status = last.status.charAt(0).toUpperCase() + last.status.slice(1);
		return {
			kind: "in-flight",
			text: `${status} for ${shortDuration(now - Date.parse(last.statusChangedAt))}`,
		};
	}
	if (mission.status === "active") {
		const days = quietDays(mission.lastActivityAt, now);
		if (days === null || days >= QUIET_AFTER_DAYS) {
			return { kind: "quiet", text: quietText(mission.lastActivityAt, now) };
		}
	}
	return null;
}

/** Where a stage stands, in a glyph and a word. */
export type StageState =
	| "done"
	| "current"
	| "waiting-on-you"
	| "not-started"
	| "failed"
	| "closed";

const STAGE: Record<StageState, { tone: StatusTone; label: string }> = {
	done: { tone: "pass", label: "Done" },
	current: { tone: "pending", label: "In progress" },
	"waiting-on-you": { tone: "warn", label: "Waiting on you" },
	"not-started": { tone: "stale", label: "Not started" },
	failed: { tone: "block", label: "Failed" },
	closed: { tone: "stale", label: "Closed" },
};

/**
 * Verify and Ship, read from the real last export's status. Keyed on the
 * contract's union, so a new status fails the build until it is placed.
 */
export const DELIVERY_STAGES = {
	pending: { verify: "not-started", ship: "not-started" },
	rendering: { verify: "current", ship: "not-started" },
	verifying: { verify: "current", ship: "not-started" },
	previewing: { verify: "current", ship: "not-started" },
	previewed: { verify: "waiting-on-you", ship: "not-started" },
	delivering: { verify: "done", ship: "current" },
	"pr-open": { verify: "done", ship: "waiting-on-you" },
	done: { verify: "done", ship: "done" },
	closed: { verify: "done", ship: "closed" },
	failed: { verify: "failed", ship: "not-started" },
} as const satisfies Record<
	ExportStatus,
	{ verify: StageState; ship: StageState }
>;

export function deliveryStages(status: ExportStatus | undefined): {
	verify: StageState;
	ship: StageState;
} {
	return status
		? DELIVERY_STAGES[status]
		: { verify: "not-started", ship: "not-started" };
}

// ---------------------------------------------------------------------------
// Pieces.

// The sample pill lives in sample-data.tsx, shared with the catalog pages.
export { SampleData };

/** A sample stage in the track's words: "waiting" is "not started". */
const fromSample = (state: SampleStageState): StageState =>
	state === "waiting" ? "not-started" : state;

function Stage({ name, state }: { name: string; state: StageState }) {
	const { tone, label } = STAGE[state];
	return (
		<li
			data-testid={`mission-stage-${name.toLowerCase()}`}
			data-state={state}
			className="flex min-w-0 flex-1 flex-col gap-1"
		>
			<span
				className={cn(
					"h-1 rounded-full",
					state === "done"
						? "bg-gate-pass"
						: state === "failed"
							? "bg-gate-block"
							: state === "current" || state === "waiting-on-you"
								? "bg-accent"
								: "bg-border-strong",
				)}
			/>
			<span className="type-small font-medium text-foreground">{name}</span>
			<span className="inline-flex items-center gap-1 type-caption text-text-muted">
				<StatusGlyph tone={tone} />
				{label}
			</span>
		</li>
	);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-0.5">
			<dt className="type-caption text-text-subtle">{label}</dt>
			<dd className="min-w-0 break-words type-small text-foreground">
				{children}
			</dd>
		</div>
	);
}

// ---------------------------------------------------------------------------
// The page.

export function MissionPage({ id }: { id: string }) {
	const mission = useMission(id);
	return (
		<Surface
			data-testid="mission-page"
			query={mission}
			loading={<MissionRowsSkeleton rows={6} testId="mission-page-skeleton" />}
			// A mission is never "empty": it exists, or it is not found.
			empty={null}
			isEmpty={() => false}
			error={MissionPageError}
		>
			{(detail) => <MissionContent mission={detail} now={Date.now()} />}
		</Surface>
	);
}

/** The error map's copy, and a way back for a mission that is gone. */
function MissionPageError(props: ErrorStateProps<ApiError>) {
	const failure = props.error.failure;
	const notFound = failure.kind === "contract" && failure.code === "NOT_FOUND";
	return (
		<div className="flex flex-col gap-3">
			<ErrorState {...props} />
			{notFound ? (
				<Button asChild variant="outline" size="sm" className="self-start">
					<Link to="/missions" data-testid="mission-page-back">
						<ArrowLeft aria-hidden="true" />
						Back to missions
					</Link>
				</Button>
			) : null}
		</div>
	);
}

function MissionContent({
	mission,
	now,
}: {
	mission: MissionDetail;
	now: number;
}) {
	return (
		<div data-testid="mission-page-content" className="flex flex-col gap-4">
			<Header mission={mission} />
			<NowBanner mission={mission} now={now} />
			<ProgressTrack mission={mission} />
			<div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
				<div className="flex min-w-0 flex-col gap-4">
					<Exports mission={mission} now={now} />
					<SectionPanel
						title="Activity"
						data-testid="mission-section-activity-page"
						actions={
							<Button
								variant="ghost"
								size="sm"
								data-testid="mission-activity-full-log"
								disabledReason="Needs per-mission activity paging"
							>
								Full log
							</Button>
						}
					>
						<RecentActivity mission={mission} now={now} />
					</SectionPanel>
				</div>
				<div className="flex min-w-0 flex-col gap-4">
					<Repository mission={mission} />
					<Team mission={mission} />
					<SectionPanel
						title="Playbook"
						data-testid="mission-section-playbook-page"
					>
						{mission.playbook ? (
							<dl className="flex flex-col gap-2">
								<Field label="Name">{mission.playbook.name}</Field>
								<Field label="Mission type">
									<span className="type-mono-small">
										{mission.playbook.missionType}
									</span>
								</Field>
							</dl>
						) : (
							<p className="type-small text-text-subtle">
								No live playbook for this mission type.
							</p>
						)}
					</SectionPanel>
					<Spend mission={mission} />
					<SectionPanel title="Brief" data-testid="mission-section-brief-page">
						<Brief brief={mission.brief} />
					</SectionPanel>
				</div>
			</div>
		</div>
	);
}

function Header({ mission }: { mission: MissionDetail }) {
	return (
		<header
			data-testid="mission-page-header"
			className="surface-steel flex flex-col gap-3 rounded-md border border-border bg-card p-4"
		>
			<div className="flex flex-wrap items-center gap-2">
				<span className="type-mono text-foreground" title={mission.id}>
					{mission.id}
				</span>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Copy mission id"
					data-testid="mission-page-copy-id"
					onClick={() => navigator.clipboard?.writeText(mission.id)}
				>
					<Copy aria-hidden="true" />
				</Button>
				<MissionStatusPill status={mission.status} />
			</div>
			<p className="flex flex-wrap items-center gap-x-2 type-h2 text-foreground">
				{mission.client ? (
					<>
						<ClientName mission={mission} />
						<span aria-hidden="true" className="text-text-subtle">
							→
						</span>
						<span className="sr-only">, engagement </span>
						<span>{mission.engagement?.name ?? "No engagement"}</span>
					</>
				) : (
					<span>Internal</span>
				)}
			</p>
			<dl className="flex flex-wrap gap-x-6 gap-y-2">
				<Field label="Type">
					<span className="type-mono-small">{mission.type}</span>
				</Field>
				<Field label="Sprint">
					<span className="type-mono-small">{mission.sprintN}</span>
				</Field>
				<Field label="Origin">{ORIGIN_LABEL[mission.origin]}</Field>
			</dl>
		</header>
	);
}

function NowBanner({ mission, now }: { mission: MissionDetail; now: number }) {
	const banner = nowBanner(mission, now);
	if (!banner) return null;
	return (
		<section
			aria-label="Now"
			data-testid="mission-now"
			data-kind={banner.kind}
			className={cn(
				"flex flex-wrap items-center gap-3 rounded-md border px-4 py-3",
				banner.kind === "needs-you"
					? "border-gate-warn-line bg-gate-warn-soft"
					: banner.kind === "halted"
						? "border-gate-block-line bg-gate-block-soft"
						: "border-border bg-card",
			)}
		>
			<span className="type-body font-medium text-foreground">
				{banner.text}
			</span>
			{banner.kind === "halted" ? (
				// The reason is its own field: a sample, never mixed into the real
				// status beside it.
				<span
					data-testid="mission-now-halt-reason"
					className="flex items-center gap-2 type-small text-text-muted"
				>
					{sampleHaltReason(mission.id)}
					<SampleData missing={MISSING_ROUTE.haltReason} />
				</span>
			) : null}
			{banner.kind === "needs-you" ? (
				<Button
					size="sm"
					className="ml-auto"
					data-testid="mission-now-open-export"
					disabledReason="Needs the export routes"
				>
					Open export
				</Button>
			) : null}
		</section>
	);
}

function ProgressTrack({ mission }: { mission: MissionDetail }) {
	const early = sampleStages(mission.id, mission.lastExport !== null);
	const late = deliveryStages(mission.lastExport?.status);
	return (
		<section
			aria-label="Progress"
			data-testid="mission-progress"
			className="surface-steel flex flex-col gap-3 rounded-md border border-border bg-card p-4 md:flex-row md:items-start"
		>
			<div
				data-testid="mission-progress-early"
				className="flex min-w-0 flex-[3] flex-col gap-2 rounded-sm border border-dashed border-border p-2"
			>
				<SampleData missing={MISSING_ROUTE.stages} />
				<ol className="flex gap-3">
					<Stage name="Plan" state={fromSample(early.plan)} />
					<Stage name="Assemble" state={fromSample(early.assemble)} />
					<Stage name="Execute" state={fromSample(early.execute)} />
				</ol>
			</div>
			<div
				data-testid="mission-progress-delivery"
				className="flex min-w-0 flex-[2] p-2"
			>
				<ol className="flex w-full gap-3">
					<Stage name="Verify" state={late.verify} />
					<Stage name="Ship" state={late.ship} />
				</ol>
			</div>
		</section>
	);
}

function Exports({ mission, now }: { mission: MissionDetail; now: number }) {
	const last = mission.lastExport;
	return (
		<SectionPanel title="Exports" data-testid="mission-section-exports">
			{/* The newest export is real: the contract's lastExport. */}
			<ul className="flex flex-col">
				{last ? (
					<li
						data-testid="mission-export-latest"
						className="flex flex-wrap items-center gap-3 py-2"
					>
						<StatusPill
							size="sm"
							tone={exportStatusTone(last.status)}
							label={last.status}
						/>
						<span className="type-mono-small text-text-subtle">
							{last.targetKind}
						</span>
						<span className="type-caption text-text-muted">
							{`In ${last.status} for ${shortDuration(now - Date.parse(last.statusChangedAt))}`}
						</span>
					</li>
				) : (
					<li className="py-2 type-small text-text-subtle">No export yet.</li>
				)}
			</ul>
			<div
				data-testid="mission-exports-earlier"
				className="mt-3 flex flex-col gap-2 rounded-sm border border-dashed border-border p-2"
			>
				<SampleData missing={MISSING_ROUTE.exports} />
				<ul className="flex flex-col divide-y divide-border">
					{sampleExports(mission.id).map((sample) => (
						<li
							key={sample.id}
							data-testid="mission-export-sample"
							className="flex flex-wrap items-center gap-3 py-2 opacity-80"
						>
							<StatusPill
								size="sm"
								tone={exportStatusTone(sample.status)}
								label={sample.status}
							/>
							<span className="type-mono-small text-text-subtle">
								{sample.targetKind}
							</span>
							<span className="type-caption text-text-muted">
								{`${sample.hoursInStage}h in ${sample.status}`}
							</span>
							<span className="ml-auto flex items-center gap-1.5">
								{sample.gates.map((gate) => (
									<span
										key={gate.name}
										title={`${gate.name}: ${gate.verdict}${gate.attested ? ", attested" : ""}`}
										className="inline-flex"
									>
										<StatusGlyph tone={gate.verdict} attested={gate.attested} />
										<span className="sr-only">
											{`${gate.name} ${gate.verdict}${gate.attested ? ", attested" : ""}`}
										</span>
									</span>
								))}
							</span>
						</li>
					))}
				</ul>
			</div>
		</SectionPanel>
	);
}

function Repository({ mission }: { mission: MissionDetail }) {
	return (
		<SectionPanel
			title="Repository and cut"
			data-testid="mission-section-repository"
		>
			<dl className="flex flex-col gap-2">
				<Field label="Repository">
					<a
						href={mission.repoUrl}
						target="_blank"
						rel="noreferrer"
						className="type-mono-small break-all text-accent-text underline-offset-4 hover:underline"
					>
						{mission.repoUrl}
					</a>
				</Field>
				<Field label="Cut">
					<span className="type-mono-small">{mission.cut}</span>
					<span className="text-text-subtle">{` (${mission.cutSource})`}</span>
				</Field>
				{mission.cutRationale ? (
					<Field label="Why the cut was overridden">
						{mission.cutRationale}
					</Field>
				) : null}
			</dl>
		</SectionPanel>
	);
}

function Team({ mission }: { mission: MissionDetail }) {
	const { agents, active } = mission.roster;
	return (
		<SectionPanel title="Team" data-testid="mission-section-team">
			<p className="type-small text-text-muted">
				<span className="type-mono text-foreground">{agents}</span>{" "}
				{agents === 1 ? "agent" : "agents"},{" "}
				<span className="type-mono text-foreground">{active}</span> active
			</p>
			{agents > 0 ? (
				<div
					data-testid="mission-team-entries"
					className="mt-3 flex flex-col gap-2 rounded-sm border border-dashed border-border p-2"
				>
					<SampleData missing={MISSING_ROUTE.team} />
					<ul className="flex flex-col gap-1">
						{sampleTeam(mission.id, agents, active).map((entry) => (
							<li
								key={entry.role}
								className="flex items-center justify-between gap-2"
							>
								<span className="type-small text-foreground">{entry.role}</span>
								<span className="flex items-center gap-2">
									<span className="type-mono-small text-text-subtle">
										{entry.agent}
									</span>
									<span className="type-caption text-text-muted">
										{entry.active ? "Active" : "Idle"}
									</span>
								</span>
							</li>
						))}
					</ul>
				</div>
			) : null}
		</SectionPanel>
	);
}

function Spend({ mission }: { mission: MissionDetail }) {
	const ceiling = mission.spendCeilingUsd;
	const spent = sampleSpend(mission.id, ceiling);
	const share = ceiling ? Math.min(1, spent / ceiling) : null;
	return (
		<SectionPanel title="Spend" data-testid="mission-section-spend-page">
			<dl className="flex flex-col gap-2">
				<Field label="Ceiling">
					{ceiling === null ? (
						<span className="text-text-subtle">None set</span>
					) : (
						<span className="type-mono">{`$${ceiling.toFixed(2)}`}</span>
					)}
				</Field>
			</dl>
			<div
				data-testid="mission-spend-meter"
				className="mt-3 flex flex-col gap-2 rounded-sm border border-dashed border-border p-2"
			>
				<SampleData missing={MISSING_ROUTE.spend} />
				<span className="type-small text-text-muted">
					<span className="type-mono text-foreground">{`$${spent.toFixed(2)}`}</span>
					{" spent"}
				</span>
				{share !== null ? (
					<div className="h-1.5 overflow-hidden rounded-full bg-border">
						{/* The native meter speaks; the bar beside it only shows. */}
						<meter
							className="sr-only"
							aria-label="Sample spend against the ceiling"
							min={0}
							max={1}
							value={share}
						/>
						<div
							className={cn(
								"h-full rounded-full",
								share >= 0.9 ? "bg-gate-warn" : "bg-accent",
							)}
							aria-hidden="true"
							style={{ width: `${share * 100}%` }}
						/>
					</div>
				) : null}
			</div>
		</SectionPanel>
	);
}
