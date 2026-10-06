import { cn } from "@/lib/utils";
import { PAGE_GUTTER } from "../../shell/page";
import { ChatComposer } from "./chat-composer";

// The thread's column: the page gutter, capped at --chat-max and centred.
const COLUMN = cn("mx-auto w-full max-w-(--chat-max)", PAGE_GUTTER);
// The composer is wider than the thread (operator request), so its tool row
// has room. Local, because --chat-max also sizes the thread.
const COMPOSER_COLUMN = cn("mx-auto w-full max-w-[52rem]", PAGE_GUTTER);

/**
 * Canon's chat, full height with nothing around it (ruling 16). A new
 * conversation is empty on the client, so the thread shows Canon's one quiet
 * opening line; that is the true state, not a stand-in for data. avel-server
 * has no chat endpoint, so the line under it says so plainly, and Send is
 * disabled with the same reason in its tooltip.
 */
export function HomeChat() {
	return (
		<div data-testid="home-chat" className="flex flex-1 flex-col">
			{/* The prompt sits at the optical centre of the space above the
			    composer: two parts above to three below, so it reads as centred
			    rather than sinking toward the input. */}
			<div
				data-testid="home-chat-thread"
				className={cn("flex flex-1 flex-col items-center py-8", COLUMN)}
			>
				<div aria-hidden="true" className="flex-2" />
				<div className="flex max-w-md flex-col items-center gap-2 text-center">
					<p data-testid="home-chat-prompt" className="type-h2 text-foreground">
						What should we work on?
					</p>
					<p
						data-testid="home-chat-note"
						className="type-small text-text-subtle"
					>
						Canon can't answer yet: chat is not built.
					</p>
				</div>
				<div aria-hidden="true" className="flex-3" />
			</div>
			<div
				data-testid="home-chat-dock"
				className="sticky bottom-0 bg-card pt-2 pb-10"
			>
				<div
					data-testid="home-chat-composer-column"
					className={COMPOSER_COLUMN}
				>
					<ChatComposer sendDisabledReason="Chat is not built yet. avel-server has no chat endpoint." />
				</div>
			</div>
		</div>
	);
}
