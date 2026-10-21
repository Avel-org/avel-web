import type {
	CanonMessage,
	CanonMode,
	CanonSession,
} from "avel-server/contract";
import { Check, Copy, MessagesSquare } from "lucide-react";
import { Fragment, memo, useId, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
	CANON_MESSAGE_MAX,
	type CanonAttempt,
	canonAttemptFor,
	canonReplying,
	type OpenCanonSessionBody,
	type PostCanonMessageBody,
	useCanonMessages,
	useCanonSession,
	useCanonSessions,
	useCanonSteps,
	useOpenCanonSession,
	usePostCanonMessage,
	useUpdateCanonSession,
} from "@/lib/api/canon";
import { useCopy } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import { useIsPreview } from "@/shell/auth-gate";
import { ActorMark } from "./actor";
import { CanonSessionActions, CanonSessionTitle } from "./canon-chat-actions";
import { CanonModeBadge, CanonModeSwitch } from "./canon-chat-mode";
import { CanonParts } from "./canon-chat-parts";
import { CanonRunTrace, stepsByTurn } from "./canon-chat-trace";
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
 * and its actions (canon-chat-actions.tsx): Halt, Close, Reopen, Archive.
 * The chat is the session's messages in order, each turn's run trace above
 * Canon's reply; the composer sends the operator's next one.
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
	// The thread's own read, shared: its first message names an untitled session.
	const first = useCanonMessages(sessionId).data?.[0]?.contentMd ?? null;
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
			<SessionHeader session={s} firstMessage={first} />
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

/**
 * The session's name (renamed in place), status, whose move, the budget
 * and spend, and its actions: Halt or Close while open, Reopen once ended,
 * Archive or Unarchive.
 */
export function SessionHeader({
	session: s,
	firstMessage,
}: {
	session: CanonSession;
	/** Names an untitled session. */
	firstMessage?: string | null;
}) {
	const replying = canonReplying(s);
	const status = STATUS[s.status];
	return (
		<div data-testid="canon-session" className="flex flex-col gap-2.5">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<CanonSessionTitle
					session={s}
					firstMessage={firstMessage}
					className="flex-1"
				/>
				<CanonSessionActions session={s} />
			</div>
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
				<span className="ml-auto flex items-center gap-1.5">
					{s.archivedAt ? (
						<Badge variant="secondary" data-testid="canon-archived">
							Archived
						</Badge>
					) : null}
					<CanonModeBadge mode={s.mode} data-testid="canon-session-mode" />
				</span>
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
		</div>
	);
}

/**
 * The session's messages, in seq order: the operator's right, Canon's left.
 * Each turn's run trace sits under the operator message that started it,
 * above Canon's reply; the running turn's is live. No steps, no trace.
 */
export function CanonThread({
	session,
	empty = "No messages yet. Tell Canon what the project is for.",
}: {
	session: CanonSession;
	empty?: string;
}) {
	const messages = useCanonMessages(session.id);
	const live = canonReplying(session);
	const steps = useCanonSteps(session.id, live);
	// Grouped once per read, so a message re-read leaves each trace's steps
	// the same array and the memoized traces skip it.
	const turns = useMemo(() => stepsByTurn(steps.data ?? []), [steps.data]);
	return (
		<Surface
			data-testid="canon-thread"
			query={messages}
			loading={<Skeleton className="h-16 w-full rounded-card" />}
			empty={<p className="type-small text-text-muted">{empty}</p>}
			error={ErrorState}
		>
			{(list) => {
				const lastOperator = list
					.filter((m) => m.role === "operator")
					.at(-1)?.seq;
				let previousMode: CanonMode | null = null;
				return (
					<ol aria-label="Messages" className="flex flex-col gap-2.5">
						{list.map((m) => {
							if (m.role !== "operator")
								return <CanonMessageRow key={m.id} message={m} />;
							// A mode shows where it changes: from the operator's last
							// message, or for the first, from the session's default.
							const showMode = m.mode !== (previousMode ?? session.mode);
							previousMode = m.mode;
							const trace = turns.get(m.seq);
							return (
								<Fragment key={m.id}>
									<CanonMessageRow message={m} showMode={showMode} />
									{trace ? (
										<CanonRunTrace
											turn={m.seq}
											steps={trace}
											live={live && m.seq === lastOperator}
										/>
									) : null}
								</Fragment>
							);
						})}
					</ol>
				);
			}}
		</Surface>
	);
}

/**
 * Memoized: a thread re-read keeps each unchanged message's object (the
 * query's structural sharing), so only a new or changed message re-renders.
 * Without it every row re-parsed its Markdown on each update, and a 500
 * message thread took ~55 ms a render. Its other props are plain values,
 * so they keep it.
 */
export const CanonMessageRow = memo(function CanonMessageRow({
	message: m,
	showMode = false,
}: {
	message: CanonMessage;
	/** Tag the mode it was sent in: it differs from the one before. */
	showMode?: boolean;
}) {
	const canon = m.role === "canon";
	return (
		<li
			data-testid={`canon-message-${m.seq}`}
			data-role={m.role}
			data-mode={m.mode}
			className={cn("flex gap-2", canon ? "justify-start" : "justify-end")}
		>
			{canon ? <ActorMark kind="canon" className="mt-1" /> : null}
			<div
				className={cn(
					"flex min-w-0 flex-col gap-1",
					// 85% of the row, less Canon's mark and gap on its side, so a
					// long reply never pushes past a phone's width.
					canon ? "max-w-[calc(85%_-_1.75rem)]" : "max-w-[85%] items-end",
				)}
			>
				<div
					className={cn(
						"flex min-w-0 max-w-full flex-col gap-2 rounded-card border px-3 py-2",
						canon
							? "border-border bg-app-panel"
							: "border-selected-border bg-selected",
					)}
				>
					<span className="sr-only">{canon ? "Canon:" : "You:"}</span>
					{showMode ? (
						<CanonModeBadge
							mode={m.mode}
							data-testid={`canon-message-mode-${m.seq}`}
							className="self-end"
						/>
					) : null}
					<Markdown text={m.contentMd} />
					<CanonParts parts={m.parts} seq={m.seq} />
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
				{canon ? <MessageActions message={m} /> : null}
			</div>
		</li>
	);
});

/** Under Canon's reply, its action bar: Copy, for now. */
function MessageActions({ message }: { message: CanonMessage }) {
	const { status, copy } = useCopy();
	return (
		<div
			data-testid={`canon-message-actions-${message.seq}`}
			className="flex items-center gap-1"
		>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label="Copy reply"
				data-testid={`canon-message-copy-${message.seq}`}
				onClick={() => void copy(message.contentMd)}
				className="text-text-subtle"
			>
				{status === "Copied" ? (
					<Check aria-hidden="true" />
				) : (
					<Copy aria-hidden="true" />
				)}
			</Button>
			<span aria-live="polite" className="type-caption text-text-subtle">
				{status}
			</span>
		</div>
	);
}

/**
 * The operator's next message: held while Canon answers. With `modes`, the
 * tool row carries the mode switch, which sets the session's default (so a
 * reload keeps it); each message is sent in the mode shown.
 */
export function CanonComposer({
	session,
	modes = false,
	float = false,
	placeholder = "Write to Canon",
}: {
	session: CanonSession;
	modes?: boolean;
	/** Home's floating composer (rulings 21 and 23); a panel's sits still. */
	float?: boolean;
	placeholder?: string;
}) {
	const preview = useIsPreview();
	const post = usePostCanonMessage(session.id);
	const update = useUpdateCanonSession();
	const [text, setText] = useState("");
	const [last, setLast] = useState<CanonAttempt<PostCanonMessageBody> | null>(
		null,
	);
	const posted = {
		onSuccess: () => {
			setLast(null);
			setText("");
		},
	};
	const replying = canonReplying(session);
	// While a switch is saving, the mode it is switching to.
	const switching = update.isPending ? update.variables?.body.mode : undefined;
	const mode = switching ?? session.mode;
	const trimmed = text.trim();
	const reason = preview
		? "Sign in to write to Canon"
		: replying
			? "Canon is answering"
			: trimmed === ""
				? "Write a message first"
				: post.isPending
					? "Sending"
					: switching
						? "Switching mode"
						: undefined;
	const error = post.error ?? update.error;
	return (
		<div data-testid="canon-composer" className="flex flex-col gap-2">
			<ChatComposer
				float={float}
				label="Message to Canon"
				placeholder={placeholder}
				value={text}
				onChange={setText}
				maxLength={CANON_MESSAGE_MAX}
				sendDisabledReason={reason}
				onSend={() => {
					const body = modes
						? { contentMd: trimmed, mode }
						: { contentMd: trimmed };
					const attempt = canonAttemptFor(last, body);
					setLast(attempt);
					post.mutate(attempt, posted);
				}}
				tools={
					<>
						{modes ? (
							<CanonModeSwitch
								value={mode}
								hasIntake={session.intakeId !== null}
								disabledReason={
									preview
										? "Sign in to change the mode"
										: replying
											? "Canon is answering"
											: undefined
								}
								onChange={(next) => {
									post.reset();
									update.mutate({ id: session.id, body: { mode: next } });
								}}
							/>
						) : null}
					</>
				}
			/>
			{error ? (
				<ErrorState
					error={error}
					{...(post.error ? retryOf(post, posted) : retryOf(update))}
				/>
			) : null}
		</div>
	);
}
