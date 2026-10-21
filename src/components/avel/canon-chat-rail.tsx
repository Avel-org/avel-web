import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { CanonSessionListItem } from "avel-server/contract";
import {
	Archive,
	BotMessageSquare,
	MessagesSquare,
	PanelLeftClose,
	Plus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { canonMessagesQuery, useCanonChats } from "@/lib/api/canon";
import { useClient } from "@/lib/api/clients";
import { useApiClient } from "@/lib/api/provider";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { canonChatTitle } from "./canon-chat-actions";
import { CANON_MODE_COPY, CANON_MODE_ICON } from "./canon-chat-mode";
import { SearchField } from "./search-field";
import { ErrorState, Surface } from "./surface";
import { type ViewOption, ViewToggle } from "./view-toggle";

/*
 * Home's list of chats: a header with the count and New chat, a search by
 * title, Active or Archived, then the chats by latest activity under day
 * headings (Today, Yesterday, the last week, the last month, then by month).
 * Each row is a link to its chat (?chat=<id>): a tile that says whose it is
 * (Canon's mark for an open chat, the client's initials for a client's),
 * a dot on it while Canon answers or once halted, the name, and below it
 * the client or "Open chat", the mode and when it last moved.
 */

/** The search reads the server this long after the last keystroke. */
export const CANON_CHAT_SEARCH_DEBOUNCE_MS = 300;

type Shelf = "active" | "archived";
const SHELVES: readonly ViewOption<Shelf>[] = [
	{ id: "active", label: "Active", icon: MessagesSquare },
	{ id: "archived", label: "Archived", icon: Archive },
];

const DAY = 24 * 60 * 60 * 1000;

/** Midnight, local time, of the day `at` falls on. */
function dayStart(at: number): number {
	const d = new Date(at);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

/**
 * The chats under their headings, newest first, in the order given (the
 * server sorts by last activity). Older than a month groups by month.
 */
export function chatGroups<
	T extends Pick<CanonSessionListItem, "lastActivityAt">,
>(chats: readonly T[], now: number): { label: string; chats: T[] }[] {
	const today = dayStart(now);
	const groups: { label: string; chats: T[] }[] = [];
	for (const chat of chats) {
		const at = Date.parse(chat.lastActivityAt);
		const label =
			at >= today
				? "Today"
				: at >= today - DAY
					? "Yesterday"
					: at >= today - 7 * DAY
						? "Previous 7 days"
						: at >= today - 30 * DAY
							? "Previous 30 days"
							: new Date(at).toLocaleDateString("en-US", {
									month: "long",
									year: "numeric",
								});
		const last = groups.at(-1);
		if (last?.label === label) last.chats.push(chat);
		else groups.push({ label, chats: [chat] });
	}
	return groups;
}

/**
 * How long ago, as short as a row's corner allows: "now", "6m", "2h",
 * "3d", "2w", then the date ("Aug 2").
 */
export function shortAge(iso: string, now: number): string {
	const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d`;
	if (days < 35) return `${Math.floor(days / 7)}w`;
	return new Date(iso).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
}

/** Up to two initials of a name, for a client chat's tile. */
export function initialsOf(name: string): string {
	const words = name
		.replace(/[^\p{L}\p{N}\s]/gu, " ")
		.split(/\s+/)
		.filter((w) => w !== "");
	return words
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase() ?? "")
		.join("");
}

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
	onHide,
}: {
	selectedId: string | null;
	/** A row or New chat was followed: a drawer closes. */
	onPick?: () => void;
	/** Hides the list beside the chat. Absent in the drawer, which closes. */
	onHide?: () => void;
}) {
	const [shelf, setShelf] = useState<Shelf>("active");
	const [text, setText] = useState("");
	const q = useDebounced(text, CANON_CHAT_SEARCH_DEBOUNCE_MS);
	const chats = useCanonChats({ archived: shelf === "archived", q });
	const total = chats.data?.pages[0]?.meta.total;
	const now = useNow();
	return (
		<nav
			aria-label="Chats"
			data-testid="canon-chat-rail"
			className="flex min-h-0 flex-col gap-3"
		>
			<div className="flex items-center gap-2 px-1">
				<span
					aria-hidden="true"
					className="grid size-7 place-items-center rounded-tile border border-accent-line bg-accent-soft text-accent-text [&_svg]:size-4"
				>
					<BotMessageSquare />
				</span>
				<h2 className="type-small font-semibold text-text">Canon</h2>
				{total === undefined ? null : (
					<Badge
						variant="count"
						data-testid="canon-chat-count"
						className="tabular-nums"
					>
						{total}
					</Badge>
				)}
				<Button
					asChild
					size="sm"
					data-testid="canon-chat-new"
					className="ml-auto"
				>
					<Link to="/" search={{}} onClick={onPick}>
						<Plus aria-hidden="true" />
						New chat
					</Link>
				</Button>
				{onHide ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								data-testid="canon-chat-rail-hide"
								aria-label="Hide chats"
								aria-expanded={true}
								className="-mr-1 text-text-subtle hover:text-text"
								onClick={onHide}
							>
								<PanelLeftClose aria-hidden="true" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">Hide chats</TooltipContent>
					</Tooltip>
				) : null}
			</div>
			<SearchField
				value={text}
				onChange={setText}
				label="Search chats"
				placeholder="Search chats"
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
					<div className="flex flex-col gap-2 pt-1">
						{[0, 1, 2, 3].map((n) => (
							<div key={n} className="flex items-center gap-2.5 px-2">
								<Skeleton className="size-8 shrink-0 rounded-tile" />
								<div className="flex flex-1 flex-col gap-1.5">
									<Skeleton className="h-3.5 w-4/5" />
									<Skeleton className="h-3 w-1/2" />
								</div>
							</div>
						))}
					</div>
				}
				empty={<RailEmpty searched={q.trim() !== ""} shelf={shelf} q={q} />}
				error={ErrorState}
			>
				{(data) => (
					<div className="flex flex-col gap-3">
						{chatGroups(
							data.pages.flatMap((p) => p.data),
							now,
						).map((group) => (
							<section
								key={group.label}
								aria-label={group.label}
								data-testid="canon-chat-group"
								className="flex flex-col gap-0.5"
							>
								<h3 className="px-2 pb-1 type-eyebrow text-text-subtle">
									{group.label}
								</h3>
								<ul className="flex flex-col gap-0.5">
									{group.chats.map((chat) => (
										<ChatRow
											key={chat.id}
											chat={chat}
											selected={chat.id === selectedId}
											now={now}
											onPick={onPick}
										/>
									))}
								</ul>
							</section>
						))}
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

/** No chats: what the shelf or search holds, and where one comes from. */
function RailEmpty({
	searched,
	shelf,
	q,
}: {
	searched: boolean;
	shelf: Shelf;
	q: string;
}) {
	const [title, line] = searched
		? [`No chat named “${q.trim()}”`, "Search matches chat names."]
		: shelf === "archived"
			? ["Nothing archived", "Archive a chat from its menu to keep it here."]
			: ["No chats yet", "Ask Canon anything. Each chat lands here."];
	return (
		<div
			data-testid="canon-chat-list-empty"
			className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border-strong px-4 py-6 text-center"
		>
			<span
				aria-hidden="true"
				className="grid size-9 place-items-center rounded-tile border border-border bg-app-panel text-text-subtle [&_svg]:size-4"
			>
				{shelf === "archived" && !searched ? <Archive /> : <MessagesSquare />}
			</span>
			<p className="type-small font-medium text-text">{title}</p>
			<p className="type-caption text-text-muted">{line}</p>
		</div>
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
	const ModeIcon = CANON_MODE_ICON[chat.mode];
	const ended = chat.status !== "open";
	return (
		<li>
			<Link
				to="/"
				search={{ chat: chat.id }}
				onClick={onPick}
				// "true", not "page": the sidebar's Home link is the page.
				aria-current={selected ? "true" : undefined}
				data-testid={`canon-chat-row-${chat.id}`}
				data-status={chat.status}
				className={cn(
					"group/row relative flex min-w-0 items-center gap-2.5 rounded-control px-2 py-1.5 transition-colors duration-(--duration-micro) ease-avel hover:bg-app-raised",
					selected &&
						"bg-selected hover:bg-selected before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-selected-border",
				)}
			>
				<ChatTile chat={chat} />
				<span className="flex min-w-0 flex-1 flex-col">
					<span className="flex min-w-0 items-baseline gap-2">
						<span
							className={cn(
								"min-w-0 flex-1 truncate type-small font-medium",
								ended || !chat.title ? "text-text-muted" : "text-text",
							)}
						>
							{name}
						</span>
						<time
							dateTime={chat.lastActivityAt}
							title={new Date(chat.lastActivityAt).toLocaleString("en-US")}
							className="shrink-0 type-caption text-text-subtle tabular-nums"
						>
							{shortAge(chat.lastActivityAt, now)}
						</time>
					</span>
					<span className="flex min-w-0 items-center gap-1.5 type-caption text-text-subtle">
						{chat.clientId ? (
							<ClientName id={chat.clientId} />
						) : (
							<span className="truncate">Open chat</span>
						)}
						<span aria-hidden="true">·</span>
						<span
							data-testid="canon-chat-row-mode"
							data-mode={chat.mode}
							className="inline-flex shrink-0 items-center gap-1 [&_svg]:size-3"
						>
							<ModeIcon aria-hidden="true" />
							{CANON_MODE_COPY[chat.mode].label}
						</span>
						{chat.status === "halted" ? (
							<span className="shrink-0 text-gate-block">· Halted</span>
						) : chat.status === "closed" ? (
							<span className="shrink-0">· Closed</span>
						) : null}
					</span>
				</span>
			</Link>
		</li>
	);
}

/**
 * Whose chat it is, as a tile: Canon's mark on an open chat, the client's
 * initials on a client's. A dot on its corner pulses while Canon answers,
 * and stays red once the chat is halted.
 */
export function ChatTile({
	chat,
	size = "sm",
}: {
	chat: Pick<CanonSessionListItem, "clientId" | "status" | "turn">;
	/** sm in a row of the list; md leading the chat's header. */
	size?: "sm" | "md";
}) {
	const answering = chat.status === "open" && chat.turn === "canon";
	return (
		<span
			aria-hidden="true"
			className={cn(
				"relative grid shrink-0 place-items-center rounded-tile border font-semibold",
				size === "md"
					? "size-10 type-small [&_svg]:size-5"
					: "size-8 type-caption [&_svg]:size-4",
				chat.clientId
					? "border-border bg-app-panel text-text-muted"
					: "border-accent-line bg-accent-soft text-accent-text",
				chat.status !== "open" && "opacity-70",
			)}
		>
			{chat.clientId ? (
				<ClientInitials id={chat.clientId} />
			) : (
				<BotMessageSquare />
			)}
			{answering || chat.status === "halted" ? (
				<span
					data-testid="canon-chat-row-dot"
					className={cn(
						"absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-app-panel",
						answering ? "skeleton-pulse bg-accent" : "bg-gate-block-solid",
					)}
				/>
			) : null}
		</span>
	);
}

function ClientInitials({ id }: { id: string }) {
	const client = useClient(id);
	return <>{client.data ? initialsOf(client.data.name) : ""}</>;
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
