import { Link } from "@tanstack/react-router";
import {
	type Brief as ApprovedBrief,
	briefSchema,
	type MissionDetail,
} from "avel-server/contract";
import {
	Activity,
	ArrowLeft,
	ArrowUpRight,
	Briefcase,
	Building2,
	CircleCheck,
	Clock,
	FileText,
	Hash,
	Info,
	Link2,
	ListChecks,
	type LucideIcon,
	PackageCheck,
	Rocket,
	ScrollText,
	Shapes,
	Users,
	Wallet,
	X,
} from "lucide-react";
import { createContext, type ReactNode, useContext } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { relativeTime } from "@/lib/api/clients";
import type { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { ACTOR_KIND_LABEL, actionLabel } from "./activity-copy";
import { ActorLabel } from "./agent-actor";
import { formatUsd } from "./dispatch-budget";
import { ClientName, ExportSince, MissionStatusPill } from "./mission-columns";
import { NEEDS_YOU_COPY, useMission } from "./mission-data";
import { missionShortLabel } from "./missions-dashboard";
import {
	EXPORT_STATUS_LABEL,
	EXPORT_TARGET_LABEL,
	exportStatusTone,
	StatusGlyph,
	StatusPill,
} from "./status-pill";
import { ErrorState, type ErrorStateProps, Surface } from "./surface";

/** Closes the details panel, for the error state's way back. */
const CloseContext = createContext<() => void>(() => {});

/**
 * One mission's details, a sheet over the list at every width. Opened by a
 * row in either view, named by the URL's `mission`, so it is a link. The
 * sheet closes on Esc by itself.
 *
 * Laid out after the operator's record panel reference (2026-10-23): a
 * sticky bar with the trail and the ways out, a head (tile, name, where it
 * lives, its state), its actions, then tabs. Details is a list of facts, an
 * icon and a label beside each value, then an Overview of its real numbers.
 * The panel scrolls with no scrollbar drawn.
 */
export function MissionDetails({
	id,
	now,
	onClose,
}: {
	id: string;
	now: number;
	onClose: () => void;
}) {
	return (
		<Sheet open onOpenChange={(open) => !open && onClose()}>
			<SheetContent
				side="right"
				showCloseButton={false}
				data-testid="mission-details"
				// G F opens this mission's full page from inside the sheet.
				data-allow-shortcuts=""
				// A drawer over the page from sm up, so opening a mission never
				// reflows the grid; the whole width on a phone. It scrolls as one
				// column, its scrollbar not drawn; the bar above stays.
				className="no-scrollbar w-full gap-0 overflow-y-auto p-0 sm:max-w-xl"
			>
				<SheetTitle className="sr-only">Mission details</SheetTitle>
				<SheetDescription className="sr-only">
					One mission's brief, roster, playbook, last export and activity.
				</SheetDescription>
				<CloseContext.Provider value={onClose}>
					<DetailsBody id={id} now={now} onClose={onClose} />
				</CloseContext.Provider>
			</SheetContent>
		</Sheet>
	);
}

function DetailsBody({
	id,
	now,
	onClose,
}: {
	id: string;
	now: number;
	onClose: () => void;
}) {
	const mission = useMission(id);
	return (
		<>
			<div className="sticky top-0 z-(--z-raised) flex h-12 shrink-0 items-center gap-2 border-b border-border bg-app-panel pr-2 pl-5">
				<nav
					aria-label="Trail"
					className="flex min-w-0 flex-1 items-center gap-1.5 type-small"
				>
					<span className="text-text-muted">Missions</span>
					<span aria-hidden="true" className="text-text-subtle">
						/
					</span>
					<span className="min-w-0 truncate text-text">
						{mission.data ? missionShortLabel(mission.data) : "Mission"}
					</span>
				</nav>
				<Button asChild variant="ghost" size="sm">
					<Link
						to="/missions/$id"
						params={{ id }}
						data-testid="mission-details-full-page"
					>
						<ArrowUpRight aria-hidden="true" />
						Full page
					</Link>
				</Button>
				<span aria-hidden="true" className="h-4 w-px bg-border" />
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Close details"
					data-testid="mission-details-close"
					onClick={onClose}
				>
					<X aria-hidden="true" />
				</Button>
			</div>
			<Surface
				data-testid="mission-details-body"
				query={mission}
				loading={<DetailsSkeleton />}
				// A mission is never "empty": it exists or it is not found.
				empty={null}
				isEmpty={() => false}
				error={DetailsError}
			>
				{(detail) => <DetailsContent mission={detail} now={now} />}
			</Surface>
		</>
	);
}

function DetailsSkeleton() {
	return (
		<div
			data-testid="mission-details-skeleton"
			className="flex flex-col gap-3 p-4"
		>
			<Skeleton className="h-4 w-24" />
			<Skeleton className="h-6 w-48" />
			<Skeleton className="h-4 w-32" />
			<Skeleton className="mt-4 h-24 w-full" />
		</div>
	);
}

/**
 * The error map's copy, plus a way back. A stale link (the mission, or its
 * client or engagement, was removed) answers NOT_FOUND.
 */
function DetailsError(props: ErrorStateProps<ApiError>) {
	const close = useContext(CloseContext);
	const notFound =
		props.error.failure.kind === "contract" &&
		props.error.failure.code === "NOT_FOUND";
	return (
		<div className="flex flex-col gap-3 p-4">
			<ErrorState {...props} />
			{notFound ? (
				<Button
					variant="outline"
					size="sm"
					className="self-start"
					data-testid="mission-details-back"
					onClick={close}
				>
					<ArrowLeft aria-hidden="true" />
					Back to missions
				</Button>
			) : null}
		</div>
	);
}

function DetailsContent({
	mission,
	now,
}: {
	mission: MissionDetail;
	now: number;
}) {
	const requirements = requirementCount(mission.brief);
	return (
		<div data-testid="mission-details-content" className="flex flex-col">
			<header
				data-testid="mission-details-header"
				className="flex flex-col gap-4 px-5 pt-5 pb-4"
			>
				<div className="flex items-start gap-4">
					<span
						aria-hidden="true"
						className="inline-flex size-14 shrink-0 items-center justify-center rounded-card border border-border bg-app-raised text-text-muted shadow-card"
					>
						<Rocket className="size-6" />
					</span>
					<div className="flex min-w-0 flex-1 flex-col gap-1">
						<h2
							title={missionShortLabel(mission)}
							className="truncate type-page text-text"
						>
							<ClientName mission={mission} />
						</h2>
						<p className="flex min-w-0 items-center gap-1.5 type-small text-text-muted">
							<Link2 aria-hidden="true" className="size-3.5 shrink-0" />
							<span title={mission.repoUrl} className="truncate type-mono">
								{repoLabel(mission.repoUrl)}
							</span>
						</p>
					</div>
					<div className="flex shrink-0 flex-col items-end gap-1.5">
						<MissionStatusPill status={mission.status} />
						{mission.needsYou ? (
							<StatusPill
								size="sm"
								tone="warn"
								label={NEEDS_YOU_COPY[mission.needsYou.reason]}
							/>
						) : null}
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button asChild variant="outline" size="sm">
						<Link to="/missions/$id" params={{ id: mission.id }}>
							<ArrowUpRight aria-hidden="true" />
							Open mission
						</Link>
					</Button>
					<Button asChild variant="outline" size="sm">
						<Link to="/missions/$id/plan" params={{ id: mission.id }}>
							<ListChecks aria-hidden="true" />
							Plan
						</Link>
					</Button>
					<Button asChild variant="outline" size="sm">
						<Link to="/missions/$id/roster" params={{ id: mission.id }}>
							<Users aria-hidden="true" />
							Team
						</Link>
					</Button>
				</div>
			</header>
			<Tabs defaultValue="details" className="gap-0">
				<TabsList
					variant="line"
					aria-label="Mission"
					className="h-11! w-full justify-start gap-1 rounded-none border-y border-border bg-app-band px-3"
				>
					{DETAIL_TABS.map(({ id, label, icon: Icon }) => (
						<TabsTrigger
							key={id}
							value={id}
							data-testid={`mission-details-tab-${id}`}
							className="focus-inset h-full flex-none gap-1.5 px-2.5"
						>
							<Icon aria-hidden="true" className="size-3.5" />
							{label}
						</TabsTrigger>
					))}
				</TabsList>
				<TabsContent
					value="details"
					forceMount
					className="data-[state=inactive]:hidden"
				>
					<dl className="flex flex-col gap-0.5 px-5 py-4">
						<Fact icon={Building2} label="Client">
							<ClientName mission={mission} />
						</Fact>
						<Fact icon={Briefcase} label="Engagement">
							{mission.engagement?.name ?? (
								<span className="text-text-subtle">No engagement</span>
							)}
						</Fact>
						<Fact icon={Shapes} label="Type">
							<span className="type-mono">{mission.type}</span>
						</Fact>
						<Fact icon={Hash} label="Sprint">
							<span className="type-mono">{mission.sprintN}</span>
						</Fact>
						<Fact
							icon={ScrollText}
							label="Playbook"
							data-testid="mission-section-playbook"
						>
							{mission.playbook ? (
								<span className="flex min-w-0 items-baseline gap-2">
									<span className="truncate">{mission.playbook.name}</span>
									<span className="type-mono text-text-subtle">
										{mission.playbook.missionType}
									</span>
								</span>
							) : (
								<span className="text-text-subtle">
									No live playbook for this mission type
								</span>
							)}
						</Fact>
						<Fact
							icon={Users}
							label="Team"
							data-testid="mission-section-roster"
						>
							{`${mission.roster.agents} ${mission.roster.agents === 1 ? "agent" : "agents"}, ${mission.roster.active} active`}
						</Fact>
						<Fact
							icon={Wallet}
							label="Spend limit"
							data-testid="mission-section-spend"
						>
							{mission.spendCeilingUsd === null ? (
								<span className="text-text-subtle">No spend limit</span>
							) : (
								<span className="type-mono">
									{formatUsd(mission.spendCeilingUsd)}
								</span>
							)}
						</Fact>
						<Fact
							icon={PackageCheck}
							label="Last export"
							data-testid="mission-section-export"
						>
							<LastExportDetail mission={mission} now={now} />
						</Fact>
						<Fact icon={Clock} label="Last activity">
							{mission.lastActivityAt ? (
								<time
									dateTime={mission.lastActivityAt}
									title={mission.lastActivityAt}
								>
									{relativeTime(mission.lastActivityAt, now)}
								</time>
							) : (
								<span className="text-text-subtle">No activity yet</span>
							)}
						</Fact>
					</dl>
					<section
						aria-labelledby="mission-overview"
						className="flex flex-col gap-3 border-t border-border px-5 pt-4 pb-6"
					>
						<h3 id="mission-overview" className="type-title text-text">
							Overview
						</h3>
						<div className="grid grid-cols-2 gap-3">
							<Metric
								label="Team"
								value={String(mission.roster.agents)}
								chip={
									<StatusPill
										size="sm"
										tone={mission.roster.active > 0 ? "pass" : "pending"}
										label={`${mission.roster.active} active`}
									/>
								}
								note="Agents on this mission's roster, and how many are active."
							/>
							<Metric
								label="Spent"
								value={formatUsd(mission.spentUsd)}
								chip={
									mission.spendCeilingUsd !== null &&
									mission.spentUsd >= mission.spendCeilingUsd ? (
										<StatusPill size="sm" tone="block" label="At its limit" />
									) : (
										<Badge variant="outline">
											{mission.spendCeilingUsd === null
												? "No limit"
												: `of ${formatUsd(mission.spendCeilingUsd)}`}
										</Badge>
									)
								}
								note="Every dispatch's spend on this mission, summed."
							/>
							{requirements === null ? null : (
								<Metric
									label="Requirements"
									value={String(requirements)}
									chip={<Badge variant="outline">in the brief</Badge>}
									note="What the approved brief asks for, each with its checks."
								/>
							)}
							<Metric
								label="Sprint"
								value={String(mission.sprintN)}
								chip={<MissionStatusPill status={mission.status} />}
								note="The sprint this mission runs as, and where it stands."
							/>
						</div>
					</section>
				</TabsContent>
				<TabsContent
					value="brief"
					forceMount
					className="px-5 py-4 data-[state=inactive]:hidden"
				>
					<div data-testid="mission-section-brief">
						<Brief brief={mission.brief} />
					</div>
				</TabsContent>
				<TabsContent
					value="activity"
					forceMount
					className="px-5 py-4 data-[state=inactive]:hidden"
				>
					<div data-testid="mission-section-activity">
						<RecentActivity mission={mission} now={now} />
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}

const DETAIL_TABS = [
	{ id: "details", label: "Details", icon: Info },
	{ id: "brief", label: "Brief", icon: FileText },
	{ id: "activity", label: "Activity", icon: Activity },
] as const;

/** The repository as its host and path, without the scheme. */
export function repoLabel(url: string): string {
	return url.replace(/^[a-z]+:\/\//, "").replace(/\.git$/, "");
}

/** How many requirements the brief holds, when it is in the plan's shape. */
export function requirementCount(
	brief: Record<string, unknown>,
): number | null {
	const parsed = briefSchema.safeParse(brief);
	return parsed.success ? parsed.data.requirements.length : null;
}

/** One fact: its icon and label in a fixed column, then its value. */
function Fact({
	icon: Icon,
	label,
	children,
	"data-testid": testId,
}: {
	icon: LucideIcon;
	label: string;
	children: ReactNode;
	"data-testid"?: string;
}) {
	return (
		<div
			data-testid={testId}
			className="grid min-h-9 grid-cols-[9rem_minmax(0,1fr)] items-center gap-3 py-1"
		>
			<dt className="flex items-center gap-2 type-small text-text-muted">
				<Icon aria-hidden="true" className="size-4 shrink-0" />
				{label}
			</dt>
			<dd className="min-w-0 type-small text-text">{children}</dd>
		</div>
	);
}

/** An overview card: what it counts, the number, a word on it, and why. */
function Metric({
	label,
	value,
	chip,
	note,
}: {
	label: string;
	value: string;
	/** A state's pill, or a plain word's outline badge. */
	chip: ReactNode;
	note: string;
}) {
	return (
		<div className="flex min-w-0 flex-col gap-1.5 rounded-card border border-border bg-app-panel p-3.5 shadow-card">
			<span className="type-small text-text-muted">{label}</span>
			<span className="flex flex-wrap items-center gap-2">
				<span className="type-metric text-text tabular-nums">{value}</span>
				{chip}
			</span>
			<span className="line-clamp-2 type-caption text-text-subtle">{note}</span>
		</div>
	);
}

type Requirement = ApprovedBrief["requirements"][number];
type Criterion = ApprovedBrief["acceptanceCriteria"][number];

/** One requirement and the criteria that cite it. */
export type RequirementGroup = {
	requirement: Requirement;
	criteria: Criterion[];
};

type Module = ApprovedBrief["modules"][number];

/**
 * React keys from ids that should be unique but may repeat (R1, then R1#2):
 * uniqueness is the plan check's rule, and this view shows a brief as it is.
 */
function keyed<T>(items: T[], idOf: (item: T) => string): [string, T][] {
	const seen = new Map<string, number>();
	return items.map((item) => {
		const id = idOf(item);
		const n = (seen.get(id) ?? 0) + 1;
		seen.set(id, n);
		return [n === 1 ? id : `${id}#${n}`, item];
	});
}

/** One module, its requirements in its own order, and ids it names that the brief lacks. */
export type ModuleGroup = {
	module: Module;
	groups: RequirementGroup[];
	missing: string[];
};

export type GroupedBrief = {
	modules: ModuleGroup[];
	/** Requirements no module names; every requirement when there are no modules. */
	unplaced: RequirementGroup[];
	/** Criteria citing a requirement the brief lacks. */
	uncited: Criterion[];
};

/**
 * Module, then requirement, then criterion, all joined by id, never by
 * position. Nothing is dropped or fixed up here: a criterion citing no
 * requirement, a module naming one that does not exist, a requirement in no
 * module or in two, each shows as it is. Saying which of those the plan
 * check refuses is the check's job (the plan route's `check`), not this
 * view's. With a repeated requirement id, the first one is the one shown.
 */
export function groupBrief(brief: ApprovedBrief): GroupedBrief {
	const byId = new Map<string, RequirementGroup>();
	const groups: RequirementGroup[] = [];
	for (const requirement of brief.requirements) {
		const group: RequirementGroup = { requirement, criteria: [] };
		groups.push(group);
		if (!byId.has(requirement.id)) byId.set(requirement.id, group);
	}
	const uncited: Criterion[] = [];
	for (const criterion of brief.acceptanceCriteria) {
		const group = byId.get(criterion.requirementId);
		if (group) group.criteria.push(criterion);
		else uncited.push(criterion);
	}
	const placed = new Set<string>();
	const modules = brief.modules.map((module): ModuleGroup => {
		const own: RequirementGroup[] = [];
		const missing: string[] = [];
		for (const id of module.requirementIds) {
			const group = byId.get(id);
			if (group) {
				own.push(group);
				placed.add(id);
			} else {
				missing.push(id);
			}
		}
		return { module, groups: own, missing };
	});
	const unplaced = groups.filter((g) => !placed.has(g.requirement.id));
	return { modules, unplaced, uncited };
}

/**
 * A brief in the contract's shape (intake.ts, briefSchema) shows its modules,
 * each module's requirements, and each requirement's acceptance criteria. A
 * brief with no modules yet shows its requirements alone. The contract still
 * types Mission.brief as an open record, so anything that does not parse, an
 * older brief included, is shown as keys and values: text as text, anything
 * machine-made in mono.
 */
export function Brief({ brief }: { brief: Record<string, unknown> }) {
	const entries = Object.entries(brief);
	if (entries.length === 0) {
		return <p className="type-small text-text-subtle">No brief yet.</p>;
	}
	const parsed = briefSchema.safeParse(brief);
	if (parsed.success) return <BriefPlan brief={parsed.data} />;
	return (
		<dl
			data-testid="mission-brief"
			data-shape="record"
			className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5"
		>
			{entries.map(([key, value]) => (
				<div key={key} className="contents">
					<dt className="type-mono text-text-subtle">{key}</dt>
					<dd
						className={cn(
							"min-w-0 break-words",
							typeof value === "string"
								? "type-small text-foreground"
								: "type-mono text-foreground",
						)}
					>
						{typeof value === "string" ? value : JSON.stringify(value)}
					</dd>
				</div>
			))}
		</dl>
	);
}

function BriefPlan({ brief }: { brief: ApprovedBrief }) {
	const { modules, unplaced, uncited } = groupBrief(brief);
	return (
		<div
			data-testid="mission-brief"
			data-shape="plan"
			className="flex flex-col gap-4"
		>
			<div className="flex flex-col gap-1 rounded-card bg-app-well px-4 py-3">
				<p className="type-eyebrow">Summary</p>
				<p className="type-body text-text">{brief.summary}</p>
			</div>
			{brief.requirements.length > 0 ? <BriefCoverage brief={brief} /> : null}
			{brief.requirements.length === 0 ? (
				<p className="type-small text-text-subtle">No requirements yet.</p>
			) : modules.length === 0 ? (
				// Intake leaves modules empty; the plan adds them.
				<RequirementList groups={unplaced} />
			) : (
				<>
					{keyed(modules, (m) => m.module.id).map(
						([key, { module, groups, missing }]) => (
							<section
								key={key}
								data-testid={`mission-brief-module-${module.id}`}
								aria-label={`${module.id} ${module.name}`}
								className="flex flex-col gap-2"
							>
								<h4 className="flex items-baseline gap-2">
									<span className="type-mono text-text-subtle">
										{module.id}
									</span>
									<span className="type-small font-medium text-foreground">
										{module.name}
									</span>
								</h4>
								{groups.length > 0 ? (
									<RequirementList groups={groups} />
								) : (
									<p className="type-caption text-text-subtle">
										No requirements in this module.
									</p>
								)}
								{missing.length > 0 ? (
									<p
										data-testid="mission-brief-module-missing"
										className="inline-flex items-center gap-1.5 type-caption text-text-muted"
									>
										<StatusGlyph tone="warn" />
										{`Names ${missing.join(", ")}, not in the brief.`}
									</p>
								) : null}
							</section>
						),
					)}
					{unplaced.length > 0 ? (
						<section
							data-testid="mission-brief-unplaced"
							aria-label="Not in a module"
							className="flex flex-col gap-2 rounded-control border border-gate-warn-line bg-gate-warn-banner p-2"
						>
							<h4 className="type-caption text-foreground">Not in a module</h4>
							<RequirementList groups={unplaced} />
						</section>
					) : null}
				</>
			)}
			{uncited.length > 0 ? (
				<div
					data-testid="mission-brief-uncited"
					className="flex flex-col gap-1 rounded-control border border-gate-warn-line bg-gate-warn-banner p-2"
				>
					<p className="type-caption text-foreground">
						These criteria cite no requirement in the brief.
					</p>
					<CriterionList criteria={uncited} cites />
				</div>
			) : null}
		</div>
	);
}

/**
 * How much of the brief is testable: its counts, and a bar of the
 * requirements that have a criterion, in pass when all do and warn when one
 * has none (Approve refuses that brief).
 */
function BriefCoverage({ brief }: { brief: ApprovedBrief }) {
	const cited = new Set(brief.acceptanceCriteria.map((c) => c.requirementId));
	const total = brief.requirements.length;
	const covered = brief.requirements.filter((r) => cited.has(r.id)).length;
	const whole = covered === total;
	return (
		<div
			data-testid="mission-brief-coverage"
			className="flex flex-wrap items-center gap-x-4 gap-y-2"
		>
			<span className="type-small text-text-muted">
				<span className="font-medium text-text tabular-nums">{total}</span>
				{total === 1 ? " requirement" : " requirements"}
			</span>
			<span className="type-small text-text-muted">
				<span className="font-medium text-text tabular-nums">
					{brief.acceptanceCriteria.length}
				</span>
				{brief.acceptanceCriteria.length === 1 ? " criterion" : " criteria"}
			</span>
			<span className="ml-auto flex items-center gap-2">
				<span
					aria-hidden="true"
					className="h-1.5 w-24 overflow-hidden rounded-full bg-gate-pending-soft"
				>
					<span
						className={cn(
							"block h-full rounded-full",
							whole ? "bg-gate-pass-solid" : "bg-gate-warn-solid",
						)}
						style={{ width: `${(covered / total) * 100}%` }}
					/>
				</span>
				<span
					className={cn(
						"type-caption tabular-nums",
						whole ? "text-gate-pass" : "text-gate-warn",
					)}
				>
					{`${covered} of ${total} testable`}
				</span>
			</span>
		</div>
	);
}

function RequirementList({ groups }: { groups: RequirementGroup[] }) {
	return (
		<ol aria-label="Requirements" className="flex flex-col gap-2">
			{keyed(groups, (g) => g.requirement.id).map(([key, group]) => (
				<RequirementItem key={key} group={group} />
			))}
		</ol>
	);
}

function RequirementItem({ group }: { group: RequirementGroup }) {
	const { requirement, criteria } = group;
	return (
		<li
			data-testid={`mission-brief-requirement-${requirement.id}`}
			className={cn(
				"overflow-hidden rounded-control border bg-app-panel",
				criteria.length > 0 ? "border-border" : "border-gate-warn-line",
			)}
		>
			<p className="flex items-start gap-2.5 px-3 py-2.5">
				<Badge variant="tag" className="mt-px shrink-0">
					{requirement.id}
				</Badge>
				<span className="min-w-0 break-words type-small font-medium text-text">
					{requirement.text}
				</span>
			</p>
			<div
				className={cn(
					"border-t px-3 py-2",
					criteria.length > 0
						? "border-border bg-app-band"
						: "border-gate-warn-line bg-gate-warn-banner",
				)}
			>
				{criteria.length > 0 ? (
					<CriterionList criteria={criteria} />
				) : (
					<p
						data-testid="mission-brief-no-criteria"
						className="inline-flex items-center gap-1.5 type-caption text-text"
					>
						<StatusGlyph tone="warn" />
						No acceptance criterion yet.
					</p>
				)}
			</div>
		</li>
	);
}

/** Criteria in mono-id rows; `cites` also names the requirement each cites. */
function CriterionList({
	criteria,
	cites = false,
}: {
	criteria: Criterion[];
	cites?: boolean;
}) {
	return (
		<ul aria-label="Acceptance criteria" className="flex flex-col gap-1.5">
			{keyed(criteria, (c) => c.id).map(([key, criterion]) => (
				<li
					key={key}
					data-testid={`mission-brief-criterion-${criterion.id}`}
					className="flex items-start gap-2"
				>
					<CircleCheck
						aria-hidden="true"
						className="mt-0.5 size-3.5 shrink-0 text-text-subtle"
					/>
					<span className="w-9 shrink-0 type-mono text-text-subtle">
						{criterion.id}
					</span>
					<span className="min-w-0 break-words type-small text-text-muted">
						{criterion.text}
						{cites ? (
							<span className="type-mono text-text-subtle">{` → ${criterion.requirementId}`}</span>
						) : null}
					</span>
				</li>
			))}
		</ul>
	);
}

function LastExportDetail({
	mission,
	now,
}: {
	mission: MissionDetail;
	now: number;
}) {
	const last = mission.lastExport;
	if (!last)
		return <p className="type-small text-text-subtle">No export yet.</p>;
	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-2">
				<StatusPill
					size="sm"
					tone={exportStatusTone(last.status)}
					label={EXPORT_STATUS_LABEL[last.status]}
				/>
				<span className="type-small text-text">
					{EXPORT_TARGET_LABEL[last.targetKind]}
				</span>
				<ExportSince
					at={last.statusChangedAt}
					now={now}
					data-testid="mission-export-since"
				/>
			</div>
			{/* Gate results live in the mission page's Gate panel. */}
		</div>
	);
}

export function RecentActivity({
	mission,
	now,
}: {
	mission: MissionDetail;
	now: number;
}) {
	if (mission.recentActivity.length === 0) {
		return <p className="type-small text-text-subtle">No activity yet.</p>;
	}
	return (
		<ol data-testid="mission-activity" className="flex flex-col gap-2">
			{mission.recentActivity.map((entry, i) => (
				<li
					// Entries carry no id, and two can share a time and an action
					// (dispatches queued together): the position tells them apart.
					// biome-ignore lint/suspicious/noArrayIndexKey: entries can repeat, so the index completes the key
					key={`${entry.at}-${entry.action}-${i}`}
					className="flex items-baseline justify-between gap-3"
				>
					<span className="flex min-w-0 flex-col">
						<span className="truncate type-small text-foreground">
							{actionLabel(entry.action)}
						</span>
						<span className="type-caption text-text-subtle">
							<ActorLabel
								actor={entry.actor}
								fallback={ACTOR_KIND_LABEL[entry.actor.kind]}
								data-testid={`mission-activity-actor-${i}`}
							/>
						</span>
					</span>
					<time
						dateTime={entry.at}
						title={entry.at}
						className="shrink-0 type-caption text-text-subtle tabular-nums"
					>
						{relativeTime(entry.at, now)}
					</time>
				</li>
			))}
		</ol>
	);
}
