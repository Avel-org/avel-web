import { Skeleton } from "@/components/ui/skeleton";
import {
	occurrenceKeys,
	type Readiness,
	type ReadinessSegment,
	readinessOf,
	type SegmentState,
	useMissionPlan,
} from "@/lib/api/mission-plans";
import { cn } from "@/lib/utils";
import { SectionPanel } from "./section-panel";
import { ErrorState, Surface } from "./surface";

/*
 * The plan's readiness: one segment per requirement, in brief order. Solid
 * is placed in one module with no issue; hatched is placed but carrying an
 * issue; empty is in no module. It shows where things stand, never a score.
 */

const SEGMENT_CLASS: Record<SegmentState, string> = {
	solid: "bg-gate-pass-solid",
	// Built from the gate warn tokens; see bg-hatch-warn in app.css.
	hatched: "bg-hatch-warn",
	empty: "border border-dashed border-gate-pending-line",
};

const STATE_WORDS: Record<SegmentState, string> = {
	solid: "placed",
	hatched: "placed, with issues",
	empty: "in no module",
};

/** "R2: in M1, with 1 issue: …", what a segment says to a screen reader and on hover. */
function segmentLabel(segment: ReadinessSegment): string {
	const where =
		segment.modules.length === 0
			? "in no module"
			: `in ${segment.modules.join(", ")}`;
	const issues =
		segment.issues.length === 0 ? "" : `. ${segment.issues.join(". ")}`;
	return `${segment.id}: ${where}${issues}`;
}

/**
 * The plan's readiness, loaded with the plan. `compact` is the bar alone with
 * one line of counts, for the mission page; the full version adds the
 * modules and the plan-wide issues, for the top of the plan page.
 */
export function PlanReadiness({
	missionId,
	compact = false,
}: {
	missionId: string;
	compact?: boolean;
}) {
	const query = useMissionPlan(missionId);
	return (
		<Surface
			data-testid={compact ? "plan-readiness-compact" : "plan-readiness"}
			query={query}
			isEmpty={(plan) => readinessOf(plan) === null}
			loading={compact ? <CompactSkeleton /> : <FullSkeleton />}
			// A brief that predates the shape has no requirements to place.
			empty={
				<p
					data-testid="plan-readiness-none"
					className="type-small text-text-muted"
				>
					No plan yet
				</p>
			}
			// The compact version sits inside the mission page's Brief panel:
			// it must never put an error card there.
			error={compact ? CompactError : ErrorState}
		>
			{(plan) => {
				const readiness = readinessOf(plan);
				if (readiness === null) return null;
				return compact ? (
					<CompactReadiness readiness={readiness} />
				) : (
					<FullReadiness readiness={readiness} />
				);
			}}
		</Surface>
	);
}

/** The compact version's final shape: the bar, then one caption line. No shift on load. */
function CompactSkeleton() {
	return (
		<div
			data-testid="plan-readiness-skeleton"
			className="flex flex-col gap-1.5"
		>
			<Skeleton className="h-3 w-full rounded-xs" />
			<Skeleton className="h-4 w-40" />
		</div>
	);
}

function FullSkeleton() {
	return (
		<div
			data-testid="plan-readiness-skeleton"
			className="flex flex-col gap-3 p-4 rounded-card border border-border bg-app-panel shadow-card"
		>
			<Skeleton className="h-5 w-28" />
			<Skeleton className="h-3 w-full rounded-xs" />
			<Skeleton className="h-4 w-56" />
		</div>
	);
}

/** One muted line: the plan page carries the full error. */
function CompactError() {
	return (
		<p
			data-testid="plan-readiness-unavailable"
			className="type-small text-text-muted"
		>
			Readiness is unavailable right now.
		</p>
	);
}

function Bar({ segments }: { segments: ReadinessSegment[] }) {
	if (segments.length === 0) {
		return (
			<p
				data-testid="plan-readiness-no-requirements"
				className="type-small text-text-muted"
			>
				The brief has no requirements yet.
			</p>
		);
	}
	return (
		<ol
			aria-label="Requirements, in brief order"
			data-testid="plan-readiness-bar"
			className="flex h-3 gap-0.5"
		>
			{segments.map((s) => (
				<li
					key={s.index}
					data-testid={`plan-readiness-segment-${s.index}`}
					data-state={s.state}
					title={segmentLabel(s)}
					className={cn("min-w-1 flex-1 rounded-xs", SEGMENT_CLASS[s.state])}
				>
					<span className="sr-only">{segmentLabel(s)}</span>
				</li>
			))}
		</ol>
	);
}

/** "3 placed, 1 with issues, 2 in no module": counts in words, the states that occur. */
export function countsLine(segments: ReadinessSegment[]): string {
	const count = (state: SegmentState) =>
		segments.filter((s) => s.state === state).length;
	const parts: string[] = [];
	if (count("solid") > 0) parts.push(`${count("solid")} placed`);
	if (count("hatched") > 0) parts.push(`${count("hatched")} with issues`);
	if (count("empty") > 0) parts.push(`${count("empty")} in no module`);
	return parts.join(", ");
}

function CompactReadiness({ readiness }: { readiness: Readiness }) {
	return (
		<div className="flex flex-col gap-1.5">
			<Bar segments={readiness.segments} />
			<p
				data-testid="plan-readiness-counts"
				className="type-caption text-text-subtle tabular-nums"
			>
				{countsLine(readiness.segments)}
				{readiness.planWide.length > 0
					? `, ${readiness.planWide.length === 1 ? "1 plan-wide issue" : `${readiness.planWide.length} plan-wide issues`}`
					: ""}
			</p>
		</div>
	);
}

function FullReadiness({ readiness }: { readiness: Readiness }) {
	const stateOf = (id: string) =>
		readiness.segments.find((s) => s.id === id)?.state;
	const unplaced = readiness.segments.filter((s) => s.state === "empty");
	const moduleKeys = occurrenceKeys(readiness.modules, (m) => m.id);
	return (
		// The shared panel (section 10), never a card of its own: its head
		// carries the counts where a panel's actions sit.
		<SectionPanel
			title="Readiness"
			data-testid="plan-readiness-panel"
			actions={
				<p
					data-testid="plan-readiness-counts"
					className="type-caption text-text-subtle tabular-nums"
				>
					{countsLine(readiness.segments)}
				</p>
			}
		>
			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-1.5">
					<Bar segments={readiness.segments} />
					<Legend />
				</div>

				<ul
					data-testid="plan-readiness-modules"
					className="flex flex-col gap-2"
				>
					{readiness.modules.map((m, k) => (
						<li
							key={moduleKeys[k]}
							data-testid={`plan-readiness-module-${m.id}`}
							className="flex flex-col gap-1"
						>
							<div className="flex flex-wrap items-center gap-2">
								<span className="type-mono text-foreground">{m.id}</span>
								<span className="type-small text-foreground">{m.name}</span>
								<span className="flex flex-wrap gap-1">
									{m.requirementIds.map((rid, j) => (
										<RequirementChip
											key={occurrenceKeys(m.requirementIds, (x) => x)[j]}
											id={rid}
											state={stateOf(rid)}
										/>
									))}
								</span>
							</div>
							{m.issues.map((message, j) => (
								<p
									key={occurrenceKeys(m.issues, (x) => x)[j]}
									className="type-caption text-text-muted"
								>
									{message}
								</p>
							))}
						</li>
					))}
					{unplaced.length > 0 ? (
						<li
							data-testid="plan-readiness-unplaced"
							className="flex flex-wrap items-center gap-2"
						>
							<span className="type-small text-text-muted">In no module</span>
							{unplaced.map((s) => (
								<RequirementChip key={s.index} id={s.id} state="empty" />
							))}
						</li>
					) : null}
				</ul>

				{readiness.planWide.length > 0 ? (
					<div
						data-testid="plan-readiness-plan-wide"
						className="flex flex-col gap-1"
					>
						<p className="type-small font-medium text-foreground">Plan-wide</p>
						<ul className="flex flex-col gap-0.5">
							{readiness.planWide.map((message, i) => (
								<li
									key={occurrenceKeys(readiness.planWide, (x) => x)[i]}
									className="type-small text-text-muted"
								>
									{message}
								</li>
							))}
						</ul>
					</div>
				) : null}
			</div>
		</SectionPanel>
	);
}

function RequirementChip({
	id,
	state,
}: {
	id: string;
	/** Undefined for an id the brief lacks. */
	state: SegmentState | undefined;
}) {
	return (
		<span
			data-state={state ?? "missing"}
			className="type-mono inline-flex items-center gap-1 rounded-xs border border-border px-1.5 py-0.5 text-text-muted"
		>
			<span
				aria-hidden="true"
				className={cn(
					"size-2 rounded-full",
					state ? SEGMENT_CLASS[state] : "bg-gate-block-solid",
				)}
			/>
			{id}
			<span className="sr-only">
				{state ? `, ${STATE_WORDS[state]}` : ", not a requirement"}
			</span>
		</span>
	);
}

function Legend() {
	return (
		<ul
			aria-label="Legend"
			className="type-caption flex flex-wrap gap-3 text-text-subtle"
		>
			{(Object.keys(STATE_WORDS) as SegmentState[]).map((state) => (
				<li key={state} className="flex items-center gap-1.5">
					<span
						aria-hidden="true"
						className={cn("h-2 w-3 rounded-xs", SEGMENT_CLASS[state])}
					/>
					{STATE_WORDS[state]}
				</li>
			))}
		</ul>
	);
}
