import { Link } from "@tanstack/react-router";
import { PanelLeftOpen, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStoredState } from "@/lib/stored";
import { cn } from "@/lib/utils";
import { CanonChatRail } from "./canon-chat-rail";
import { CanonChatStart } from "./canon-chat-start";
import { CanonChatView } from "./canon-chat-view";

/**
 * Canon's chat, full height with nothing around it (ruling 16): the chat
 * list on the left (a drawer below md), and the chat on the right. With no
 * chat chosen it is a new one: Canon's welcome over the composer, and the
 * first message opens the session. A chat is a link (?chat=<id>).
 *
 * From md the list is an inset panel with its own border, not a hairline
 * down the canvas, and the viewer can hide it (kept per viewer, as the
 * sidebar's rail is). Hidden, it leaves a slim strip with Show chats and
 * New chat, in the same place the panel's own controls were.
 */
const CHAT_RAIL = ["open", "closed"] as const;
type ChatRail = (typeof CHAT_RAIL)[number];

export function HomeChat({
	chatId = null,
	onOpenChat = () => {},
}: {
	chatId?: string | null;
	/** Show a chat that was just made. */
	onOpenChat?: (sessionId: string) => void;
}) {
	const [drawer, setDrawer] = useState(false);
	const showChats = () => setDrawer(true);
	const [rail, setRail] = useStoredState<ChatRail>(
		"avel.chatRail",
		"open",
		CHAT_RAIL,
	);
	const open = rail === "open";
	return (
		<div data-testid="home-chat" className="flex flex-1">
			{/* Sticky under the top bar while the canvas scrolls the thread, and
			    as tall as the canvas below it, so its own list scrolls. Hiding
			    narrows it to the strip and the chat widens into the space; the
			    panel keeps its width, so nothing in it re-lays out mid-slide. */}
			<aside
				data-testid="home-chat-rail"
				data-state={rail}
				className={cn(
					"sticky top-(--topbar-height) hidden h-[calc(100dvh_-_var(--topbar-height)_-_2_*_var(--canvas-inset))] shrink-0 self-start overflow-hidden transition-[width] duration-(--duration-state) ease-avel md:block",
					open ? "w-76" : "w-14",
				)}
			>
				<div
					inert={!open}
					className={cn(
						"flex h-full w-76 pt-1 pb-3 pl-3 transition-opacity duration-(--duration-state) ease-avel",
						!open && "opacity-0",
					)}
				>
					<div className="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto rounded-card border border-border bg-app-band p-3">
						<CanonChatRail
							selectedId={chatId}
							onHide={() => setRail("closed")}
						/>
					</div>
				</div>
				<div
					data-testid="home-chat-strip"
					inert={open}
					className={cn(
						"absolute inset-y-0 left-0 flex flex-col items-center gap-1 pt-4 pl-3 transition-opacity duration-(--duration-state) ease-avel",
						open && "pointer-events-none opacity-0",
					)}
				>
					<StripHint label="Show chats">
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							data-testid="home-chat-rail-show"
							aria-label="Show chats"
							aria-expanded={false}
							className="text-text-subtle hover:text-text"
							onClick={() => setRail("open")}
						>
							<PanelLeftOpen aria-hidden="true" />
						</Button>
					</StripHint>
					<StripHint label="New chat">
						<Button
							asChild
							variant="ghost"
							size="icon-sm"
							data-testid="home-chat-strip-new"
							className="text-text-subtle hover:text-text"
						>
							<Link to="/" search={{}} aria-label="New chat">
								<Plus aria-hidden="true" />
							</Link>
						</Button>
					</StripHint>
				</div>
			</aside>
			<Sheet open={drawer} onOpenChange={setDrawer}>
				<SheetContent side="left" className="md:hidden">
					<SheetHeader>
						<SheetTitle>Chats</SheetTitle>
						<SheetDescription className="sr-only">
							Your chats with Canon, newest activity first.
						</SheetDescription>
					</SheetHeader>
					<div className="min-h-0 overflow-y-auto px-4 pb-4">
						<CanonChatRail
							selectedId={chatId}
							onPick={() => setDrawer(false)}
						/>
					</div>
				</SheetContent>
			</Sheet>
			<div className="flex min-w-0 flex-1 flex-col">
				{chatId ? (
					<CanonChatView
						key={chatId}
						sessionId={chatId}
						onShowChats={showChats}
					/>
				) : (
					<CanonChatStart onStarted={onOpenChat} onShowChats={showChats} />
				)}
			</div>
		</div>
	);
}

function StripHint({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent side="right">{label}</TooltipContent>
		</Tooltip>
	);
}
