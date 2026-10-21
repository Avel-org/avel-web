import type { Dispatch } from "avel-server/contract";
import { dispatchStarted, useDispatchSteps } from "@/lib/api/dispatches";
import { RunTrace } from "./canon-chat-trace";

/*
 * What a dispatch's agent did, as the run trace Canon's turns use: its prose,
 * each tool it called paired with the answer, and any error. The runner
 * writes steps on its tick, so a running dispatch's trace grows in bursts.
 * The agent's report closes the run, so a finished trace usually ends on
 * "Calling report".
 */

/** Why there is no trace to show, or null when there is one (or none yet read). */
export function dispatchRunNote(
	dispatch: Pick<Dispatch, "status">,
	steps: readonly unknown[] | undefined,
): string | null {
	if (!dispatchStarted(dispatch))
		return "The run starts when the dispatch does.";
	if (steps === undefined || steps.length > 0) return null;
	return dispatch.status === "running"
		? "Waiting for its first steps. They arrive with the runner's tick, every few seconds."
		: "This run recorded no steps.";
}

/** The opened card's Run section: the trace, or why there is none. */
export function DispatchRun({ dispatch }: { dispatch: Dispatch }) {
	const steps = useDispatchSteps(dispatch);
	const note = dispatchRunNote(dispatch, steps.data);
	return (
		<section
			aria-label="Run"
			data-testid={`dispatch-run-${dispatch.id}`}
			className="flex flex-col gap-1.5 border-t border-border pt-2.5"
		>
			<h4 className="type-eyebrow text-text-subtle">Run</h4>
			{note !== null ? (
				<p
					data-testid={`dispatch-run-note-${dispatch.id}`}
					className="type-small text-text-muted"
				>
					{note}
				</p>
			) : steps.data ? (
				<RunTrace
					steps={steps.data}
					live={dispatch.status === "running"}
					toggleTestId={`dispatch-trace-toggle-${dispatch.id}`}
					stepsTestId={`dispatch-trace-steps-${dispatch.id}`}
				/>
			) : null}
		</section>
	);
}
