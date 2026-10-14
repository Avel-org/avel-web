import type { Dispatch } from "avel-server/contract";
import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHaltDispatch, useStartDispatch } from "@/lib/api/dispatches";
import type { ApiError } from "@/lib/api/errors";
import { describeError } from "@/lib/error-map";
import { useIsPreview } from "@/shell/auth-gate";

/*
 * Start on a queued dispatch card and Halt on a running one (module 6).
 * Start moves it to running; Halt, held to confirm, stops it as the
 * operator, and the system files its report. A refusal shows on the card
 * it was about, in our copy, with the agent or model it names. In dev the
 * fake harness runs nothing, so a started dispatch stays running: that is
 * not an error and shows none.
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
 * The line under a refused Start or Halt's copy: the model with no price,
 * or the agents the refusal names. Null when the copy says it all.
 */
export function dispatchRefusalLine(
	error: ApiError,
	dispatch: Dispatch,
): string | null {
	const { failure } = error;
	if (failure.kind !== "contract" || failure.code !== "PRECONDITION_FAILED")
		return null;
	const { reason, model, rosterEntryIds = [] } = failure.details;
	if (reason === "model_price_unknown")
		return model ? `The model with no price is ${model}.` : null;
	if (rosterEntryIds.length === 0) return null;
	const who = agentsNamed(rosterEntryIds, dispatch);
	switch (reason) {
		case "roster_entry_inactive":
			return `${who}: not active on the roster.`;
		case "agent_identity_missing":
			return `${who}: no generated identity yet.`;
		default:
			return `About ${who}.`;
	}
}

/** A refused Start or Halt, on its card: what, the named line, what next. */
export function DispatchRefusal({
	error,
	dispatch,
}: {
	error: ApiError;
	dispatch: Dispatch;
}) {
	const copy = describeError(error);
	const line = dispatchRefusalLine(error, dispatch);
	return (
		<div
			role="alert"
			data-testid={`dispatch-card-error-${dispatch.id}`}
			className="flex flex-col gap-1"
		>
			<p className="type-small text-destructive">{copy.what}</p>
			{line === null ? null : (
				<p
					data-testid={`dispatch-card-error-line-${dispatch.id}`}
					className="type-small text-foreground"
				>
					{line}
				</p>
			)}
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
}: {
	dispatch: Dispatch;
	/** The write in flight, if any. */
	pending?: DispatchWrite | null;
	/** The last write's refusal. */
	error?: ApiError | null;
	onStart: () => void;
	onHalt: () => void;
}) {
	const preview = useIsPreview();
	const { status, id } = dispatch;
	if (status !== "queued" && status !== "running") return null;
	return (
		<div
			data-testid={`dispatch-card-controls-${id}`}
			className="flex flex-col gap-2 border-t border-border pt-2.5"
		>
			{status === "queued" ? (
				<Button
					size="sm"
					className="self-start"
					onClick={onStart}
					disabledReason={
						preview
							? "Sign in to start"
							: pending === "start"
								? "Starting"
								: undefined
					}
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
					disabledReason={
						preview
							? "Sign in to halt"
							: pending === "halt"
								? "Halting"
								: undefined
					}
					data-testid={`dispatch-card-halt-${id}`}
				>
					<Square aria-hidden="true" />
					{pending === "halt" ? "Halting" : "Hold to halt"}
				</Button>
			)}
			{error ? <DispatchRefusal error={error} dispatch={dispatch} /> : null}
		</div>
	);
}

/**
 * DispatchControls wired to avel-server. A success refreshes the mission,
 * so the card moves lanes (and a halted one carries its report); a
 * refusal stays on this card.
 */
export function DispatchControlsLive({
	missionId,
	dispatch,
}: {
	missionId: string;
	dispatch: Dispatch;
}) {
	const start = useStartDispatch(missionId);
	const halt = useHaltDispatch(missionId);
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
