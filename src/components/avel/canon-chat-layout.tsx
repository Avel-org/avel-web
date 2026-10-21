import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PAGE_GUTTER } from "../../shell/page";

/** The thread's column: the page gutter, capped at --chat-max and centred. */
export const CHAT_COLUMN = cn("mx-auto w-full max-w-(--chat-max)", PAGE_GUTTER);

/**
 * The composer is wider than the thread (operator request), so its tool row
 * has room. Local, because --chat-max also sizes the thread.
 */
export const COMPOSER_COLUMN = cn("mx-auto w-full max-w-[52rem]", PAGE_GUTTER);

/** Below md the chat list is a drawer; this opens it. */
export function ChatsButton({ onClick }: { onClick: () => void }) {
	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			data-testid="canon-chat-rail-open"
			className="md:hidden"
			onClick={onClick}
		>
			<PanelLeft aria-hidden="true" />
			Chats
		</Button>
	);
}
