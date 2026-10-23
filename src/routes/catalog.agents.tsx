import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { NewAgentButton } from "@/components/avel/agent-create";
import { CatalogAgents } from "@/components/avel/catalog-agents";
import {
	catalogCountLabel,
	catalogTotal,
	useAgentTemplates,
} from "@/lib/api/catalog";
import { Page, pageHead } from "../shell/page";

/** The view is a link (ruling 36): "graph" for the graph; absent is the cards. */
export const catalogAgentsSearch = z.object({
	view: z.literal("graph").optional().catch(undefined),
});

export const Route = createFileRoute("/catalog/agents")({
	staticData: { device: "construction" },
	validateSearch: catalogAgentsSearch,
	head: pageHead("/catalog/agents"),
	component: CatalogAgentsPage,
});

/** The route owns the list; the top bar counts from meta.total, never the rows loaded. */
function CatalogAgentsPage() {
	const templates = useAgentTemplates();
	const total = catalogTotal(templates.data);
	const { view } = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<Page
			to="/catalog/agents"
			subtitle={
				total === undefined
					? undefined
					: catalogCountLabel(total, "agent", "agents")
			}
			actions={<NewAgentButton />}
		>
			<CatalogAgents
				query={templates}
				view={view ?? "cards"}
				onViewChange={(next) =>
					navigate({
						search: { view: next === "graph" ? "graph" : undefined },
						replace: true,
					})
				}
			/>
		</Page>
	);
}
