import type { RunStep } from "avel-server/contract";
import {
	ChevronRight,
	CircleAlert,
	Lightbulb,
	ListTree,
	Loader2,
	PenLine,
	Wrench,
} from "lucide-react";
import { memo, useId, useState } from "react";
import { cn } from "@/lib/utils";
import { formatTokens } from "./dispatch-budget";

/*
 * The run trace: the steps one of Canon's turns took, above its reply, in
 * the manner of assistant-ui's tool list (design cues only, no dependency).
 * One line sums the turn (working or worked, for how long, how many steps);
 * it opens to the steps, each a row that opens to its detail. While the
 * turn runs the trace is open and its unfinished step spins; once it ends
 * it folds, and stays on the thread to open again.
 *
 * A tool call and its result are two steps, paired here into one row by the
 * result's callSeq. Text steps are chunks of the reply as it was written,
 * so a run of them is one "Wrote" row; the reply itself is the message.
 */

/** A step's detail, as the server writes it per kind (all optional here). */
type Detail = {
	text?: unknown;
	tool?: unknown;
	input?: unknown;
	callSeq?: unknown;
	isError?: unknown;
	message?: unknown;
};

const detailOf = (step: RunStep) => step.detail as Detail;
const textOf = (value: unknown) => (typeof value === "string" ? value : "");

export type TraceItem =
	| { kind: "tool"; seq: number; call: RunStep | null; result: RunStep | null }
	| { kind: "text"; seq: number; steps: RunStep[] }
	| { kind: "reasoning" | "error"; seq: number; step: RunStep };

/** Each turn's steps, keyed by the seq of the operator message that started it. */
export function stepsByTurn(steps: readonly RunStep[]): Map<number, RunStep[]> {
	const turns = new Map<number, RunStep[]>();
	for (const step of steps) {
		if (step.turn === null) continue;
		const list = turns.get(step.turn);
		if (list) list.push(step);
		else turns.set(step.turn, [step]);
	}
	return turns;
}

/** One turn's steps as trace rows: calls paired with results, text runs joined. */
export function traceItems(steps: readonly RunStep[]): TraceItem[] {
	const items: TraceItem[] = [];
	const calls = new Map<number, Extract<TraceItem, { kind: "tool" }>>();
	for (const step of steps) {
		switch (step.kind) {
			case "tool_call": {
				const item = {
					kind: "tool" as const,
					seq: step.seq,
					call: step,
					result: null,
				};
				calls.set(step.seq, item);
				items.push(item);
				break;
			}
			case "tool_result": {
				const callSeq = detailOf(step).callSeq;
				const call =
					typeof callSeq === "number" ? calls.get(callSeq) : undefined;
				// A result whose call is not held (it never should be) stands alone.
				if (call && call.result === null) call.result = step;
				else
					items.push({ kind: "tool", seq: step.seq, call: null, result: step });
				break;
			}
			case "text": {
				const last = items.at(-1);
				if (last?.kind === "text") last.steps.push(step);
				else items.push({ kind: "text", seq: step.seq, steps: [step] });
				break;
			}
			case "reasoning_summary":
				items.push({ kind: "reasoning", seq: step.seq, step });
				break;
			case "error":
				items.push({ kind: "error", seq: step.seq, step });
				break;
		}
	}
	return items;
}

/** "0.4s", "12.0s", "2m 5s". */
export function formatDuration(ms: number): string {
	if (ms < 60_000) return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
	const minutes = Math.floor(ms / 60_000);
	return `${minutes}m ${Math.round((ms % 60_000) / 1000)}s`;
}

const span = (from: RunStep | undefined, to: RunStep | undefined) => {
	const end = to?.endedAt ?? null;
	return from && end ? Date.parse(end) - Date.parse(from.startedAt) : null;
};

/** The first and last steps of an item, for its duration. */
function ends(item: TraceItem): [RunStep | undefined, RunStep | undefined] {
	switch (item.kind) {
		case "tool":
			return [
				item.call ?? item.result ?? undefined,
				item.result ?? item.call ?? undefined,
			];
		case "text":
			return [item.steps[0], item.steps.at(-1)];
		default:
			return [item.step, item.step];
	}
}

/** Tokens in and out over some steps; null when none reports them (as today). */
export function stepTokens(steps: readonly RunStep[]): string | null {
	const reported = steps.filter(
		(s) => s.tokensIn !== null || s.tokensOut !== null,
	);
	if (reported.length === 0) return null;
	const sum = (pick: (s: RunStep) => number | null) =>
		reported.reduce((n, s) => n + (pick(s) ?? 0), 0);
	return `${formatTokens(sum((s) => s.tokensIn))} in · ${formatTokens(sum((s) => s.tokensOut))} out`;
}

/**
 * One turn's trace. Memoized, as the message rows are: a poll that adds a
 * step re-renders only the trace it belongs to.
 */
export const CanonRunTrace = memo(function CanonRunTrace({
	turn,
	steps,
	live,
}: {
	turn: number;
	steps: readonly RunStep[];
	/** The turn is still running: open, with the unfinished step spinning. */
	live: boolean;
}) {
	const listId = useId();
	// Open while live and folded after, until the operator chooses.
	const [chosen, setChosen] = useState<boolean | null>(null);
	const open = chosen ?? live;
	const items = traceItems(steps);
	const total = live ? null : span(steps[0], steps.at(-1));
	const tokens = stepTokens(steps);
	const failed = items.some(
		(i) =>
			i.kind === "error" ||
			(i.kind === "tool" &&
				i.result !== null &&
				detailOf(i.result).isError === true),
	);
	return (
		<li
			data-testid={`canon-trace-${turn}`}
			data-live={live || undefined}
			className="flex justify-start gap-2"
		>
			{/* Under Canon's mark column, so the trace lines up with its reply. */}
			<span aria-hidden="true" className="w-5 shrink-0" />
			<div className="flex min-w-0 max-w-[calc(85%_-_1.75rem)] flex-col gap-1.5">
				<button
					type="button"
					data-testid={`canon-trace-toggle-${turn}`}
					aria-expanded={open}
					aria-controls={listId}
					onClick={() => setChosen(!open)}
					className="inline-flex w-fit items-center gap-1.5 rounded-control py-0.5 type-small text-text-muted transition-colors duration-(--duration-micro) ease-avel hover:text-text"
				>
					{live ? (
						<Loader2
							aria-hidden="true"
							className="size-3.5 animate-spin motion-reduce:animate-none"
						/>
					) : failed ? (
						<CircleAlert
							aria-hidden="true"
							className="size-3.5 text-gate-block"
						/>
					) : (
						<ListTree aria-hidden="true" className="size-3.5" />
					)}
					<span>
						{`${live ? "Working" : "Worked"}${total !== null ? ` for ${formatDuration(total)}` : ""}`}
					</span>
					<span className="text-text-subtle tabular-nums">
						{`· ${steps.length} ${steps.length === 1 ? "step" : "steps"}${tokens ? ` · ${tokens}` : ""}`}
					</span>
					<ChevronRight
						aria-hidden="true"
						className={cn(
							"size-3.5 transition-transform duration-(--duration-micro) ease-avel",
							open && "rotate-90",
						)}
					/>
				</button>
				{open ? (
					<ol
						id={listId}
						aria-label="Steps"
						data-testid={`canon-trace-steps-${turn}`}
						className="ml-1.5 flex flex-col gap-0.5 border-l border-border pl-3"
					>
						{items.map((item, i) => (
							<TraceRow
								key={item.seq}
								item={item}
								running={live && i === items.length - 1 && running(item)}
							/>
						))}
					</ol>
				) : null}
			</div>
		</li>
	);
});

/** An item still under way: a call with no result yet, a step not ended. */
function running(item: TraceItem): boolean {
	if (item.kind === "tool") return item.result === null;
	const [, last] = ends(item);
	return last?.endedAt === null;
}

function rowCopy(item: TraceItem): {
	label: string;
	body: string;
	input: unknown;
	error: boolean;
} {
	switch (item.kind) {
		case "tool": {
			const result = item.result ? detailOf(item.result) : null;
			return {
				label: (item.result ?? item.call)?.label ?? "",
				input: item.call ? detailOf(item.call).input : undefined,
				body: textOf(result?.text),
				error: result?.isError === true,
			};
		}
		case "text":
			return {
				label: "Wrote",
				input: undefined,
				body: item.steps.map((s) => textOf(detailOf(s).text)).join(""),
				error: false,
			};
		case "reasoning":
			return {
				label: item.step.label,
				input: undefined,
				body: textOf(detailOf(item.step).text),
				error: false,
			};
		case "error":
			return {
				label: item.step.label,
				input: undefined,
				body: textOf(detailOf(item.step).message),
				error: true,
			};
	}
}

const ICON = {
	tool: Wrench,
	text: PenLine,
	reasoning: Lightbulb,
	error: CircleAlert,
};

/** One step: its icon, label and duration; it opens to what the step read or wrote. */
function TraceRow({ item, running }: { item: TraceItem; running: boolean }) {
	const [open, setOpen] = useState(false);
	const detailId = useId();
	const { label, body, input, error } = rowCopy(item);
	const [first, last] = ends(item);
	const ms = span(first, last);
	const Icon = error ? CircleAlert : ICON[item.kind];
	const hasDetail = body !== "" || input !== undefined;
	const row = (
		<>
			{running ? (
				<Loader2
					aria-hidden="true"
					data-testid="canon-step-spinner"
					className="size-3.5 shrink-0 animate-spin text-accent-text motion-reduce:animate-none"
				/>
			) : (
				<Icon
					aria-hidden="true"
					className={cn(
						"size-3.5 shrink-0",
						error ? "text-gate-block" : "text-text-subtle",
					)}
				/>
			)}
			<span
				className={cn(
					"min-w-0 truncate",
					error ? "text-gate-block" : "text-text",
				)}
			>
				{label}
			</span>
			<span className="ml-auto shrink-0 type-caption text-text-subtle tabular-nums">
				{running ? "Running" : ms !== null ? formatDuration(ms) : null}
			</span>
		</>
	);
	const rowClass =
		"flex w-full items-center gap-2 rounded-control px-1.5 py-1 text-left type-small";
	return (
		<li
			data-testid={`canon-step-${item.seq}`}
			data-kind={item.kind}
			data-error={error || undefined}
		>
			{hasDetail ? (
				<button
					type="button"
					aria-expanded={open}
					aria-controls={detailId}
					onClick={() => setOpen(!open)}
					className={cn(rowClass, "hover:bg-app-raised")}
				>
					{row}
				</button>
			) : (
				<div className={rowClass}>{row}</div>
			)}
			{open && hasDetail ? (
				<div
					id={detailId}
					data-testid={`canon-step-detail-${item.seq}`}
					className="mt-0.5 mb-1.5 ml-7 flex flex-col gap-1.5"
				>
					{input !== undefined ? (
						<pre className="overflow-x-auto rounded-control border border-border bg-app-raised px-2 py-1.5 type-mono text-text-muted">
							{JSON.stringify(input, null, 2)}
						</pre>
					) : null}
					{body !== "" ? (
						<p className="max-h-60 overflow-y-auto whitespace-pre-wrap break-words type-small text-text-muted">
							{body}
						</p>
					) : null}
				</div>
			) : null}
		</li>
	);
}
