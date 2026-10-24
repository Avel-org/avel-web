import type { Dispatch } from "avel-server/contract";
import { Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useHaltDispatch, useStartDispatch } from "@/lib/api/dispatches";
import type { ApiError } from "@/lib/api/errors";
import { useMissionPlan } from "@/lib/api/mission-plans";
import { describeError } from "@/lib/error-map";
import { showDispatch } from "./dispatch-board";

/*
 * Start on a queued dispatch card and Halt on a running one (module 6).
 * Start moves it to running; Halt, held to confirm, stops it as the
 * operator, and the system files its report. A refusal shows on the card
 * it was about, in our copy, with the agent, model or missing source it
 * names. In dev the fake harness runs nothing, so a started dispatch
 * stays running: that is not an error and shows none.
 */

/** Who a refusal's rosterEntryIds name: the card's own agent, by name. */
function agentsNamed(ids: readonly string[], dispatch: Dispatch): string {
	return ids
		.map((id) =>
			id === dispatch.rosterEntryId ? dispatch.agent.name : "another agent",
		)
		.join(", ");
}

/**
 * One source_unavailable issue as a line of our own, from its path alone
 * (the server's message is for logs): the mission has no single approved
 * intake, or the template or repository has no local clone at its commit.
 * The template is named by the plan's templateRef when the page has it.
 */
export function sourceIssueText(
	path: readonly (string | number)[],
	templateRef: string | null | undefined,
): string | null {
	const [head, kind] = path;
	if (head === "intake" && kind === undefined)
		return "This mission needs exactly one approved intake.";
	if (head !== "source") return null;
	if (kind === "template")
		return `Clone ${templateRef ? `the template ${templateRef}` : "the mission's template"} into AVEL_SOURCES_DIR/templates.`;
	if (kind === "repo")
		return "Clone the client's repository into AVEL_SOURCES_DIR/repos at the mission's commit.";
	return null;
}

/**
 * The lines under a refused Start or Halt's copy: the model with no price,
 * the agents the refusal names, or what its missing source needs. Empty
 * when the copy says it all.
 */
export function dispatchRefusalLines(
	error: ApiError,
	dispatch: Dispatch,
	templateRef?: string | null,
): string[] {
	const { failure } = error;
	if (failure.kind !== "contract" || failure.code !== "PRECONDITION_FAILED")
		return [];
	const { reason, model, rosterEntryIds = [], issues = [] } = failure.details;
	if (reason === "model_price_unknown")
		return model ? [`The model with no price is ${model}.`] : [];
	// One line per distinct issue: two that read the same show once.
	if (reason === "source_unavailable")
		return [
			...new Set(
				issues.flatMap(({ path }) => {
					const text = sourceIssueText(path, templateRef);
					return text === null ? [] : [text];
				}),
			),
		];
	if (rosterEntryIds.length === 0) return [];
	const who = agentsNamed(rosterEntryIds, dispatch);
	switch (reason) {
		case "roster_entry_inactive":
			return [`${who}: not active on the roster.`];
		case "agent_identity_missing":
			return [`${who}: no generated identity yet.`];
		default:
			return [`About ${who}.`];
	}
}

/** Another dispatch a card names: by its agent and wave, by id when unlisted. */
export type NamedDispatch = { id: string; name: string | null };

const namedFrom = (
	ids: readonly string[],
	others: readonly Dispatch[],
): NamedDispatch[] =>
	ids.map((id) => {
		const other = others.find((d) => d.id === id);
		return {
			id,
			name: other ? `${other.agent.name}, wave ${other.wave}` : null,
		};
	});

/**
 * A Start refused while an earlier wave is open: that wave, and its queued
 * and running dispatches (oldest first), each to link to its card. Null for
 * any other refusal.
 */
export function openWaveOf(
	error: ApiError,
	others: readonly Dispatch[],
): { wave: string | null; dispatches: NamedDispatch[] } | null {
	const { failure } = error;
	if (
		failure.kind !== "contract" ||
		failure.code !== "PRECONDITION_FAILED" ||
		failure.details.reason !== "earlier_wave_open"
	)
		return null;
	const { wave = null, dispatchIds = [] } = failure.details;
	return { wave, dispatches: namedFrom(dispatchIds, others) };
}

/**
 * A start's warning when earlier waves hold blocked dispatches: they never
 * finished, so this one's room starts without their work. Null when none is.
 */
export function blockedWaveWarning(
	ids: readonly string[],
	others: readonly Dispatch[],
): string | null {
	if (ids.length === 0) return null;
	const names = namedFrom(ids, others).map(
		({ name }) => name ?? "a dispatch no longer listed",
	);
	const some = ids.length === 1 ? "a blocked dispatch" : "blocked dispatches";
	return `Started. An earlier wave has ${some} (${names.join("; ")}), so this one starts without that work.`;
}

/** A link to another dispatch's card on the mission page, which opens it. */
function DispatchLink({ id, name }: NamedDispatch) {
	return (
		<a
			href={`#dispatch-${id}`}
			onClick={(e) => {
				e.preventDefault();
				showDispatch(id);
			}}
			data-testid={`dispatch-link-${id}`}
			className="text-text underline decoration-border underline-offset-2 hover:decoration-current"
		>
			{name ?? "A dispatch no longer listed"}
		</a>
	);
}

/** A refused Start or Halt, on its card: what, its own lines, what next. */
export function DispatchRefusal({
	error,
	dispatch,
	templateRef,
	others = [],
}: {
	error: ApiError;
	dispatch: Dispatch;
	templateRef?: string | null;
	/** The mission's dispatches, to name the ones a refusal points at. */
	others?: readonly Dispatch[];
}) {
	const copy = describeError(error);
	const lines = dispatchRefusalLines(error, dispatch, templateRef);
	const openWave = openWaveOf(error, others);
	return (
		<div
			role="alert"
			data-testid={`dispatch-card-error-${dispatch.id}`}
			className="flex flex-col gap-1"
		>
			<p className="type-small text-destructive">{copy.what}</p>
			{lines.length === 0 ? null : (
				<ul
					data-testid={`dispatch-card-error-lines-${dispatch.id}`}
					className="flex flex-col gap-1"
				>
					{lines.map((line) => (
						<li key={line} className="type-small text-foreground">
							{line}
						</li>
					))}
				</ul>
			)}
			{openWave ? (
				<div
					data-testid={`dispatch-card-open-wave-${dispatch.id}`}
					className="flex flex-col gap-1 type-small text-foreground"
				>
					<p>
						{openWave.wave
							? `Wave ${openWave.wave} still has these open:`
							: "An earlier wave still has these open:"}
					</p>
					<ul className="flex flex-col gap-1">
						{openWave.dispatches.map((d) => (
							<li key={d.id}>
								<DispatchLink {...d} />
							</li>
						))}
					</ul>
				</div>
			) : null}
			<p className="type-caption text-text-muted">{copy.next}</p>
		</div>
	);
}

export type DispatchWrite = "start" | "halt";

/**
 * The card's control, given its write state: rendered alone in tests.
 * Nothing for a dispatch that is neither queued nor running.
 */
export function DispatchControls({
	dispatch,
	pending = null,
	error = null,
	onStart,
	onHalt,
	templateRef,
	others,
}: {
	dispatch: Dispatch;
	/** The write in flight, if any. */
	pending?: DispatchWrite | null;
	/** The last write's refusal. */
	error?: ApiError | null;
	onStart: () => void;
	onHalt: () => void;
	/** The plan's template, which a missing source's line names. */
	templateRef?: string | null;
	/** The mission's dispatches, to name the ones a refusal points at. */
	others?: readonly Dispatch[];
}) {
	const { status, id } = dispatch;
	if (status !== "queued" && status !== "running") return null;
	return (
		<div
			data-testid={`dispatch-card-controls-${id}`}
			className="flex flex-col gap-1.5 border-t border-border pt-2"
		>
			{status === "queued" ? (
				<Button
					size="sm"
					className="self-start"
					onClick={onStart}
					disabledReason={pending === "start" ? "Starting" : undefined}
					data-testid={`dispatch-card-start-${id}`}
				>
					<Play aria-hidden="true" />
					{pending === "start" ? "Starting" : "Start"}
				</Button>
			) : (
				<Button
					variant="destructive"
					size="sm"
					className="self-start"
					holdToConfirm
					onConfirm={onHalt}
					disabledReason={pending === "halt" ? "Halting" : undefined}
					data-testid={`dispatch-card-halt-${id}`}
				>
					<Square aria-hidden="true" />
					{pending === "halt" ? "Halting" : "Hold to halt"}
				</Button>
			)}
			{error ? (
				<DispatchRefusal
					error={error}
					dispatch={dispatch}
					templateRef={templateRef}
					others={others}
				/>
			) : null}
		</div>
	);
}

/**
 * DispatchControls wired to avel-server. A success refreshes the mission,
 * so the card moves lanes (and a halted one carries its report); a
 * refusal stays on this card. A start past an earlier wave's blocked
 * dispatches says so in a toast, which shows the first of them.
 */
export function DispatchControlsLive({
	missionId,
	dispatch,
	others = [],
}: {
	missionId: string;
	dispatch: Dispatch;
	/** The mission's dispatches, to name the ones a start or refusal points at. */
	others?: readonly Dispatch[];
}) {
	const start = useStartDispatch(missionId, ({ meta }) => {
		const blocked = meta.earlierWaveBlocked;
		const warning = blockedWaveWarning(blocked, others);
		if (warning === null) return;
		toast.warning(warning, {
			action: {
				label: "Show",
				onClick: () => {
					if (blocked[0]) showDispatch(blocked[0]);
				},
			},
		});
	});
	const halt = useHaltDispatch(missionId);
	// The page reads the plan already; this shares its cache entry.
	const plan = useMissionPlan(missionId);
	const pending: DispatchWrite | null = start.isPending
		? "start"
		: halt.isPending
			? "halt"
			: null;
	return (
		<DispatchControls
			dispatch={dispatch}
			pending={pending}
			error={start.error ?? halt.error}
			templateRef={plan.data?.templateRef}
			others={others}
			onStart={() => {
				halt.reset();
				start.mutate(dispatch.id);
			}}
			onHalt={() => {
				start.reset();
				halt.mutate(dispatch.id);
			}}
		/>
	);
}
