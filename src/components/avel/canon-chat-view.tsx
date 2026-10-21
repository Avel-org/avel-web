import { Link } from "@tanstack/react-router";
import type { CanonSession } from "avel-server/contract";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	canonReopenBlocked,
	canonReplying,
	useCanonMessages,
	useCanonSession,
} from "@/lib/api/canon";
import { useClient } from "@/lib/api/clients";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { CanonSessionActions, CanonSessionTitle } from "./canon-chat-actions";
import { CHAT_COLUMN, ChatsButton, COMPOSER_COLUMN } from "./canon-chat-layout";
import { CanonModeBadge } from "./canon-chat-mode";
import { ChatTile, shortAge } from "./canon-chat-rail";
import { CanonComposer, CanonThread } from "./canon-panel";
import { formatTokens, formatUsd } from "./dispatch-budget";
import { Reason } from "./reason";
import { StatusGlyph, type StatusTone } from "./status-pill";
import { ErrorState } from "./surface";

/*
 * One chat on Home: a header with its name (renamed in place), what it is
 * about (an open chat, or its client), its mode, its state and its actions;
 * then the thread, each turn's run trace above Canon's reply; then the
 * composer with the mode switch, or, once ended, what it would take to
 * write again.
 */

const STATUS: Record<
	CanonSession["status"],
	{ label: string; tone: StatusTone; ink: string }
> = {
	open: { label: "Open", tone: "pending", ink: "text-gate-pending" },
	closed: { label: "Closed", tone: "stale", ink: "text-gate-stale" },
	halted: { label: "Halted", tone: "block", ink: "text-gate-block" },
};

/** When the chat started: "Started just now", "Started 2h ago", "Started Aug 1". */
export function startedLabel(openedAt: string, now: number): string {
	const age = shortAge(openedAt, now);
	if (age === "now") return "Started just now";
	return /^\d+[mhdw]$/.test(age) ? `Started ${age} ago` : `Started ${age}`;
}

/** The meta line's separator. */
function Dot() {
	return (
		<span aria-hidden="true" className="text-text-subtle">
			·
		</span>
	);
}

/** Why an ended chat takes no message, and what brings it back. */
export function endedCopy(
	s: Pick<CanonSession, "status" | "haltReason" | "archivedAt">,
): string {
	const blocked = canonReopenBlocked(s);
	const why =
		s.status === "halted"
			? s.haltReason === "operator"
				? "You halted this chat."
				: "This chat reached its hard token limit."
			: "This chat is closed.";
	const archived = s.archivedAt ? " It is archived." : "";
	return blocked
		? `${why}${archived} It can't be reopened. Start a new chat.`
		: `${why}${archived} Reopen it to keep writing.`;
}

export function CanonChatView({
	sessionId,
	onShowChats,
}: {
	sessionId: string;
	onShowChats: () => void;
}) {
	const session = useCanonSession(sessionId);
	const now = useNow();
	const first = useCanonMessages(sessionId).data?.[0]?.contentMd ?? null;
	if (session.status !== "success")
		return (
			<div
				data-testid="canon-chat"
				className={cn("flex flex-1 flex-col gap-3 py-6", CHAT_COLUMN)}
			>
				<ChatsButton onClick={onShowChats} />
				{session.status === "error" ? (
					<ErrorState
						error={session.error}
						retry={() => session.refetch()}
						retrying={session.isFetching}
					/>
				) : (
					<Skeleton className="h-24 w-full rounded-card" />
				)}
			</div>
		);
	const s = session.data;
	const status = STATUS[s.status];
	return (
		<div data-testid="canon-chat" className="flex flex-1 flex-col">
			<header
				data-testid="canon-chat-header"
				data-answering={canonReplying(s) || undefined}
				className="sticky top-(--topbar-height) z-(--z-raised) border-b border-border bg-card"
			>
				<div className={cn("flex items-start gap-3 py-3", CHAT_COLUMN)}>
					<ChatsButton onClick={onShowChats} />
					<ChatTile chat={s} size="md" />
					<div className="flex min-w-0 flex-1 flex-col gap-1">
						<div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
							<CanonSessionTitle
								session={s}
								firstMessage={first}
								className="min-w-40 flex-1"
							/>
							<CanonSessionActions session={s} quiet />
						</div>
						<p
							data-testid="canon-chat-meta"
							className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 type-caption text-text-muted"
						>
							<span
								data-testid="canon-status"
								data-status={s.status}
								className="inline-flex items-center gap-1.5"
							>
								<StatusGlyph tone={status.tone} className={status.ink} />
								{canonReplying(s) ? (
									<span data-testid="canon-turn">Canon is answering…</span>
								) : (
									status.label
								)}
							</span>
							<Dot />
							<CanonModeBadge
								mode={s.mode}
								data-testid="canon-session-mode"
								className="h-5 px-1.5"
							/>
							<Dot />
							<ChatScope session={s} />
							<Dot />
							<span>{startedLabel(s.openedAt, now)}</span>
							<Dot />
							<span
								data-testid="canon-chat-usage"
								className="tabular-nums"
								title={`${formatTokens(s.tokensUsed)} of ${formatTokens(s.tokenHardCeiling)} tokens`}
							>
								{`${formatTokens(s.tokensUsed)} tokens · ${formatUsd(s.spendUsd)}`}
							</span>
						</p>
					</div>
				</div>
				{/* While Canon answers, a thin accent line breathes along the
				    header's edge: the turn is live even when the trace is folded. */}
				{canonReplying(s) ? (
					<span
						aria-hidden="true"
						data-testid="canon-chat-live"
						className="skeleton-pulse absolute inset-x-0 -bottom-px h-0.5 bg-accent"
					/>
				) : null}
			</header>
			<div
				data-testid="canon-chat-thread"
				className={cn("flex-1 py-6", CHAT_COLUMN)}
			>
				<CanonThread session={s} empty="No messages yet. Ask Canon anything." />
			</div>
			<div
				data-testid="home-chat-dock"
				className="sticky bottom-0 bg-card pt-2 pb-10"
			>
				<div
					data-testid="home-chat-composer-column"
					className={COMPOSER_COLUMN}
				>
					{s.status === "open" ? (
						<CanonComposer session={s} modes float />
					) : (
						<div
							data-testid="canon-chat-ended"
							className="flex flex-wrap items-center justify-center gap-3 py-2"
						>
							<Reason>{endedCopy(s)}</Reason>
							{canonReopenBlocked(s) ? (
								<Button asChild variant="outline" size="sm">
									<Link to="/" search={{}} data-testid="canon-chat-ended-new">
										<Plus aria-hidden="true" />
										New chat
									</Link>
								</Button>
							) : null}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

/** An open chat, or the client a client chat is about, as a link to it. */
function ChatScope({ session }: { session: CanonSession }) {
	if (!session.clientId)
		return (
			<span data-testid="canon-chat-scope" className="text-text-muted">
				Open chat
			</span>
		);
	return <ClientScope id={session.clientId} />;
}

function ClientScope({ id }: { id: string }) {
	const client = useClient(id);
	return (
		<Link
			to="/clients/$id"
			params={{ id }}
			data-testid="canon-chat-scope"
			className="text-text-muted underline decoration-border underline-offset-2 hover:text-text hover:decoration-current"
		>
			{client.data?.name ?? "Client"}
		</Link>
	);
}
