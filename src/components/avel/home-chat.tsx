import { useState } from "react";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { CanonChatRail } from "./canon-chat-rail";
import { CanonChatStart } from "./canon-chat-start";
import { CanonChatView } from "./canon-chat-view";

/**
 * Canon's chat, full height with nothing around it (ruling 16): the chat
 * list on the left (a drawer below md), and the chat on the right. With no
 * chat chosen it is a new one: Canon's welcome over the composer, and the
 * first message opens the session. A chat is a link (?chat=<id>).
 */
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
	return (
		<div data-testid="home-chat" className="flex flex-1">
			{/* Sticky under the top bar while the canvas scrolls the thread, and
			    as tall as the canvas below it, so its own list scrolls. */}
			<aside
				data-testid="home-chat-rail"
				className="sticky top-(--topbar-height) hidden h-[calc(100dvh_-_var(--topbar-height)_-_2_*_var(--canvas-inset))] w-72 shrink-0 flex-col self-start overflow-y-auto border-r border-border p-3 md:flex"
			>
				<CanonChatRail selectedId={chatId} />
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
