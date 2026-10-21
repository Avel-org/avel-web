import {
	EXPORT_STATUSES,
	type ExportStatus,
	INTAKE_STATUSES,
	type IntakeStatus,
	MISSION_STATUSES,
	type MissionStatus,
} from "avel-server/contract";
import { cn } from "@/lib/utils";
import { MISSION_STATUS_TONE } from "./mission-columns";
import { STATUS_PANEL } from "./mission-search";
import { EXPORT_STATUS_TONE, type StatusTone } from "./status-pill";

/*
 * Where a record stands in its own lifecycle (audit D5): the entity's states
 * from the contract's array, the main line left to right, past states
 * filled, the current one ringed in its tone, the rest hollow. Terminal
 * branches (a halt, a failure, a close) follow the line after a divider,
 * off it. Below the line they wrapped alone onto a row of their own, under
 * a rule as wide as the card, and read as a fault in the layout.
 *
 * Each entity's places are keyed with `satisfies` on the contract's status
 * union, so a new server state fails the build until it has a place. A
 * branch names the main state it leaves from only where the contract makes
 * that certain (a mission halts from active); where it does not (an export
 * can fail or close at any step, and nothing records which), it names none,
 * and the main line shows no step as passed rather than guessing.
 */

type Place<S extends string> =
	| { line: "main" }
	| { line: "branch"; after: S | null };

export type LifecycleSpec<S extends string> = {
	/** The contract's array: the order of the main line. */
	states: readonly S[];
	place: Record<S, Place<S>>;
	label: Record<S, string>;
	tone: Record<S, StatusTone>;
};

const MISSION_PLACE = {
	draft: { line: "main" },
	active: { line: "main" },
	halted: { line: "branch", after: "active" },
	shipped: { line: "main" },
	archived: { line: "main" },
} as const satisfies Record<MissionStatus, Place<MissionStatus>>;

export const MISSION_LIFECYCLE: LifecycleSpec<MissionStatus> = {
	states: MISSION_STATUSES,
	place: MISSION_PLACE,
	label: {
		draft: STATUS_PANEL.draft.label,
		active: STATUS_PANEL.active.label,
		halted: STATUS_PANEL.halted.label,
		shipped: STATUS_PANEL.shipped.label,
		archived: STATUS_PANEL.archived.label,
	},
	tone: MISSION_STATUS_TONE,
};

const EXPORT_PLACE = {
	pending: { line: "main" },
	rendering: { line: "main" },
	verifying: { line: "main" },
	previewing: { line: "main" },
	previewed: { line: "main" },
	delivering: { line: "main" },
	"pr-open": { line: "main" },
	done: { line: "main" },
	closed: { line: "branch", after: null },
	failed: { line: "branch", after: null },
} as const satisfies Record<ExportStatus, Place<ExportStatus>>;

/** Each export status in words. */
export const EXPORT_STATUS_LABEL = {
	pending: "Pending",
	rendering: "Rendering",
	verifying: "Verifying",
	previewing: "Previewing",
	previewed: "Previewed",
	delivering: "Delivering",
	"pr-open": "PR open",
	done: "Done",
	closed: "Closed",
	failed: "Failed",
} as const satisfies Record<ExportStatus, string>;

export const EXPORT_LIFECYCLE: LifecycleSpec<ExportStatus> = {
	states: EXPORT_STATUSES,
	place: EXPORT_PLACE,
	label: EXPORT_STATUS_LABEL,
	tone: EXPORT_STATUS_TONE,
};

/**
 * An intake (audit F7): drafted, proposed for approval, approved into a
 * mission. A rejection is terminal and can come from draft or proposed, and
 * nothing records which, so it names no step it left from.
 */
const INTAKE_PLACE = {
	draft: { line: "main" },
	proposed: { line: "main" },
	approved: { line: "main" },
	rejected: { line: "branch", after: null },
} as const satisfies Record<IntakeStatus, Place<IntakeStatus>>;

export const INTAKE_STATUS_LABEL = {
	draft: "Draft",
	proposed: "Proposed",
	approved: "Approved",
	rejected: "Rejected",
} as const satisfies Record<IntakeStatus, string>;

/** Proposed waits on the operator, so it warns; a rejection is final, not a fault. */
export const INTAKE_STATUS_TONE = {
	draft: "pending",
	proposed: "warn",
	approved: "pass",
	rejected: "stale",
} as const satisfies Record<IntakeStatus, StatusTone>;

export const INTAKE_LIFECYCLE: LifecycleSpec<IntakeStatus> = {
	states: INTAKE_STATUSES,
	place: INTAKE_PLACE,
	label: INTAKE_STATUS_LABEL,
	tone: INTAKE_STATUS_TONE,
};

export type StepState = "passed" | "current" | "ahead";

/** Each main-line state's standing, given the current state. */
export function mainLine<S extends string>(
	spec: LifecycleSpec<S>,
	current: S,
): { state: S; standing: StepState }[] {
	const main = spec.states.filter((s) => spec.place[s].line === "main");
	const place = spec.place[current];
	// How far along the main line the record got: to the current state, or,
	// on a branch, to the state it left from (none when that is unknown).
	const reached =
		place.line === "main"
			? main.indexOf(current)
			: place.after === null
				? -1
				: main.indexOf(place.after);
	return main.map((state, i) => ({
		state,
		standing: state === current ? "current" : i <= reached ? "passed" : "ahead",
	}));
}

const RING: Record<StatusTone, string> = {
	pass: "border-gate-pass-solid text-gate-pass",
	block: "border-gate-block-solid text-gate-block",
	warn: "border-gate-warn-solid text-gate-warn",
	pending: "border-gate-pending-solid text-gate-pending",
	stale: "border-gate-pending-solid text-gate-stale",
};

const STANDING_WORDS: Record<StepState, string> = {
	passed: "passed",
	current: "current",
	ahead: "not reached",
};

function Dot({ standing, tone }: { standing: StepState; tone: StatusTone }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"inline-flex size-3 shrink-0 items-center justify-center rounded-full border",
				standing === "passed" && "border-text-muted bg-text-muted",
				standing === "current" && ["border-2 bg-app-panel", RING[tone]],
				standing === "ahead" && "border-border-strong bg-app-panel",
			)}
		>
			{standing === "current" ? (
				<span className="size-1 rounded-full bg-current" />
			) : null}
		</span>
	);
}

export function Lifecycle<S extends string>({
	spec,
	current,
	label,
	compact = false,
	"data-testid": testId,
}: {
	spec: LifecycleSpec<S>;
	current: S;
	/** What the track is of, for screen readers: "Mission lifecycle". */
	label: string;
	/**
	 * One line, for a list row: the branches follow the main line after a
	 * dot (draft → proposed → approved · rejected) instead of under it.
	 */
	compact?: boolean;
	"data-testid": string;
}) {
	const main = mainLine(spec, current);
	const branches = spec.states.filter((s) => spec.place[s].line === "branch");
	if (compact) {
		return (
			<ol
				aria-label={label}
				data-testid={testId}
				data-current={current}
				className="flex flex-wrap items-center gap-x-1.5 gap-y-1"
			>
				{[
					...main,
					...branches.map((state) => ({
						state,
						standing: (state === current ? "current" : "ahead") as StepState,
					})),
				].map(({ state, standing }, i) => (
					<li
						key={state}
						data-testid={`${testId}-step-${state}`}
						data-standing={standing}
						aria-current={standing === "current" ? "step" : undefined}
						className="inline-flex items-center gap-1.5"
					>
						{i > 0 ? (
							<span aria-hidden="true" className="text-text-subtle">
								{i === main.length ? "·" : "→"}
							</span>
						) : null}
						<Dot standing={standing} tone={spec.tone[state]} />
						<span
							className={cn(
								"type-caption whitespace-nowrap",
								standing === "current"
									? "font-medium text-text"
									: "text-text-subtle",
							)}
						>
							{spec.label[state]}
						</span>
						<span className="sr-only">{`, ${STANDING_WORDS[standing]}`}</span>
					</li>
				))}
			</ol>
		);
	}
	return (
		<div
			data-testid={testId}
			data-current={current}
			className="flex flex-wrap items-center gap-x-3 gap-y-2"
		>
			<ol aria-label={label} className="flex flex-wrap items-start gap-y-2">
				{main.map(({ state, standing }, i) => (
					<li
						key={state}
						data-testid={`${testId}-step-${state}`}
						data-standing={standing}
						aria-current={standing === "current" ? "step" : undefined}
						className="flex items-center"
					>
						{i > 0 ? (
							<span
								aria-hidden="true"
								className={cn(
									"mx-1.5 h-px w-4 sm:w-6",
									standing === "ahead" ? "bg-border-strong" : "bg-text-muted",
								)}
							/>
						) : null}
						<span className="inline-flex items-center gap-1.5">
							<Dot standing={standing} tone={spec.tone[state]} />
							<span
								className={cn(
									"type-caption whitespace-nowrap",
									standing === "current"
										? "font-medium text-text"
										: standing === "passed"
											? "text-text-muted"
											: "text-text-subtle",
								)}
							>
								{spec.label[state]}
							</span>
							<span className="sr-only">{`, ${STANDING_WORDS[standing]}`}</span>
						</span>
					</li>
				))}
			</ol>
			{branches.length > 0 ? (
				<ul
					aria-label={`${label}: ends off the main line`}
					data-testid={`${testId}-branches`}
					className="flex flex-wrap items-center gap-x-3 gap-y-1 border-l border-dashed border-border-strong pl-3"
				>
					{branches.map((state) => {
						const standing: StepState = state === current ? "current" : "ahead";
						return (
							<li
								key={state}
								data-testid={`${testId}-branch-${state}`}
								data-standing={standing}
								aria-current={standing === "current" ? "step" : undefined}
								className="inline-flex items-center gap-1.5"
							>
								<Dot standing={standing} tone={spec.tone[state]} />
								<span
									className={cn(
										"type-caption whitespace-nowrap",
										standing === "current"
											? "font-medium text-text"
											: "text-text-subtle",
									)}
								>
									{spec.label[state]}
								</span>
								<span className="sr-only">{`, ${STANDING_WORDS[standing]}`}</span>
							</li>
						);
					})}
				</ul>
			) : null}
		</div>
	);
}
