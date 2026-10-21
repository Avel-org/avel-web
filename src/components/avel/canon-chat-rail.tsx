import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { CanonSessionListItem } from "avel-server/contract";
import { Archive, MessagesSquare, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { canonMessagesQuery, useCanonChats } from "@/lib/api/canon";
import { relativeTime, useClient } from "@/lib/api/clients";
import { useApiClient } from "@/lib/api/provider";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { canonChatTitle } from "./canon-chat-actions";
import { CanonModeBadge } from "./canon-chat-mode";
import { SearchField } from "./search-field";
import { StatusGlyph, type StatusTone } from "./status-pill";
import { ErrorState, Surface } from "./surface";
import { type ViewOption, ViewToggle } from "./view-toggle";

/*
 * Home's list of chats: New chat, a search by title, Active or Archived,
 * then the chats by latest activity. Each row is a link to its chat
 * (?chat=<id>), named by its title, else its first message once read here,
 * else "Untitled chat", with its mode, its state and when it last moved.
 */

/** The search reads the server this long after the last keystroke. */
export const CANON_CHAT_SEARCH_DEBOUNCE_MS = 300;

type Shelf = "active" | "archived";
const SHELVES: readonly ViewOption<Shelf>[] = [
	{ id: "active", label: "Active", icon: MessagesSquare },
	{ id: "archived", label: "Archived", icon: Archive },
];

const STATE: Record<
	CanonSessionListItem["status"],
	{ label: string; tone: StatusTone; ink: string }
> = {
	open: { label: "Open", tone: "pending", ink: "text-gate-pending" },
	closed: { label: "Closed", tone: "stale", ink: "text-gate-stale" },
	halted: { label: "Halted", tone: "block", ink: "text-gate-block" },
};

function useDebounced(value: string, ms: number): string {
	const [settled, setSettled] = useState(value);
	useEffect(() => {
		const timer = window.setTimeout(() => setSettled(value), ms);
		return () => window.clearTimeout(timer);
	}, [value, ms]);
	return settled;
}

export function CanonChatRail({
	selectedId,
	onPick,
}: {
	selectedId: string | null;
	/** A row or New chat was followed: a drawer closes. */
	onPick?: () => void;
}) {
	const [shelf, setShelf] = useState<Shelf>("active");
	const [text, setText] = useState("");
	const q = useDebounced(text, CANON_CHAT_SEARCH_DEBOUNCE_MS);
	const chats = useCanonChats({ archived: shelf === "archived", q });
	const now = useNow();
	return (
		<nav
			aria-label="Chats"
			data-testid="canon-chat-rail"
			className="flex min-h-0 flex-col gap-3"
		>
			<Button asChild variant="outline" data-testid="canon-chat-new">
				<Link to="/" search={{}} onClick={onPick}>
					<Plus aria-hidden="true" />
					New chat
				</Link>
			</Button>
			<SearchField
				value={text}
				onChange={setText}
				label="Search chats"
				placeholder="Search by name"
				data-testid="canon-chat-search"
			/>
			<ViewToggle
				options={SHELVES}
				view={shelf}
				onChange={setShelf}
				testIdPrefix="canon-chat-shelf"
				className="w-full [&>button]:flex-1"
			/>
			<Surface
				data-testid="canon-chat-list"
				query={chats}
				isEmpty={(data) => data.pages.every((p) => p.data.length === 0)}
				loading={
					<div className="flex flex-col gap-1.5">
						{[0, 1, 2].map((n) => (
							<Skeleton key={n} className="h-12 w-full rounded-control" />
						))}
					</div>
				}
				empty={
					<p
						data-testid="canon-chat-list-empty"
						className="px-1 type-small text-text-muted"
					>
						{q.trim() !== ""
							? "No chat has that name."
							: shelf === "archived"
								? "No archived chats."
								: "No chats yet. Write below to start one."}
					</p>
				}
				error={ErrorState}
			>
				{(data) => (
					<div className="flex flex-col gap-2">
						<ul className="flex flex-col gap-0.5">
							{data.pages
								.flatMap((p) => p.data)
								.map((chat) => (
									<ChatRow
										key={chat.id}
										chat={chat}
										selected={chat.id === selectedId}
										now={now}
										onPick={onPick}
									/>
								))}
						</ul>
						{chats.hasNextPage ? (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								data-testid="canon-chat-load-more"
								disabled={chats.isFetchingNextPage}
								onClick={() => void chats.fetchNextPage()}
							>
								{chats.isFetchingNextPage ? "Loading…" : "Load more"}
							</Button>
						) : null}
					</div>
				)}
			</Surface>
		</nav>
	);
}

function ChatRow({
	chat,
	selected,
	now,
	onPick,
}: {
	chat: CanonSessionListItem;
	selected: boolean;
	now: number;
	onPick?: () => void;
}) {
	// The thread if it is already read here; never fetched for the list.
	const messages = useQuery({
		...canonMessagesQuery(useApiClient(), chat.id),
		enabled: false,
	});
	const name = canonChatTitle(chat.title, messages.data?.[0]?.contentMd);
	const state = STATE[chat.status];
	return (
		<li>
			<Link
				to="/"
				search={{ chat: chat.id }}
				onClick={onPick}
				// "true", not "page": the sidebar's Home link is the page.
				aria-current={selected ? "true" : undefined}
				data-testid={`canon-chat-row-${chat.id}`}
				className={cn(
					"flex min-w-0 flex-col gap-1 rounded-control px-2.5 py-2 transition-colors duration-(--duration-micro) ease-avel hover:bg-app-raised",
					selected && "bg-chip hover:bg-chip",
				)}
			>
				<span
					className={cn(
						"truncate type-small font-medium",
						chat.title ? "text-text" : "text-text-muted",
					)}
				>
					{name}
				</span>
				<span className="flex min-w-0 items-center gap-1.5 type-caption text-text-subtle">
					<CanonModeBadge mode={chat.mode} className="h-[18px] px-1.5" />
					<span className="inline-flex items-center gap-1">
						<StatusGlyph tone={state.tone} className={state.ink} />
						{state.label}
					</span>
					{chat.clientId ? <ClientName id={chat.clientId} /> : null}
					<span className="ml-auto shrink-0 tabular-nums">
						{relativeTime(chat.lastActivityAt, now)}
					</span>
				</span>
			</Link>
		</li>
	);
}

/** A client chat's client, by name once read. */
function ClientName({ id }: { id: string }) {
	const client = useClient(id);
	return (
		<span data-testid="canon-chat-row-client" className="min-w-0 truncate">
			{client.data?.name ?? "Client"}
		</span>
	);
}
