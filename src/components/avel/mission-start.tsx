import { Link } from "@tanstack/react-router";
import {
	type Brief,
	type MissionDetail,
	type PreconditionDetails,
	type RosterEntry,
	WAVES,
	type Wave,
} from "avel-server/contract";
import { CircleCheck, Play, Square } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import { issueTarget, planAnchor } from "@/lib/api/mission-plans";
import { entryName, waveTitle } from "@/lib/api/roster";
import { describeError } from "@/lib/error-map";
import { useIsPreview } from "@/shell/auth-gate";
import { ErrorState, Surface, type SurfaceQuery } from "./surface";

/*
 * Starting and halting a mission (module 6), for the mission header. Start
 * is offered on a draft and enabled only when every readiness check passes;
 * Halt on an active mission. Readiness, start and halt are props until
 * avel-server's routes land (GET /api/missions/:id/readiness, POST start
 * and halt); the page that mounts this owns the reads and writes.
 */

/**
 * One failing readiness check: the precondition reason and its details.
 * Stands in for GET /api/missions/:id/readiness's blocker until that route
 * is in the contract; `wave` is coherence_blocked's first wave (null when
 * the playbook declares none), arriving on preconditionDetails.
 */
export type ReadinessBlocker = Pick<
	PreconditionDetails,
	"reason" | "issues" | "rosterEntryIds" | "engagementId"
> & { wave?: Wave | null };

export type MissionReadiness = {
	ready: boolean;
	blockers: readonly ReadinessBlocker[];
};

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

/**
 * One plan check issue as a sentence of our own, from its path alone (the
 * server's message is for logs). checkPlan reports under "brief": no
 * modules, a module id used twice, a module listing a requirement that
 * isn't one (or twice), and a requirement in no module or in several.
 */
export function planIssueText(
	path: readonly (string | number)[],
	brief: Brief | null | undefined,
): string {
	const at = path[0] === "brief" ? path.slice(1) : path;
	const [head, i, field] = at;
	if (head === "modules" && i === undefined) return "The plan has no modules.";
	if (head === "modules" && typeof i === "number") {
		const name = itemName(brief, "modules", i);
		if (field === "id") return `${name} has an id another module also uses.`;
		if (field === "requirementIds")
			return `${name} lists a requirement that isn't in the plan, or lists one twice.`;
		return `${name} needs fixing.`;
	}
	if (head === "requirements" && typeof i === "number")
		return `${itemName(brief, "requirements", i)} must be in exactly one module.`;
	return "The plan has an issue to fix.";
}

function isWave(value: unknown): value is Wave {
	return (WAVES as readonly unknown[]).includes(value);
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
			return (blocker.issues ?? []).map(({ path }, i) => {
				const target = issueTarget(path, brief ?? null);
				return {
					key: `issue-${i}`,
					text: planIssueText(path, brief),
					link: {
						to: "/missions/$id/plan",
						...(target === null ? {} : { hash: planAnchor(target) }),
					},
				};
			});
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
			const wave = isWave(blocker.wave) ? blocker.wave : null;
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
					text: entry
						? `${entryName(entry)} has no token estimate.`
						: "An agent no longer on the roster has no token estimate.",
					link: { to: "/missions/$id/roster" },
				};
			});
		default:
			return [];
	}
}

/** The details of a refused Start, as a readiness blocker, when it carries any. */
export function refusedBlocker(error: ApiError): ReadinessBlocker | null {
	const { failure } = error;
	if (failure.kind !== "contract" || failure.code !== "PRECONDITION_FAILED")
		return null;
	const details = failure.details as PreconditionDetails & { wave?: unknown };
	return {
		reason: details.reason,
		...(details.issues ? { issues: details.issues } : {}),
		...(details.rosterEntryIds
			? { rosterEntryIds: details.rosterEntryIds }
			: {}),
		...(isWave(details.wave) || details.wave === null
			? { wave: details.wave as Wave | null }
			: {}),
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
