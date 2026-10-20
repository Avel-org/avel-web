import type { CanonMessage, CanonSession } from "avel-server/contract";
import { MessagesSquare, OctagonX, Square } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
	CANON_MESSAGE_MAX,
	type CanonAttempt,
	canonAttemptFor,
	canonReplying,
	type OpenCanonSessionBody,
	useCanonMessages,
	useCanonSession,
	useCanonSessions,
	useCloseCanonSession,
	useHaltCanonSession,
	useOpenCanonSession,
	usePostCanonMessage,
} from "@/lib/api/canon";
import { cn } from "@/lib/utils";
import { useIsPreview } from "@/shell/auth-gate";
import { ActorMark } from "./actor";
import { CitationChip } from "./canon-citation";
import { CanonOpenQuestions } from "./canon-questions";
import { ChatComposer } from "./chat-composer";
import { formatTokens, formatUsd, TokenTrack } from "./dispatch-budget";
import { EmptyState } from "./empty-state";
import { Markdown } from "./markdown";
import { retryOf } from "./retry";
import { SectionPanel } from "./section-panel";
import { StatusGlyph, StatusPill, type StatusTone } from "./status-pill";
import { ErrorState, Surface } from "./surface";

/*
 * Canon, the project briefer, on one intake. Canon drafts; the operator
 * decides. With no session open, the operator opens one ("Brief with
 * Canon"), with an optional token estimate. An open session shows whose
 * move it is, its token budget on the dispatch track, what it has spent,
 * and Halt (any time) or Close (between Canon's turns). The chat is the
 * session's messages in order; the composer sends the operator's next one.
 * Nothing is pushed: while Canon answers, the session re-reads itself.
 */

/** The estimate a session opens with when none is given (the server's). */
export const CANON_DEFAULT_ESTIMATE = 60_000;

const STATUS: Record<
	CanonSession["status"],
	{ label: string; tone: StatusTone }
> = {
	open: { label: "Open", tone: "pending" },
	closed: { label: "Closed", tone: "stale" },
	halted: { label: "Halted", tone: "block" },
};

const HALT_REASON = {
	operator: "You halted it.",
	token_hard_ceiling: "It reached its hard token limit.",
} as const satisfies Record<NonNullable<CanonSession["haltReason"]>, string>;

/**
 * The session's budget in the dispatch track's terms: halted is the stop,
 * past the soft ceiling a warning, so the two read the same.
 */
export const sessionBudget = (s: CanonSession) => ({
	status: s.status === "halted" ? ("halted" as const) : ("running" as const),
	softCeilingCrossed: s.tokensUsed > s.tokenSoftCeiling,
	tokensUsed: s.tokensUsed,
	estimatedTokens: s.estimatedTokens,
	tokenSoftCeiling: s.tokenSoftCeiling,
	tokenHardCeiling: s.tokenHardCeiling,
});

export function CanonPanel({ intakeId }: { intakeId: string }) {
	const sessions = useCanonSessions(intakeId);
	const list = sessions.data?.pages.flatMap((p) => p.data) ?? [];
	// The open one, else the newest: an ended session stays readable.
	const current = list.find((s) => s.status === "open") ?? list[0] ?? null;
	return (
		<SectionPanel title="Canon" data-testid="canon-panel">
			<Surface
				data-testid="canon-sessions"
				query={sessions}
				isEmpty={() => current === null}
				loading={<Skeleton className="h-24 w-full rounded-card" />}
				empty={<OpenCanon intakeId={intakeId} />}
				error={ErrorState}
			>
				{() =>
					current ? (
						<CanonSessionView
							key={current.id}
							intakeId={intakeId}
							sessionId={current.id}
						/>
					) : null
				}
			</Surface>
		</SectionPanel>
	);
}

/** "Brief with Canon": open a session, with an optional estimate. */
export function OpenCanon({
	intakeId,
	again = false,
}: {
	intakeId: string;
	/** A session has ended before: this opens the next one. */
	again?: boolean;
}) {
	const preview = useIsPreview();
	const open = useOpenCanonSession(intakeId);
	const [estimate, setEstimate] = useState("");
	const [last, setLast] = useState<CanonAttempt<OpenCanonSessionBody> | null>(
		null,
	);
	const opened = { onSuccess: () => setLast(null) };
	const fieldId = useId();
	const typed =
		estimate.trim() === "" ? null : Number(estimate.replace(/,/g, ""));
	const invalid = typed !== null && !(Number.isInteger(typed) && typed > 0);
	const submit = () => {
		const body: OpenCanonSessionBody =
			typed === null ? {} : { estimatedTokens: typed };
		const attempt = canonAttemptFor(last, body);
		setLast(attempt);
		open.mutate(attempt, opened);
	};
	return (
		<div data-testid="canon-open" className="flex flex-col gap-3">
			{again ? null : (
				<EmptyState
					data-testid="canon-none"
					compact
					icon={MessagesSquare}
					title="Not briefed yet"
					description="Canon reads this intake's files, asks what it can't decide, and drafts the brief. You decide what stays."
				/>
			)}
			<div className="flex flex-wrap items-end gap-2">
				<div className="flex flex-col gap-1">
					<label htmlFor={fieldId} className="type-caption text-text-subtle">
						Token estimate
					</label>
					<Input
						id={fieldId}
						inputMode="numeric"
						data-testid="canon-open-estimate"
						placeholder={`${formatTokens(CANON_DEFAULT_ESTIMATE)} (default)`}
						value={estimate}
						onChange={(e) => setEstimate(e.target.value)}
						className="w-44 tabular-nums"
						aria-invalid={invalid || undefined}
					/>
				</div>
				<Button
					type="button"
					data-testid="canon-open-submit"
					disabledReason={
						preview
							? "Sign in to brief with Canon"
							: invalid
								? "The estimate is a whole number of tokens."
								: open.isPending
									? "Opening"
									: undefined
					}
					onClick={submit}
				>
					<MessagesSquare aria-hidden="true" />
					{again ? "Brief again" : "Brief with Canon"}
				</Button>
			</div>
			<p className="type-caption text-text-muted">
				Its soft limit is 1.5 times the estimate and its hard limit 3 times,
				where it halts.
			</p>
			{open.error ? (
				<ErrorState error={open.error} {...retryOf(open, opened)} />
			) : null}
		</div>
	);
}

/** One session: its header and budget, then the chat. */
function CanonSessionView({
	intakeId,
	sessionId,
}: {
	intakeId: string;
	sessionId: string;
}) {
	const session = useCanonSession(sessionId);
	if (session.status !== "success")
		return session.status === "error" ? (
			<ErrorState
				error={session.error}
				retry={() => session.refetch()}
				retrying={session.isFetching}
			/>
		) : (
			<Skeleton className="h-24 w-full rounded-card" />
		);
	const s = session.data;
	return (
		<div className="flex flex-col gap-3">
			<SessionHeader session={s} intakeId={intakeId} />
			<CanonThread session={s} />
			{s.status === "open" ? (
				<>
					{/* What Canon is waiting on, read before writing to it. */}
					<CanonOpenQuestions intakeId={intakeId} />
					<CanonComposer session={s} />
				</>
			) : (
				<OpenCanon intakeId={intakeId} again />
			)}
		</div>
	);
}

/** Status, whose move, the budget and spend, and Halt or Close. */
export function SessionHeader({
	session: s,
	intakeId,
}: {
	session: CanonSession;
	intakeId: string;
}) {
	const preview = useIsPreview();
	const halt = useHaltCanonSession(intakeId);
	const close = useCloseCanonSession(intakeId);
	const replying = canonReplying(s);
	const status = STATUS[s.status];
	const error = halt.error ?? close.error;
	return (
		<div data-testid="canon-session" className="flex flex-col gap-2.5">
			<div className="flex flex-wrap items-center gap-2">
				<StatusPill
					size="sm"
					tone={status.tone}
					label={status.label}
					data-testid="canon-status"
				/>
				{replying ? (
					// Waiting on Canon: the hollow pending glyph, the words, no motion.
					<span
						data-testid="canon-turn"
						className="inline-flex items-center gap-1.5 type-small text-text-muted"
					>
						<StatusGlyph tone="pending" className="text-gate-pending" />
						Canon is answering…
					</span>
				) : s.status === "halted" && s.haltReason ? (
					<span
						data-testid="canon-halt-reason"
						className="type-small text-text-muted"
					>
						{HALT_REASON[s.haltReason]}
					</span>
				) : null}
				{s.status === "open" ? (
					<span className="ml-auto flex items-center gap-1.5">
						<Button
							type="button"
							variant="outline"
							size="sm"
							data-testid="canon-halt"
							disabledReason={preview ? "Sign in to halt Canon" : undefined}
							onClick={() => halt.mutate(s.id)}
						>
							<OctagonX aria-hidden="true" />
							Halt
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							data-testid="canon-close"
							disabledReason={
								preview
									? "Sign in to close the session"
									: replying
										? "Canon is answering. Halt stops it now."
										: undefined
							}
							onClick={() => close.mutate(s.id)}
						>
							<Square aria-hidden="true" />
							Close
						</Button>
					</span>
				) : null}
			</div>
			<div data-testid="canon-budget" className="flex flex-col gap-1">
				<TokenTrack
					budget={sessionBudget(s)}
					id={s.id}
					testIdPrefix="canon-budget"
				/>
				<p className="flex flex-wrap gap-x-3 type-caption text-text-muted tabular-nums">
					<span>{`${formatTokens(s.tokensUsed)} of ${formatTokens(s.tokenHardCeiling)} tokens`}</span>
					<span>{`Estimate ${formatTokens(s.estimatedTokens)}`}</span>
					<span data-testid="canon-spend">{`Spent ${formatUsd(s.spendUsd)}`}</span>
				</p>
			</div>
			{error ? (
				<ErrorState error={error} {...retryOf(halt.error ? halt : close)} />
			) : null}
		</div>
	);
}

/** The session's messages, in seq order: the operator's right, Canon's left. */
export function CanonThread({ session }: { session: CanonSession }) {
	const messages = useCanonMessages(session.id);
	return (
		<Surface
			data-testid="canon-thread"
			query={messages}
			loading={<Skeleton className="h-16 w-full rounded-card" />}
			empty={
				<p className="type-small text-text-muted">
					No messages yet. Tell Canon what the project is for.
				</p>
			}
			error={ErrorState}
		>
			{(list) => (
				<ol aria-label="Messages" className="flex flex-col gap-2.5">
					{list.map((m) => (
						<CanonMessageRow key={m.id} message={m} />
					))}
				</ol>
			)}
		</Surface>
	);
}

export function CanonMessageRow({ message: m }: { message: CanonMessage }) {
	const canon = m.role === "canon";
	return (
		<li
			data-testid={`canon-message-${m.seq}`}
			data-role={m.role}
			className={cn("flex gap-2", canon ? "justify-start" : "justify-end")}
		>
			{canon ? <ActorMark kind="canon" className="mt-1" /> : null}
			<div
				className={cn(
					// 85% of the row, less Canon's mark and gap on its side, so a
					// long reply never pushes past a phone's width.
					"flex min-w-0 flex-col gap-2 rounded-card border px-3 py-2",
					canon ? "max-w-[calc(85%_-_1.75rem)]" : "max-w-[85%]",
					canon
						? "border-border bg-app-panel"
						: "border-selected-border bg-selected",
				)}
			>
				<span className="sr-only">{canon ? "Canon:" : "You:"}</span>
				<Markdown text={m.contentMd} />
				{m.citations.length > 0 ? (
					<ul aria-label="Sources" className="flex flex-wrap gap-1.5">
						{m.citations.map((c, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: a citation has no id, and one passage may be cited twice; the message's order is fixed
							<li key={`${c.chunkId}:${i}`} className="min-w-0 max-w-full">
								<CitationChip
									source={c}
									data-testid={`canon-citation-${m.seq}-${i}`}
								/>
							</li>
						))}
					</ul>
				) : null}
			</div>
		</li>
	);
}

/** The operator's next message: held while Canon answers. */
export function CanonComposer({ session }: { session: CanonSession }) {
	const preview = useIsPreview();
	const post = usePostCanonMessage(session.id);
	const [text, setText] = useState("");
	const [last, setLast] = useState<CanonAttempt<{ contentMd: string }> | null>(
		null,
	);
	const posted = {
		onSuccess: () => {
			setLast(null);
			setText("");
		},
	};
	const trimmed = text.trim();
	const reason = preview
		? "Sign in to write to Canon"
		: canonReplying(session)
			? "Canon is answering"
			: trimmed === ""
				? "Write a message first"
				: post.isPending
					? "Sending"
					: undefined;
	return (
		<div data-testid="canon-composer" className="flex flex-col gap-2">
			<ChatComposer
				float={false}
				label="Message to Canon"
				placeholder="Write to Canon"
				value={text}
				onChange={setText}
				maxLength={CANON_MESSAGE_MAX}
				sendDisabledReason={reason}
				onSend={() => {
					const attempt = canonAttemptFor(last, { contentMd: trimmed });
					setLast(attempt);
					post.mutate(attempt, posted);
				}}
				tools={
					<span
						data-testid="canon-composer-count"
						className="px-1 type-caption text-text-subtle tabular-nums"
					>
						{`${formatTokens(text.length)} / ${formatTokens(CANON_MESSAGE_MAX)}`}
					</span>
				}
			/>
			{post.error ? (
				<ErrorState error={post.error} {...retryOf(post, posted)} />
			) : null}
		</div>
	);
}
