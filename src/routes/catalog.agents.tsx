import { createFileRoute } from "@tanstack/react-router";
import { CatalogAgents } from "@/components/avel/catalog-agents";
import {
	catalogCountLabel,
	catalogTotal,
	useAgentTemplates,
} from "@/lib/api/catalog";
import { Page, pageHead } from "../shell/page";

export const Route = createFileRoute("/catalog/agents")({
	staticData: { device: "construction" },
	head: pageHead("/catalog/agents"),
	component: CatalogAgentsPage,
});

/** The route owns the list; the top bar counts from meta.total, never the rows loaded. */
function CatalogAgentsPage() {
	const templates = useAgentTemplates();
	const total = catalogTotal(templates.data);
	return (
		<Page
			to="/catalog/agents"
			subtitle={
				total === undefined
					? undefined
					: catalogCountLabel(total, "agent", "agents")
			}
		>
			<CatalogAgents query={templates} />
		</Page>
	);
}
