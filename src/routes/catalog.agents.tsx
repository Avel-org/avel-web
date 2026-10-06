import { createFileRoute } from "@tanstack/react-router";
import { Surface } from "@/components/avel/surface";
import { linkFor } from "../shell/nav";
import { Page, pageHead } from "../shell/page";

export const Route = createFileRoute("/catalog/agents")({
	staticData: { device: "construction" },
	head: pageHead("/catalog/agents"),
	component: CatalogAgentsPage,
});

function CatalogAgentsPage() {
	return (
		<Page to="/catalog/agents">
			<Surface
				data-testid="agent-templates"
				notBuilt={{
					icon: linkFor("/catalog/agents").icon,
					title: "Agent templates and their identities",
					what: "Review each agent's generated identity and every earlier version, each with its hash. An identity changes only when its role does, so this view is read-only.",
					needs: ["agentTemplate.list"],
				}}
			/>
		</Page>
	);
}
