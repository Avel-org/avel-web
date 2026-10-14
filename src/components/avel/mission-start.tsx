import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	type Brief,
	type MissionDetail,
	type MissionReadiness,
	READINESS_REASONS,
	type ReadinessBlocker,
	type RosterEntry,
} from "avel-server/contract";
import { CircleCheck, Play, Square } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { rosterQuery } from "@/lib/api/coherence";
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
import { useIsPreview } from "@/shell/auth-gate";
import { ErrorState, Surface, type SurfaceQuery } from "./surface";

/*
 * Starting and halting a mission (module 6), for the mission header. Start
 * is offered on a draft and enabled only when every readiness check passes;
 * Halt on an active mission. MissionStart takes readiness, start and halt as
 * props, so it renders in a test without a server; MissionStartLive wires
 * them to contract.missionLifecycle.
 */

export type { MissionReadiness, ReadinessBlocker };

/** Where a detail line's fix lives. */
export type DetailLink =
	| { to: "/missions/$id/plan"; hash?: string }
	| { to: "/missions/$id/roster" }
	| { to: "/playbooks" };

export type DetailLine = { key: string; text: string; link?: DetailLink };

/** What the lines are read against: the roster names agents, the brief names plan items. */
export type DetailContext = {
	roster?: readonly RosterEntry[];
	brief?: Brief | null;
};

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
 * a requirement that isn't one (or twice), and a requirement in no module
 * or in several.
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
	if (head === "requirements" && typeof i === "number" && field === undefined)
		return `${itemName(brief, "requirements", i)} must be in exactly one module.`;
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
	{ roster, brief }: DetailContext = {},
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
						link: { to: "/playbooks" },
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
		default:
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
	"type-caption text-accent-text underline-offset-4 hover:underline";

function LineLink({
	link,
	missionId,
}: {
	link: DetailLink;
	missionId: string;
}) {
	if (link.to === "/playbooks")
		return (
			<Link to="/playbooks" className={LINK_CLASS}>
				Open playbooks
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

/** One failing check: its copy, then its own lines. */
function BlockerRow({
	blocker,
	context,
	missionId,
	testId,
}: {
	blocker: ReadinessBlocker;
	context: DetailContext;
	missionId: string;
	testId: string;
}) {
	const copy = describeReason(blocker.reason);
	return (
		<li
			data-testid={testId}
			data-reason={blocker.reason}
			className="flex flex-col gap-1 rounded-md border border-gate-block-line px-3 py-2"
		>
			<p className="type-small font-medium text-foreground">{copy.what}</p>
			<Lines
				lines={blockerDetails(blocker, context)}
				missionId={missionId}
				testId={`${testId}-lines`}
			/>
			<p className="type-caption text-text-muted">{copy.next}</p>
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

/** The readiness checks: every failing one in the server's order, or that all pass. */
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
			isEmpty={(data) => data.blockers.length === 0}
			loading={
				<div className="flex flex-col gap-2">
					<Skeleton className="h-12 w-full" />
					<Skeleton className="h-12 w-full" />
				</div>
			}
			empty={
				<p
					data-testid="mission-readiness-clear"
					className="flex items-center gap-2 type-small text-gate-pass"
				>
					<CircleCheck aria-hidden="true" className="size-4" />
					Every check passes. The mission is ready to start.
				</p>
			}
			error={ErrorState}
		>
			{(data) => (
				<ul className="flex flex-col gap-1.5">
					{data.blockers.map((blocker, i) => (
						<BlockerRow
							key={blocker.reason}
							blocker={blocker}
							context={context}
							missionId={missionId}
							testId={`mission-readiness-${i}`}
						/>
					))}
				</ul>
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
	return readiness.data.ready
		? undefined
		: "Clear every check below before starting";
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
}: {
	mission: Pick<MissionDetail, "id" | "status">;
	readiness: SurfaceQuery<MissionReadiness, ApiError>;
	context?: DetailContext;
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
	mission: Pick<MissionDetail, "id" | "status">;
}) {
	const api = useApiClient();
	const draft = mission.status === "draft";
	const readiness = useMissionReadiness(mission.id, draft);
	const plan = useMissionPlan(mission.id);
	const roster = useQuery({ ...rosterQuery(api, mission.id), enabled: draft });
	const start = useStartMission(mission.id);
	const halt = useHaltMission(mission.id);
	return (
		<MissionStart
			mission={mission}
			readiness={readiness}
			context={{ brief: plan.data?.brief ?? null, roster: roster.data }}
			start={() => start.mutateAsync()}
			halt={() => halt.mutateAsync()}
		/>
	);
}
