import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	type Brief,
	type MissionDetail,
	type MissionReadiness,
	READINESS_REASONS,
	type ReadinessBlocker,
	type ReadinessWarning,
	type RosterEntry,
} from "avel-server/contract";
import { CircleCheck, Play, Square } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { rosterQuery } from "@/lib/api/coherence";
import { missionDispatchesQuery } from "@/lib/api/dispatches";
import { ApiError } from "@/lib/api/errors";
import {
	useHaltMission,
	useMissionReadiness,
	useStartMission,
} from "@/lib/api/mission-lifecycle";
import {
	issueTarget,
	planAnchor,
	useMissionPlan,
} from "@/lib/api/mission-plans";
import { useApiClient } from "@/lib/api/provider";
import { entryName, waveTitle } from "@/lib/api/roster";
import { describeError } from "@/lib/error-map";
import { cn } from "@/lib/utils";
import { useIsPreview } from "@/shell/auth-gate";
import { Reason } from "./reason";
import { StatusGlyph } from "./status-pill";
import { ErrorState, Surface, type SurfaceQuery } from "./surface";

/*
 * Starting and halting a mission (module 6), for the mission header. Start
 * is offered on a draft and enabled only when every readiness check passes;
 * Halt on an active mission. MissionStart takes readiness, start and halt as
 * props, so it renders in a test without a server; MissionStartLive wires
 * them to contract.missionLifecycle.
 */

export type { MissionReadiness, ReadinessBlocker };

/** Where a detail line's fix lives (audit D6). */
export type DetailLink =
	| { to: "/missions/$id/plan"; hash?: string }
	| { to: "/missions/$id/roster" }
	| { to: "/missions/$id/playbook" }
	| { to: "/clients/$id"; clientId: string };

export type DetailLine = { key: string; text: string; link?: DetailLink };

/**
 * What the lines are read against: the roster names agents, the brief names
 * plan items, and the client is where a closed engagement is dealt with.
 */
export type DetailContext = {
	roster?: readonly RosterEntry[];
	brief?: Brief | null;
	clientId?: string | null;
};

/**
 * Each readiness check by name, in the server's order. A name, not a claim:
 * the glyph beside it says whether it passes, so a blocked row never reads
 * as passing. Keyed on the contract's reasons, so a new one fails the build
 * until it has a row.
 */
export const READINESS_CHECK_LABEL = {
	mission_not_draft: "Draft status",
	engagement_closed: "Engagement",
	plan_check_failed: "Plan check",
	coherence_blocked: "Playbook coherence",
	estimate_missing: "Token estimates",
} as const satisfies Record<ReadinessBlocker["reason"], string>;

/**
 * What readiness notes without blocking start: a mission may run with no
 * spend limit (J, 2026-10-20), and then only each agent's token ceiling
 * caps what it spends. Keyed on the contract, as the checks are.
 */
export const READINESS_WARNING_TEXT = {
	spend_ceiling_missing:
		"No spend limit is set. It's optional: without one, only each agent's token ceiling caps what the mission spends. Set one on the Spend panel.",
} as const satisfies Record<ReadinessWarning["reason"], string>;

const ordinal = (i: number) => i + 1;

/** A module or requirement by its id when the brief is at hand, by position otherwise. */
function itemName(
	brief: Brief | null | undefined,
	list: "modules" | "requirements",
	i: number,
): string {
	const id = brief?.[list][i]?.id;
	const noun = list === "modules" ? "Module" : "Requirement";
	return id ? `${noun} ${id}` : `${noun} ${ordinal(i)}`;
}

/** The brief's lists and fields a plan can lack outright, by their words. */
const PLAN_PARTS: Record<string, string> = {
	summary: "summary",
	requirements: "requirements",
	acceptanceCriteria: "acceptance criteria",
	modules: "modules",
};

/**
 * One plan check issue as a sentence of our own, from its path alone (the
 * server's message is for logs). checkPlan reports under "brief": no
 * brief at all, a part missing or empty (summary, requirements,
 * acceptance criteria, modules), a module id used twice, a module listing
 * a requirement that isn't one (or twice), and a requirement in no module,
 * in several, or with no acceptance criterion.
 */
export function planIssueText(
	path: readonly (string | number)[],
	brief: Brief | null | undefined,
): string {
	const at = path[0] === "brief" ? path.slice(1) : path;
	const [head, i, field] = at;
	if (head === undefined) return "The mission has no plan yet.";
	const part = PLAN_PARTS[String(head)];
	if (i === undefined && part) return `The plan has no ${part}.`;
	if (head === "modules" && typeof i === "number") {
		const name = itemName(brief, "modules", i);
		if (field === "id") return `${name} has an id another module also uses.`;
		if (field === "requirementIds")
			return `${name} lists a requirement that isn't in the plan, or lists one twice.`;
		return `${name} needs fixing.`;
	}
	if (head === "requirements" && typeof i === "number") {
		const name = itemName(brief, "requirements", i);
		if (field === "acceptanceCriteria")
			return `${name} has no acceptance criterion.`;
		if (field === undefined) return `${name} must be in exactly one module.`;
	}
	return PLAN_ISSUE_FALLBACK;
}

/** The line for a plan issue whose path names nothing we have words for. */
export const PLAN_ISSUE_FALLBACK = "The plan has an issue to fix.";

/**
 * One line per distinct sentence: issues that read the same (two the
 * fallback covers, or one module listing two stray requirements) show
 * once, the fallback with how many it stands for. The first keeps its link.
 */
export function collapseLines(lines: readonly DetailLine[]): DetailLine[] {
	const byText = new Map<string, { line: DetailLine; count: number }>();
	for (const line of lines) {
		const seen = byText.get(line.text);
		if (seen) seen.count += 1;
		else byText.set(line.text, { line, count: 1 });
	}
	return [...byText.values()].map(({ line, count }) =>
		count > 1 && line.text === PLAN_ISSUE_FALLBACK
			? { ...line, text: `The plan has ${count} issues to fix.` }
			: line,
	);
}

function isReadinessReason(
	reason: string,
): reason is ReadinessBlocker["reason"] {
	return (READINESS_REASONS as readonly string[]).includes(reason);
}

/** The roster entries a blocker names: rosterEntryIds, else the ids in its issue paths. */
function namedEntryIds(blocker: ReadinessBlocker): readonly string[] {
	if (blocker.rosterEntryIds) return blocker.rosterEntryIds;
	return (blocker.issues ?? []).flatMap(({ path }) =>
		path[0] === "roster" && typeof path[1] === "string" ? [path[1]] : [],
	);
}

/**
 * A blocker's own lines, under its error-map copy: what the check found, in
 * our words, with agents named from the roster and never by id.
 */
export function blockerDetails(
	blocker: ReadinessBlocker,
	{ roster, brief, clientId }: DetailContext = {},
): DetailLine[] {
	switch (blocker.reason) {
		case "plan_check_failed":
			return collapseLines(
				(blocker.issues ?? []).map(({ path }, i) => {
					const target = issueTarget(path, brief ?? null);
					return {
						key: `issue-${i}`,
						text: planIssueText(path, brief),
						link: {
							to: "/missions/$id/plan",
							...(target === null ? {} : { hash: planAnchor(target) }),
						},
					};
				}),
			);
		case "coherence_blocked": {
			const playbook = (blocker.issues ?? []).some(
				({ path }) => path[0] === "playbook",
			);
			if (playbook)
				return [
					{
						key: "playbook",
						text: "No live playbook matches this mission's type.",
						link: { to: "/missions/$id/playbook" },
					},
				];
			const wave = blocker.wave ?? null;
			return [
				{
					key: "block",
					text: wave
						? `No active agent in wave ${waveTitle(wave)}, the playbook's first wave.`
						: "No active agent in the playbook's first wave.",
					link: { to: "/missions/$id/roster" },
				},
			];
		}
		case "estimate_missing":
			return namedEntryIds(blocker).map((id) => {
				const entry = roster?.find((e) => e.id === id);
				return {
					key: id,
					// Without the roster (still loading, or its read failed) the
					// agent is unnamed but still there.
					text: entry
						? `${entryName(entry)} has no token estimate.`
						: roster
							? "An agent no longer on the roster has no token estimate."
							: "An agent on the roster has no token estimate.",
					link: { to: "/missions/$id/roster" },
				};
			});
		case "engagement_closed":
			return [
				{
					key: "engagement",
					text: "The engagement is managed on its client.",
					...(clientId
						? { link: { to: "/clients/$id" as const, clientId } }
						: {}),
				},
			];
		case "mission_not_draft":
			return [];
	}
}

/**
 * A refused Start's details as a readiness blocker: start refuses with the
 * first one readiness would list. Null for any other refusal (a halt's
 * mission_not_active), which its copy covers alone.
 */
export function refusedBlocker(error: ApiError): ReadinessBlocker | null {
	const { failure } = error;
	if (failure.kind !== "contract" || failure.code !== "PRECONDITION_FAILED")
		return null;
	const { reason, issues, rosterEntryIds, wave, engagementId } =
		failure.details;
	if (!isReadinessReason(reason)) return null;
	return {
		reason,
		...(issues ? { issues } : {}),
		...(rosterEntryIds ? { rosterEntryIds } : {}),
		...(wave !== undefined ? { wave } : {}),
		...(engagementId ? { engagementId } : {}),
	};
}

// ---------------------------------------------------------------------------

function Lines({
	lines,
	missionId,
	testId,
}: {
	lines: readonly DetailLine[];
	missionId: string;
	testId: string;
}) {
	if (lines.length === 0) return null;
	return (
		<ul data-testid={testId} className="flex flex-col gap-1">
			{lines.map((line, i) => (
				<li
					key={line.key}
					data-testid={`${testId}-${i}`}
					className="flex flex-wrap items-baseline gap-x-2 type-small text-foreground"
				>
					<span>{line.text}</span>
					{line.link ? (
						<LineLink link={line.link} missionId={missionId} />
					) : null}
				</li>
			))}
		</ul>
	);
}

const LINK_CLASS =
	"py-1.5 -my-1.5 type-caption text-accent-text underline-offset-4 hover:underline";

function LineLink({
	link,
	missionId,
}: {
	link: DetailLink;
	missionId: string;
}) {
	if (link.to === "/missions/$id/playbook")
		return (
			<Link
				to="/missions/$id/playbook"
				params={{ id: missionId }}
				className={LINK_CLASS}
			>
				Open the playbook
			</Link>
		);
	if (link.to === "/clients/$id")
		return (
			<Link
				to="/clients/$id"
				params={{ id: link.clientId }}
				search={{ tab: "engagements" }}
				className={LINK_CLASS}
			>
				Open the client
			</Link>
		);
	if (link.to === "/missions/$id/roster")
		return (
			<Link
				to="/missions/$id/roster"
				params={{ id: missionId }}
				className={LINK_CLASS}
			>
				Open the roster
			</Link>
		);
	return (
		<Link
			to="/missions/$id/plan"
			params={{ id: missionId }}
			hash={link.hash}
			className={LINK_CLASS}
		>
			Open the plan
		</Link>
	);
}

/**
 * One check (audit D6): a pass or block glyph and the check's name. A
 * failing one adds its copy, the server's issues as lines, each with the
 * place that fixes it, and what to do.
 */
function CheckRow({
	reason,
	blocker,
	context,
	missionId,
	testId,
}: {
	reason: ReadinessBlocker["reason"];
	blocker: ReadinessBlocker | undefined;
	context: DetailContext;
	missionId: string;
	testId: string;
}) {
	const state = blocker ? "block" : "pass";
	const copy = blocker ? describeReason(reason) : null;
	return (
		<li
			data-testid={testId}
			data-reason={blocker ? reason : undefined}
			data-check={reason}
			data-state={state}
			className={cn(
				"flex items-start gap-2.5 rounded-control px-3 py-2",
				blocker && "border border-gate-block-line bg-gate-block-soft",
			)}
		>
			<StatusGlyph
				tone={state}
				className={cn(
					"mt-[3px]",
					blocker ? "text-gate-block" : "text-gate-pass",
				)}
			/>
			<div className="flex min-w-0 flex-col gap-1">
				<p
					data-testid={`${testId}-label`}
					className={cn(
						"type-small",
						blocker ? "font-medium text-foreground" : "text-text-muted",
					)}
				>
					{READINESS_CHECK_LABEL[reason]}
					<span className="sr-only">{blocker ? ": blocked" : ": passes"}</span>
				</p>
				{copy && blocker ? (
					<>
						<p className="type-small text-foreground">{copy.what}</p>
						<Lines
							lines={blockerDetails(blocker, context)}
							missionId={missionId}
							testId={`${testId}-lines`}
						/>
						<p className="type-caption text-text-muted">{copy.next}</p>
					</>
				) : null}
			</div>
		</li>
	);
}

/**
 * A reason's copy, through describeError so it reads exactly as a refusal
 * would: a PRECONDITION_FAILED write carrying that reason.
 */
function describeReason(reason: ReadinessBlocker["reason"]) {
	return describeError(
		new ApiError({
			kind: "contract",
			status: 422,
			code: "PRECONDITION_FAILED",
			message: "",
			details: { reason },
			requestId: "",
			method: "POST",
			path: "",
		}),
	);
}

/**
 * The readiness checklist (audit D6): every check the server makes, in its
 * order, each passing or blocked, so the operator sees them all at once
 * rather than only the first one Start would refuse with.
 */
export function ReadinessList({
	readiness,
	missionId,
	context = {},
}: {
	readiness: SurfaceQuery<MissionReadiness, ApiError>;
	missionId: string;
	context?: DetailContext;
}) {
	return (
		<Surface
			data-testid="mission-readiness"
			query={readiness}
			isEmpty={() => false}
			loading={
				<div className="flex flex-col gap-2">
					<Skeleton className="h-12 w-full" />
					<Skeleton className="h-12 w-full" />
				</div>
			}
			empty={null}
			error={ErrorState}
		>
			{(data) => (
				<div className="flex flex-col gap-2">
					{data.blockers.length === 0 ? (
						<p
							data-testid="mission-readiness-clear"
							className="flex items-center gap-2 type-small text-gate-pass"
						>
							<CircleCheck aria-hidden="true" className="size-4" />
							Every check passes. The mission is ready to start.
						</p>
					) : null}
					<ul
						aria-label="Readiness checks"
						data-testid="mission-readiness-checks"
						className="flex flex-col gap-1"
					>
						{READINESS_REASONS.map((reason, i) => (
							<CheckRow
								key={reason}
								reason={reason}
								blocker={data.blockers.find((b) => b.reason === reason)}
								context={context}
								missionId={missionId}
								testId={`mission-readiness-${i}`}
							/>
						))}
					</ul>
					{data.warnings.length > 0 ? (
						<ul
							aria-label="Readiness notes"
							data-testid="mission-readiness-warnings"
							className="flex flex-col gap-1"
						>
							{data.warnings.map((w) => (
								<li
									key={w.reason}
									data-testid={`mission-readiness-warning-${w.reason}`}
									className="flex items-start gap-2 rounded-control border border-gate-warn-line bg-gate-warn-banner px-3 py-2 type-small text-text"
								>
									<StatusGlyph tone="warn" className="mt-0.5" />
									{READINESS_WARNING_TEXT[w.reason]}
								</li>
							))}
						</ul>
					) : null}
				</div>
			)}
		</Surface>
	);
}

/** A refused Start or Halt: the one reason, its lines, and what to do. */
export function Refusal({
	error,
	context,
	missionId,
	testId,
}: {
	error: ApiError;
	context: DetailContext;
	missionId: string;
	testId: string;
}) {
	const copy = describeError(error);
	const blocker = refusedBlocker(error);
	return (
		<div role="alert" data-testid={testId} className="flex flex-col gap-1">
			<p className="type-small text-destructive">{copy.what}</p>
			{blocker ? (
				<Lines
					lines={blockerDetails(blocker, context)}
					missionId={missionId}
					testId={`${testId}-lines`}
				/>
			) : null}
			<p className="type-caption text-text-muted">{copy.next}</p>
		</div>
	);
}

type Write = { pending: boolean; error: ApiError | null };

function useWrite(run: () => Promise<unknown>) {
	const [state, setState] = useState<Write>({ pending: false, error: null });
	const go = () => {
		setState({ pending: true, error: null });
		run().then(
			() => setState({ pending: false, error: null }),
			(error: ApiError) => setState({ pending: false, error }),
		);
	};
	return [state, go] as const;
}

/** Why Start is off, or undefined when it can be pressed. */
export function startBlockedReason(
	readiness: SurfaceQuery<MissionReadiness, ApiError>,
	preview: boolean,
): string | undefined {
	if (preview) return "Sign in to start a mission";
	if (readiness.status === "pending") return "Checking whether it's ready";
	if (readiness.status === "error") return "Readiness couldn't be checked";
	// The first blocker, as start would refuse with it (audit D6).
	const first = readiness.data.blockers[0];
	if (readiness.data.ready || first === undefined) return undefined;
	return describeReason(first.reason).what;
}

/**
 * What holding Halt does beyond the mission: it stops every running
 * dispatch, with how many run now once the dispatches are read.
 */
export function haltNote(running: number | undefined): string {
	const all = "Halting also stops every running dispatch.";
	if (running === undefined) return all;
	if (running === 0) return `${all} None is running now.`;
	return `${all} ${running} ${running === 1 ? "is" : "are"} running now.`;
}

/**
 * The mission header's Start (a draft) or Halt (an active mission). Halt is
 * held to confirm, as abort is: it stops every running dispatch.
 */
export function MissionStart({
	mission,
	readiness,
	context = {},
	start,
	halt,
	running,
}: {
	mission: Pick<MissionDetail, "id" | "status">;
	readiness: SurfaceQuery<MissionReadiness, ApiError>;
	context?: DetailContext;
	/** How many of its dispatches run now; undefined until they are read. */
	running?: number;
	/** POST start; rejects with the ApiError it was refused with. */
	start: () => Promise<unknown>;
	/** POST halt; rejects with the ApiError it was refused with. */
	halt: () => Promise<unknown>;
}) {
	const preview = useIsPreview();
	const [starting, doStart] = useWrite(start);
	const [halting, doHalt] = useWrite(halt);

	if (mission.status === "active")
		return (
			<div data-testid="mission-halt" className="flex flex-col gap-2">
				<Button
					variant="destructive"
					size="sm"
					holdToConfirm
					onConfirm={doHalt}
					disabledReason={
						preview
							? "Sign in to halt a mission"
							: halting.pending
								? "Halting"
								: undefined
					}
					data-testid="mission-halt-button"
				>
					<Square aria-hidden="true" />
					{halting.pending ? "Halting" : "Hold to halt"}
				</Button>
				<p
					data-testid="mission-halt-note"
					className="type-caption text-text-muted"
				>
					{haltNote(running)}
				</p>
				{halting.error ? (
					<Refusal
						error={halting.error}
						context={context}
						missionId={mission.id}
						testId="mission-halt-error"
					/>
				) : null}
			</div>
		);

	if (mission.status !== "draft") return null;

	const blocked = startBlockedReason(readiness, preview);
	return (
		<div data-testid="mission-start" className="flex flex-col gap-3">
			<Button
				size="sm"
				onClick={doStart}
				disabledReason={starting.pending ? "Starting" : blocked}
				data-testid="mission-start-button"
			>
				<Play aria-hidden="true" />
				{starting.pending ? "Starting" : "Start the mission"}
			</Button>
			{blocked && readiness.status === "success" ? (
				<Reason data-testid="mission-start-reason">{blocked}</Reason>
			) : null}
			{starting.error ? (
				<Refusal
					error={starting.error}
					context={context}
					missionId={mission.id}
					testId="mission-start-error"
				/>
			) : null}
			<ReadinessList
				readiness={readiness}
				missionId={mission.id}
				context={context}
			/>
		</div>
	);
}

/**
 * MissionStart wired to avel-server. Readiness and the roster are read only
 * for a draft: the roster names the agents a blocker points at, and shares
 * coherence's cache entry, so a mission with a playbook makes no extra
 * request. Plan items are named from the plan the page already reads.
 */
export function MissionStartLive({
	mission,
}: {
	mission: Pick<MissionDetail, "id" | "status" | "client">;
}) {
	const api = useApiClient();
	const draft = mission.status === "draft";
	const readiness = useMissionReadiness(mission.id, draft);
	const plan = useMissionPlan(mission.id);
	const roster = useQuery({ ...rosterQuery(api, mission.id), enabled: draft });
	const start = useStartMission(mission.id);
	const halt = useHaltMission(mission.id);
	// The same entry the Dispatches section reads, so no extra request.
	const dispatches = useQuery({
		...missionDispatchesQuery(api, mission.id),
		enabled: mission.status === "active",
	});
	return (
		<MissionStart
			mission={mission}
			readiness={readiness}
			context={{
				brief: plan.data?.brief ?? null,
				roster: roster.data,
				clientId: mission.client?.id ?? null,
			}}
			start={() => start.mutateAsync()}
			halt={() => halt.mutateAsync()}
			running={dispatches.data?.filter((d) => d.status === "running").length}
		/>
	);
}
