import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CatalogAgents } from "@/components/avel/catalog-agents";
import { Page, pageHead } from "../shell/page";

/** `agent` is the selected template's slug; a selection is a link. */
export const catalogAgentsSearch = z.object({
	agent: z.string().max(100).optional().catch(undefined),
});

export const Route = createFileRoute("/catalog/agents")({
	staticData: { device: "construction" },
	validateSearch: catalogAgentsSearch,
	head: pageHead("/catalog/agents"),
	component: CatalogAgentsPage,
});

function CatalogAgentsPage() {
	const { agent } = Route.useSearch();
	return (
		<Page to="/catalog/agents">
			<CatalogAgents selected={agent} />
		</Page>
	);
}
