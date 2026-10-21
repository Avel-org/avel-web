import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { HomeChat } from "@/components/avel/home-chat";
import { Page, pageHead } from "../shell/page";

/**
 * The open chat in the URL, so a chat is a link: `chat` is its session id.
 * Absent is a new chat.
 */
export const homeSearch = z.object({
	chat: z.string().uuid().optional().catch(undefined),
});

export const Route = createFileRoute("/")({
	staticData: { device: "capture" },
	validateSearch: homeSearch,
	head: pageHead("/"),
	component: HomePage,
});

// Canon, chat-first (AVEL-DESIGN.md ruling 16): the conversation fills the
// content area under the top bar, which names the page from nav.ts.
function HomePage() {
	const { chat } = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<Page to="/" canvas>
			<HomeChat
				chatId={chat ?? null}
				onOpenChat={(id) => void navigate({ search: { chat: id } })}
			/>
		</Page>
	);
}
