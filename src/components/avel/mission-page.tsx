import { Link } from "@tanstack/react-router";
import type {
	MissionDetail,
	needsYouReason,
	RosterEntry,
} from "avel-server/contract";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiError } from "@/lib/api/errors";
import { entryName, useRoster, waveTitle } from "@/lib/api/roster";
import { cn } from "@/lib/utils";
import { MissionSpendBar } from "./dispatch-budget";
import { FindingsPanel } from "./findings-panel";
import { GatePanel } from "./gate-panel";
import {
	EXPORT_LIFECYCLE,
	EXPORT_STATUS_LABEL,
	Lifecycle,
	MISSION_LIFECYCLE,
} from "./lifecycle";
import { ClientName, MissionStatusPill } from "./mission-columns";
import { useMission } from "./mission-data";
import { Brief, RecentActivity } from "./mission-details";
import { MissionDispatches } from "./mission-dispatches";
import { MissionRowsSkeleton } from "./mission-panels";
import {
	MISSING_ROUTE,
	sampleExports,
	sampleHaltReason,
} from "./mission-placeholders";
import { ORIGIN_LABEL } from "./mission-search";
import { MissionStartLive } from "./mission-start";
import {
	EXPORT_PHASE,
	QUIET_AFTER_DAYS,
	quietDays,
	quietText,
} from "./mission-watch";
import { PanelFooter } from "./panel-footer";
import { PlanLink } from "./plan-page";
import { PlanReadiness } from "./plan-readiness";
import { UnblockCard } from "./plan-unblock";
import { SampleData } from "./sample-data";
import { SectionPanel } from "./section-panel";
import { HiddenId } from "./short-hash";
import { SpendLimitControl } from "./spend-limit";
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

// ---------------------------------------------------------------------------
// Pieces.

// The sample pill lives in sample-data.tsx, shared with the catalog pages.
export { SampleData };

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
	// The page's own read, shared by key: the footers of the panels drawn
	// from the mission's record say when it was read.
	const record = useMission(mission.id);
	const readAge = (testId: string) => (
		<PanelFooter data-testid={testId} queries={[record]} />
	);
	// The dashboard's two stacks (missions-dashboard.tsx): the mission and its
	// work in the main 8 columns, its facts in the side 4. On a phone they
	// stack, main first.
	return (
		<div
			data-testid="mission-page-content"
			className="flex min-w-0 flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start"
		>
			<div
				data-testid="mission-page-main"
				className="flex min-w-0 flex-col gap-4 lg:col-span-8"
			>
				<Header mission={mission} now={now} />
				<UnblockCard mission={mission} />
				{/* Module 9: the gate's runs, then the findings it raised. */}
				<GatePanel missionId={mission.id} />
				<FindingsPanel missionId={mission.id} />
				<MissionDispatches mission={mission} now={now} />
				<SectionPanel
					title="Brief"
					data-testid="mission-section-brief-page"
					actions={<PlanLink missionId={mission.id} />}
				>
					<PlanReadiness missionId={mission.id} compact />
					<Brief brief={mission.brief} />
				</SectionPanel>
			</div>
			<div
				data-testid="mission-page-side"
				className="flex min-w-0 flex-col gap-4 lg:col-span-4"
			>
				<Spend mission={mission} />
				<Team mission={mission} />
				<SectionPanel
					title="Playbook"
					data-testid="mission-section-playbook-page"
					actions={
						// Always: the mission's playbook page also shows its template
						// and says so when no playbook matches.
						<Button asChild variant="ghost" size="sm">
							<Link
								to="/missions/$id/playbook"
								params={{ id: mission.id }}
								data-testid="mission-playbook-open"
							>
								Open
								<ArrowUpRight aria-hidden="true" />
							</Link>
						</Button>
					}
				>
					{mission.playbook ? (
						<dl className="flex flex-col gap-2">
							<Field label="Name">{mission.playbook.name}</Field>
							<Field label="Mission type">
								<span className="type-mono">
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
				<Repository mission={mission} />
				<Exports
					mission={mission}
					now={now}
					footer={readAge("mission-exports-read-age")}
				/>
				<SectionPanel
					title="Activity"
					data-testid="mission-section-activity-page"
					footer={readAge("mission-activity-read-age")}
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
		</div>
	);
}

function Header({ mission, now }: { mission: MissionDetail; now: number }) {
	return (
		<header
			data-testid="mission-page-header"
			className="flex flex-col gap-3 p-4 rounded-card border border-border bg-app-panel shadow-card"
		>
			<div className="flex flex-wrap items-center gap-2">
				<MissionStatusPill status={mission.status} />
				{/* Never shown as text: kept on hover and behind Copy, for support. */}
				<HiddenId
					id={mission.id}
					label="the mission id"
					data-testid="mission-page-id"
				>
					<span className="type-caption text-text-subtle">Mission id</span>
				</HiddenId>
			</div>
			<Lifecycle
				spec={MISSION_LIFECYCLE}
				current={mission.status}
				label="Mission lifecycle"
				data-testid="mission-lifecycle"
			/>
			<NowBanner mission={mission} now={now} />
			<p className="flex flex-wrap items-center gap-x-2 type-page text-foreground">
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
					<span className="type-mono">{mission.type}</span>
				</Field>
				<Field label="Sprint">
					<span className="type-mono">{mission.sprintN}</span>
				</Field>
				<Field label="Origin">{ORIGIN_LABEL[mission.origin]}</Field>
			</dl>
			{/* Start on a draft, with what stops it; Halt while active. */}
			<MissionStartLive mission={mission} />
		</header>
	);
}

const NOW_TONE = {
	"needs-you": "warn",
	halted: "block",
	"in-flight": "pending",
	quiet: "pending",
} as const satisfies Record<Now["kind"], StatusTone>;

const NOW_TEXT = {
	"needs-you": "text-gate-warn",
	halted: "text-gate-block",
	"in-flight": "text-gate-pending",
	quiet: "text-text-subtle",
} as const satisfies Record<Now["kind"], string>;

function NowBanner({ mission, now }: { mission: MissionDetail; now: number }) {
	const banner = nowBanner(mission, now);
	if (!banner) return null;
	// A slim v3 .banner inside the header, under the lifecycle. Only the
	// operator's turn warns and a halt blocks; a delivery moving or a quiet
	// mission is news, not a warning, so it stays neutral.
	return (
		<section
			aria-label="Now"
			data-testid="mission-now"
			data-kind={banner.kind}
			className={cn(
				"flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-control border px-3 py-2",
				banner.kind === "needs-you"
					? "border-gate-warn-line bg-gate-warn-banner"
					: banner.kind === "halted"
						? "border-gate-block-line bg-gate-block-soft"
						: "border-border bg-app-band",
			)}
		>
			<StatusGlyph
				tone={NOW_TONE[banner.kind]}
				className={NOW_TEXT[banner.kind]}
			/>
			<span
				className={cn(
					"type-small",
					banner.kind === "needs-you" || banner.kind === "halted"
						? "font-medium text-foreground"
						: "text-text-muted",
				)}
			>
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
				// v3 UX 7: the action sits at the end, or wraps under the text on
				// a phone, aligned right.
				<div
					data-testid="mission-now-actions"
					className="ml-auto flex shrink-0 items-center gap-2.5 max-sm:basis-full max-sm:justify-end"
				>
					<Button
						size="sm"
						data-testid="mission-now-open-export"
						disabledReason="Needs the export routes"
					>
						Open export
					</Button>
				</div>
			) : null}
		</section>
	);
}

function Exports({
	mission,
	now,
	footer,
}: {
	mission: MissionDetail;
	now: number;
	footer: ReactNode;
}) {
	const last = mission.lastExport;
	return (
		<SectionPanel
			title="Exports"
			data-testid="mission-section-exports"
			footer={footer}
		>
			{/* The newest export is real: the contract's lastExport. */}
			<ul className="flex flex-col">
				{last ? (
					<li
						data-testid="mission-export-latest"
						className="flex flex-col gap-3 py-2"
					>
						<span className="flex flex-wrap items-center gap-3">
							<StatusPill
								size="sm"
								tone={exportStatusTone(last.status)}
								label={EXPORT_STATUS_LABEL[last.status]}
							/>
							<span className="type-mono text-text-subtle">
								{last.targetKind}
							</span>
							<span className="type-caption text-text-muted">
								{`In ${last.status} for ${shortDuration(now - Date.parse(last.statusChangedAt))}`}
							</span>
						</span>
						<Lifecycle
							spec={EXPORT_LIFECYCLE}
							current={last.status}
							label="Export lifecycle"
							data-testid="mission-export-lifecycle"
						/>
					</li>
				) : (
					<li className="py-2 type-small text-text-subtle">No export yet.</li>
				)}
			</ul>
			<div
				data-testid="mission-exports-earlier"
				className="mt-3 flex flex-col gap-2 rounded-control border border-dashed border-border p-2"
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
							<span className="type-mono text-text-subtle">
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

/**
 * A repository as Connections names it: owner/repo for GitHub, the address
 * without its scheme otherwise. The full URL stays the link and its title.
 */
export function repoLabel(url: string): string {
	try {
		const { host, pathname } = new URL(url);
		const path = pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/, "");
		return host === "github.com" && path
			? path
			: `${host}${pathname}`.replace(/\/+$/, "");
	} catch {
		return url;
	}
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
						title={mission.repoUrl}
						data-testid="mission-repo-link"
						className="py-1.5 -my-1.5 type-mono break-all text-accent-text underline-offset-4 hover:underline"
					>
						{repoLabel(mission.repoUrl)}
					</a>
				</Field>
				<Field label="Cut">
					<span className="type-mono">{mission.cut}</span>
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
		<SectionPanel
			title="Team"
			data-testid="mission-section-team"
			// Mounted with the list, so an empty team starts no roster read.
			footer={agents > 0 ? <RosterReadAge missionId={mission.id} /> : undefined}
			actions={
				// The roster is built on the loadout screen; the overview links there.
				<Button asChild variant="ghost" size="sm">
					<Link
						to="/missions/$id/roster"
						params={{ id: mission.id }}
						data-testid="mission-loadout-open"
					>
						Loadout
						<ArrowUpRight aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<p className="type-small text-text-muted">
				<span className="type-mono text-foreground">{agents}</span>{" "}
				{agents === 1 ? "agent" : "agents"},{" "}
				<span className="type-mono text-foreground">{active}</span> active
			</p>
			{agents > 0 ? <TeamRoster missionId={mission.id} /> : null}
		</SectionPanel>
	);
}

/**
 * The roster, read only once the mission counts an agent: mounted then, so
 * an empty team starts no read. The loadout's own cache entry, so an edit
 * there shows here at once.
 */
/** The read age of the roster the Team list reads: the same cache entry. */
function RosterReadAge({ missionId }: { missionId: string }) {
	const roster = useRoster(missionId);
	return <PanelFooter data-testid="mission-team-read-age" queries={[roster]} />;
}

function TeamRoster({ missionId }: { missionId: string }) {
	const roster = useRoster(missionId);
	return (
		<Surface
			data-testid="mission-team-entries"
			query={roster}
			loading={
				<div className="mt-3 flex flex-col gap-1.5">
					<Skeleton className="h-5 w-full" />
					<Skeleton className="h-5 w-2/3" />
				</div>
			}
			empty={null}
			error={ErrorState}
		>
			{(entries) => <TeamEntries entries={entries} />}
		</Surface>
	);
}

/**
 * The roster's entries, active first: each agent by name, its waves, and
 * whether it is on. The waves are words ("Waves A, B"): bare letters beside
 * the name read as initials.
 */
export function TeamEntries({ entries }: { entries: readonly RosterEntry[] }) {
	const ordered = [...entries].sort(
		(a, b) => Number(b.active) - Number(a.active),
	);
	return (
		<ul className="mt-3 flex flex-col gap-1">
			{ordered.map((entry) => (
				<li
					key={entry.id}
					data-testid={`mission-team-entry-${entry.id}`}
					data-active={entry.active}
					className="flex min-w-0 items-center justify-between gap-2"
				>
					<span className="min-w-0 truncate type-small text-foreground">
						{entryName(entry)}
					</span>
					<span className="flex shrink-0 items-center gap-2">
						{entry.waves.length > 0 ? (
							<span
								className="type-caption text-text-subtle"
								title={entry.waves.map(waveTitle).join(", ")}
							>
								{`${entry.waves.length === 1 ? "Wave" : "Waves"} ${entry.waves.join(", ")}`}
							</span>
						) : null}
						<span className="type-caption text-text-muted">
							{entry.active ? "Active" : "Idle"}
						</span>
					</span>
				</li>
			))}
		</ul>
	);
}

function Spend({ mission }: { mission: MissionDetail }) {
	return (
		<SectionPanel
			title="Spend"
			data-testid="mission-section-spend-page"
			actions={<SpendLimitControl mission={mission} />}
		>
			<MissionSpendBar
				spentUsd={mission.spentUsd}
				spendCeilingUsd={mission.spendCeilingUsd}
			/>
		</SectionPanel>
	);
}
