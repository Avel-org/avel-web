import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CatalogAgents } from "@/components/avel/catalog-agents";
import {
	catalogCountLabel,
	catalogTotal,
	useAgentTemplates,
} from "@/lib/api/catalog";
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

/** The route owns the list; the top bar counts from meta.total, never the rows loaded. */
function CatalogAgentsPage() {
	const { agent } = Route.useSearch();
	const templates = useAgentTemplates();
	const total = catalogTotal(templates.data);
	return (
		<Page
			to="/catalog/agents"
			subtitle={
				total === undefined
					? undefined
					: catalogCountLabel(total, "agent template", "agent templates")
			}
		>
			<CatalogAgents selected={agent} query={templates} />
		</Page>
	);
}
