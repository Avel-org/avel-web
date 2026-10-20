import { Link, type LinkProps } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { linkFor } from "../../shell/nav";
import { PAGE_GUTTER } from "../../shell/page";
import { ChatComposer } from "./chat-composer";
import { Reason } from "./reason";

/**
 * What the operator can do now, while chat is not built: each a real route,
 * so a chip navigates rather than sending a message. Its icon is its page's
 * sidebar icon.
 */
const SUGGESTIONS = [
	{
		id: "needs-you",
		label: "Missions that need me",
		to: "/missions",
		search: { status: "needs-you" },
	},
	{
		id: "running",
		label: "Running dispatches",
		// Active missions, under the dashboard's Running now board.
		to: "/missions",
		search: { status: "active" },
	},
	// Three: one row in the thread's 45rem column (a fourth wrapped alone).
	{ id: "client", label: "Find a client", to: "/clients" },
] as const satisfies readonly ({
	id: string;
	label: string;
	to: "/missions" | "/clients";
} & Pick<LinkProps, "search">)[];

// The thread's column: the page gutter, capped at --chat-max and centred.
const COLUMN = cn("mx-auto w-full max-w-(--chat-max)", PAGE_GUTTER);
// The composer is wider than the thread (operator request), so its tool row
// has room. Local, because --chat-max also sizes the thread.
const COMPOSER_COLUMN = cn("mx-auto w-full max-w-[52rem]", PAGE_GUTTER);

/**
 * Canon's chat, full height with nothing around it (ruling 16). A new
 * conversation is empty on the client, so the thread shows Canon's welcome:
 * its one question, the true state rather than a stand-in for data.
 * avel-server has no chat endpoint, so a Reason line under it says so, Send
 * is disabled with the same reason in its tooltip, and suggestion chips lead
 * to the pages that can answer now.
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
				{/* The v3 welcome: the question at display size, why Canon is quiet
				    as a Reason line, then a row of places to go instead. */}
				<div className="flex w-full flex-col items-center gap-3 text-center">
					<p
						data-testid="home-chat-prompt"
						className="type-display text-foreground"
					>
						What should we work on?
					</p>
					<Reason data-testid="home-chat-note">
						Canon can't answer yet: chat is not built.
					</Reason>
					<nav
						aria-label="Suggestions"
						data-testid="home-chat-suggestions"
						className="mt-3 flex flex-wrap justify-center gap-2"
					>
						{SUGGESTIONS.map((s) => {
							const Icon = linkFor(s.to).icon;
							return (
								<Button key={s.id} asChild variant="outline" size="sm">
									<Link
										to={s.to}
										search={"search" in s ? s.search : undefined}
										data-testid={`home-chat-suggestion-${s.id}`}
									>
										<Icon aria-hidden="true" />
										{s.label}
									</Link>
								</Button>
							);
						})}
					</nav>
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
