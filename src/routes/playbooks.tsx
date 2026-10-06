import { createFileRoute } from "@tanstack/react-router";
import { Surface } from "@/components/avel/surface";
import { linkFor } from "../shell/nav";
import { Page, pageHead } from "../shell/page";

export const Route = createFileRoute("/playbooks")({
	staticData: { device: "construction" },
	head: pageHead("/playbooks"),
	component: PlaybooksPage,
});

function PlaybooksPage() {
	return (
		<Page to="/playbooks">
			<Surface
				data-testid="playbook-list"
				notBuilt={{
					icon: linkFor("/playbooks").icon,
					title: "A playbook for each kind of mission",
					what: "Define the gates, waves and deliverables each mission type follows. Every edit shows what it changes about what can ship.",
					// The docs name playbook.getForType for one type, but no list.
					needs: [],
				}}
			/>
		</Page>
	);
}
