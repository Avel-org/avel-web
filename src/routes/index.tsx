import { createFileRoute } from "@tanstack/react-router";
import { HomeChat } from "@/components/avel/home-chat";
import { Page, pageHead } from "../shell/page";

export const Route = createFileRoute("/")({
	staticData: { device: "capture" },
	head: pageHead("/"),
	component: HomePage,
});

// Canon, chat-first (AVEL-DESIGN.md ruling 16): the conversation fills the
// content area under the top bar, which names the page from nav.ts.
function HomePage() {
	return (
		<Page to="/" canvas>
			<HomeChat />
		</Page>
	);
}
