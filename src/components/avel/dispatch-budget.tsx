import type { Dispatch } from "avel-server/contract";
import { cn } from "@/lib/utils";
import { HALT_REASON_LABEL } from "./dispatch-labels";

/*
 * What a dispatch has used against what it was given (module 6): tokens
 * against the estimate and its two ceilings, dollars, and minutes. The
 * runner sets every number; this only draws them. The track runs to the
 * hard ceiling, where the runner halts, so the soft ceiling and the
 * estimate sit inside it as marks.
 */

const COUNT = new Intl.NumberFormat("en-US");

/** "48,200": a token count, grouped. */
export function formatTokens(tokens: number): string {
	return COUNT.format(tokens);
}

/**
 * "$0.0421" below a dollar, "$12.40" from one up. Spend accrues in
 * fractions of a cent, so a small run keeps four places rather than
 * rounding to $0.00.
 */
export function formatUsd(usd: number): string {
	if (usd === 0) return "$0.00";
	return `$${usd.toFixed(usd < 1 ? 4 : 2)}`;
}

/** "1.5×": a ceiling as a multiple of the estimate. */
export function multipleOf(ceiling: number, estimate: number): string | null {
	if (estimate === 0) return null;
	return `${Number((ceiling / estimate).toFixed(1))}×`;
}

/**
 * Whole minutes a dispatch has run: to its close, or to now while it runs.
 * Null until it starts.
 */
export function minutesRun(
	dispatch: Pick<Dispatch, "startedAt" | "closedAt">,
	now: number,
): number | null {
	if (dispatch.startedAt === null) return null;
	const end = dispatch.closedAt === null ? now : Date.parse(dispatch.closedAt);
	return Math.max(
		0,
		Math.floor((end - Date.parse(dispatch.startedAt)) / 60_000),
	);
}

export type BudgetTone = "ok" | "warn" | "halted";

/** Halted is the runner's stop; past the soft ceiling is a warning. */
export function budgetTone(
	dispatch: Pick<Dispatch, "status" | "softCeilingCrossed">,
): BudgetTone {
	if (dispatch.status === "halted") return "halted";
	return dispatch.softCeilingCrossed ? "warn" : "ok";
}

const FILL: Record<BudgetTone, string> = {
	ok: "bg-accent",
	warn: "bg-gate-warn",
	halted: "bg-gate-block",
};

/** A share of the track, 0 to 100, for a left offset or a width. */
function percent(value: number, max: number): number {
	if (max <= 0) return 0;
	return Math.min(100, (value / max) * 100);
}

/** The token track: used as a fill, the estimate and soft ceiling as marks. */
function TokenTrack({ dispatch }: { dispatch: Dispatch }) {
	const max = Math.max(dispatch.tokenHardCeiling, dispatch.tokensUsed, 1);
	const tone = budgetTone(dispatch);
	return (
		<div
			className="relative h-2"
			data-testid={`dispatch-budget-track-${dispatch.id}`}
		>
			{/* The native meter speaks; the drawing beside it only shows. */}
			<meter
				className="sr-only"
				aria-label={`Tokens used against the hard limit of ${formatTokens(dispatch.tokenHardCeiling)}`}
				min={0}
				max={max}
				high={dispatch.tokenSoftCeiling}
				optimum={0}
				value={dispatch.tokensUsed}
			/>
			<div
				aria-hidden="true"
				className="absolute inset-0 overflow-hidden rounded-full bg-border"
			>
				<div
					data-testid={`dispatch-budget-fill-${dispatch.id}`}
					data-tone={tone}
					className={cn("h-full rounded-full", FILL[tone])}
					style={{ width: `${percent(dispatch.tokensUsed, max)}%` }}
				/>
			</div>
			<span
				aria-hidden="true"
				data-testid={`dispatch-budget-estimate-mark-${dispatch.id}`}
				className="absolute -inset-y-0.5 w-px bg-text-muted"
				style={{ left: `${percent(dispatch.estimatedTokens, max)}%` }}
			/>
			<span
				aria-hidden="true"
				data-testid={`dispatch-budget-soft-mark-${dispatch.id}`}
				className="absolute -inset-y-0.5 w-px bg-gate-warn"
				style={{ left: `${percent(dispatch.tokenSoftCeiling, max)}%` }}
			/>
		</div>
	);
}

/**
 * One dispatch's budget: the token track, the counts under it, the soft
 * crossing and the halt reason when there is one, then dollars and minutes.
 */
export function DispatchBudget({
	dispatch,
	now = Date.now(),
}: {
	dispatch: Dispatch;
	/** For the minutes a running dispatch has run so far. */
	now?: number;
}) {
	const soft = multipleOf(dispatch.tokenSoftCeiling, dispatch.estimatedTokens);
	const hard = multipleOf(dispatch.tokenHardCeiling, dispatch.estimatedTokens);
	const ran = minutesRun(dispatch, now);
	return (
		<div
			data-testid={`dispatch-budget-${dispatch.id}`}
			data-tone={budgetTone(dispatch)}
			className="flex flex-col gap-1.5"
		>
			<TokenTrack dispatch={dispatch} />
			<p
				data-testid={`dispatch-budget-tokens-${dispatch.id}`}
				className="type-small text-text-muted"
			>
				<span className="type-mono text-foreground tabular-nums">
					{formatTokens(dispatch.tokensUsed)}
				</span>
				{" of "}
				<span className="type-mono tabular-nums">
					{formatTokens(dispatch.estimatedTokens)}
				</span>
				{" estimated tokens"}
			</p>
			<p
				data-testid={`dispatch-budget-ceilings-${dispatch.id}`}
				className="type-caption text-text-subtle"
			>
				{"Soft limit "}
				<span className="type-mono-small tabular-nums">
					{formatTokens(dispatch.tokenSoftCeiling)}
				</span>
				{soft ? ` (${soft})` : null}
				{" · Hard limit "}
				<span className="type-mono-small tabular-nums">
					{formatTokens(dispatch.tokenHardCeiling)}
				</span>
				{hard ? ` (${hard})` : null}
			</p>
			{dispatch.softCeilingCrossed ? (
				<p
					data-testid={`dispatch-budget-soft-crossed-${dispatch.id}`}
					className="type-small font-medium text-gate-warn"
				>
					Passed the soft limit
				</p>
			) : null}
			{dispatch.status === "halted" && dispatch.haltReason !== null ? (
				<p
					data-testid={`dispatch-budget-halt-${dispatch.id}`}
					data-reason={dispatch.haltReason}
					className="type-small font-medium text-gate-block"
				>
					{HALT_REASON_LABEL[dispatch.haltReason]}
				</p>
			) : null}
			<p className="type-small flex flex-wrap gap-x-3 text-text-muted">
				<span data-testid={`dispatch-budget-spend-${dispatch.id}`}>
					<span className="type-mono text-foreground tabular-nums">
						{formatUsd(dispatch.spendUsd)}
					</span>
					{" spent"}
				</span>
				<span data-testid={`dispatch-budget-clock-${dispatch.id}`}>
					{ran === null ? (
						<>
							{"Time limit "}
							<span className="type-mono tabular-nums">
								{`${dispatch.wallClockMinutes} min`}
							</span>
						</>
					) : (
						<>
							<span className="type-mono text-foreground tabular-nums">
								{`${ran} min`}
							</span>
							{" of "}
							<span className="type-mono tabular-nums">
								{`${dispatch.wallClockMinutes} min`}
							</span>
						</>
					)}
				</span>
			</p>
		</div>
	);
}

/** Where each token went, for a dispatch opened on the board. */
export function DispatchTokenSplit({ dispatch }: { dispatch: Dispatch }) {
	const rows: [string, number][] = [
		["Input", dispatch.tokensIn],
		["Output", dispatch.tokensOut],
		["Cache read", dispatch.cacheReadTokens],
		["Cache write", dispatch.cacheWriteTokens],
	];
	return (
		<dl
			data-testid={`dispatch-token-split-${dispatch.id}`}
			className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 type-small"
		>
			{rows.map(([label, value]) => (
				<div key={label} className="contents">
					<dt className="text-text-subtle">{label}</dt>
					<dd className="type-mono text-foreground tabular-nums">
						{formatTokens(value)}
					</dd>
				</div>
			))}
		</dl>
	);
}

/**
 * The mission's spend against its ceiling. Spent comes in as a prop until
 * the mission carries it (Mission.spentUsd, module 6 step 4). From 80% the
 * bar warns, early enough to act; at the ceiling it blocks, as the runner
 * halts there.
 */
/** The share of its ceiling a mission has spent when its bar starts to warn. */
export const SPEND_WARN_SHARE = 0.8;

export function MissionSpendBar({
	spentUsd,
	spendCeilingUsd,
}: {
	spentUsd: number;
	spendCeilingUsd: number | null;
}) {
	const share =
		spendCeilingUsd === null || spendCeilingUsd <= 0
			? null
			: Math.min(1, spentUsd / spendCeilingUsd);
	const tone =
		share === null
			? "ok"
			: share >= 1
				? "halted"
				: share >= SPEND_WARN_SHARE
					? "warn"
					: "ok";
	return (
		<div
			data-testid="mission-spend-bar"
			data-tone={tone}
			className="flex flex-col gap-1.5"
		>
			<p className="type-small text-text-muted">
				<span className="type-mono text-foreground tabular-nums">
					{formatUsd(spentUsd)}
				</span>
				{spendCeilingUsd === null ? (
					<>
						{" spent · "}
						<span className="text-text-subtle">No ceiling set</span>
					</>
				) : (
					<>
						{" of "}
						<span className="type-mono tabular-nums">
							{formatUsd(spendCeilingUsd)}
						</span>
						{" spent"}
					</>
				)}
			</p>
			{share === null ? null : (
				<div className="h-1.5 overflow-hidden rounded-full bg-border">
					<meter
						className="sr-only"
						aria-label="Mission spend against its ceiling"
						min={0}
						max={1}
						high={SPEND_WARN_SHARE}
						optimum={0}
						value={share}
					/>
					<div
						aria-hidden="true"
						data-testid="mission-spend-fill"
						className={cn("h-full rounded-full", FILL[tone])}
						style={{ width: `${share * 100}%` }}
					/>
				</div>
			)}
		</div>
	);
}
