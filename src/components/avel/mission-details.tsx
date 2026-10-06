import { Link } from "@tanstack/react-router";
import type { MissionDetail } from "avel-server/contract";
import { ArrowLeft, ArrowUpRight, ChevronRight, X } from "lucide-react";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useId,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime } from "@/lib/api/clients";
import type { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { ClientName, MissionId, MissionStatusPill } from "./mission-columns";
import { NEEDS_YOU_COPY, useMission } from "./mission-data";
import { exportStatusTone, StatusPill } from "./status-pill";
import { ErrorState, type ErrorStateProps, Surface } from "./surface";

/** Closes the details panel, for the error state's way back. */
const CloseContext = createContext<() => void>(() => {});

/**
 * One mission's details, beside the list on a desktop and as a full-screen
 * sheet on a phone. Opened by a row in either view, named by the URL's
 * `mission`, so it is a link. Esc closes it.
 */
export function MissionDetails({
	id,
	desktop,
	now,
	onClose,
}: {
	id: string;
	/** md and up: a panel beside the list. Below md: a sheet. */
	desktop: boolean;
	now: number;
	onClose: () => void;
}) {
	// Esc closes the panel, unless something inside it (a menu, a field)
	// handled the key first. The phone's sheet closes on Esc by itself.
	useEffect(() => {
		if (!desktop) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && !event.defaultPrevented) onClose();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [desktop, onClose]);

	const body = (
		<CloseContext.Provider value={onClose}>
			<DetailsBody id={id} now={now} onClose={onClose} />
		</CloseContext.Provider>
	);

	if (desktop) {
		return (
			<aside
				data-testid="mission-details"
				aria-label="Mission details"
				className="flex min-h-0 w-full flex-col overflow-y-auto rounded-md border border-border bg-card md:sticky md:top-(--topbar-height) md:max-h-[calc(100dvh-var(--topbar-height)-2*var(--canvas-inset))]"
			>
				{body}
			</aside>
		);
	}
	return (
		<Sheet open onOpenChange={(open) => !open && onClose()}>
			<SheetContent
				side="right"
				showCloseButton={false}
				data-testid="mission-details"
				className="w-full gap-0 p-0 sm:max-w-full"
			>
				<SheetTitle className="sr-only">Mission details</SheetTitle>
				<SheetDescription className="sr-only">
					One mission's brief, roster, playbook, last export and activity.
				</SheetDescription>
				{body}
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
			<div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
				<span className="type-caption text-text-subtle">Mission</span>
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
	return (
		<div data-testid="mission-details-content" className="flex flex-col">
			<header
				data-testid="mission-details-header"
				className="flex flex-col gap-2 border-b border-border px-4 py-4"
			>
				<div className="flex items-center gap-2">
					<MissionId id={mission.id} />
					<MissionStatusPill status={mission.status} />
					{mission.needsYou ? (
						<StatusPill
							size="sm"
							tone="warn"
							label={NEEDS_YOU_COPY[mission.needsYou.reason]}
						/>
					) : null}
				</div>
				<h2 className="type-h2 text-foreground">
					<ClientName mission={mission} />
				</h2>
				<p className="flex flex-wrap gap-x-3 type-small text-text-muted">
					<span>{mission.type}</span>
					<span className="type-mono-small">sprint {mission.sprintN}</span>
					<span>{mission.engagement?.name ?? "No engagement"}</span>
				</p>
				<Button asChild variant="outline" size="sm" className="self-start">
					<Link
						to="/missions/$id"
						params={{ id: mission.id }}
						data-testid="mission-details-full-page"
					>
						Open full page
						<ArrowUpRight aria-hidden="true" />
					</Link>
				</Button>
			</header>
			<Section title="Brief" testId="mission-section-brief">
				<Brief brief={mission.brief} />
			</Section>
			<Section title="Roster" testId="mission-section-roster">
				<p className="type-small text-text-muted">
					<span className="type-mono text-foreground">
						{mission.roster.agents}
					</span>{" "}
					{mission.roster.agents === 1 ? "agent" : "agents"},{" "}
					<span className="type-mono text-foreground">
						{mission.roster.active}
					</span>{" "}
					active
				</p>
			</Section>
			<Section title="Playbook" testId="mission-section-playbook">
				{mission.playbook ? (
					<p className="flex flex-col type-small">
						<span className="text-foreground">{mission.playbook.name}</span>
						<span className="type-mono-small text-text-subtle">
							{mission.playbook.missionType}
						</span>
					</p>
				) : (
					<p className="type-small text-text-subtle">
						No live playbook for this mission type.
					</p>
				)}
			</Section>
			<Section title="Last export" testId="mission-section-export">
				<LastExportDetail mission={mission} now={now} />
			</Section>
			<Section title="Recent activity" testId="mission-section-activity">
				<RecentActivity mission={mission} now={now} />
			</Section>
			<Section title="Spend ceiling" testId="mission-section-spend">
				{mission.spendCeilingUsd === null ? (
					<p className="type-small text-text-subtle">None set</p>
				) : (
					<p className="type-mono text-foreground">
						${mission.spendCeilingUsd.toFixed(2)}
					</p>
				)}
			</Section>
		</div>
	);
}

/** A compact section that opens and closes; open by default. */
function Section({
	title,
	testId,
	children,
}: {
	title: string;
	testId: string;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(true);
	const bodyId = useId();
	return (
		<section data-testid={testId} className="border-b border-border">
			<button
				type="button"
				aria-expanded={open}
				aria-controls={bodyId}
				data-testid={`${testId}-toggle`}
				onClick={() => setOpen(!open)}
				className="flex w-full items-center gap-2 px-4 py-2.5 text-left type-panel-title text-foreground transition-colors duration-(--duration-micro) ease-avel focus-inset hover:bg-state-hover"
			>
				<ChevronRight
					aria-hidden="true"
					className={cn(
						"size-3.5 text-text-subtle transition-transform duration-(--duration-state) ease-avel",
						open && "rotate-90",
					)}
				/>
				{title}
			</button>
			<div
				className={cn(
					"grid transition-[grid-template-rows] duration-(--duration-state) ease-avel",
					open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
				)}
			>
				<div id={bodyId} className="min-h-0 overflow-hidden" inert={!open}>
					<div className="px-4 pb-3">{children}</div>
				</div>
			</div>
		</section>
	);
}

/**
 * The brief is an open record until a brief shape is approved, so it is
 * shown as keys and values: text as text, anything machine-made in mono.
 */
export function Brief({ brief }: { brief: Record<string, unknown> }) {
	const entries = Object.entries(brief);
	if (entries.length === 0) {
		return <p className="type-small text-text-subtle">No brief yet.</p>;
	}
	return (
		<dl
			data-testid="mission-brief"
			className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5"
		>
			{entries.map(([key, value]) => (
				<div key={key} className="contents">
					<dt className="type-mono-small text-text-subtle">{key}</dt>
					<dd
						className={cn(
							"min-w-0 break-words",
							typeof value === "string"
								? "type-small text-foreground"
								: "type-mono-small text-foreground",
						)}
					>
						{typeof value === "string" ? value : JSON.stringify(value)}
					</dd>
				</div>
			))}
		</dl>
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
					label={last.status}
				/>
				<span className="type-mono-small text-text-muted">
					{last.targetKind}
				</span>
				<span
					data-testid="mission-export-since"
					className="type-caption text-text-muted"
				>
					{`In ${last.status} since ${relativeTime(last.statusChangedAt, now)}`}
				</span>
			</div>
			{/* Gate decisions arrive with module 9's decide(); until then the
			    contract sends gates as null. */}
			<Surface
				data-testid="mission-export-gates"
				notBuilt={{
					title: "Gate results",
					what: "Each gate's verdict for this export, with attested gates marked.",
					needs: [],
					compact: true,
				}}
			/>
		</div>
	);
}

/** An actor in words: the operator's GitHub login, else System or Agent. */
const ACTOR_KIND = {
	operator: "Operator",
	system: "System",
	agent: "Agent",
} as const;

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
			{mission.recentActivity.map((entry) => (
				<li
					key={`${entry.at}-${entry.action}`}
					className="flex items-baseline justify-between gap-3"
				>
					<span className="flex min-w-0 flex-col">
						<span className="truncate type-mono-small text-foreground">
							{entry.action}
						</span>
						<span className="type-caption text-text-subtle">
							{entry.actor.display ?? ACTOR_KIND[entry.actor.kind]}
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
