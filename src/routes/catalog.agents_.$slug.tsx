import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AGENT_TABS, AgentDetail } from "@/components/avel/agent-detail";
import { useAgentTemplate } from "@/lib/api/catalog";
import { Page } from "../shell/page";

/** The open tab and, on Tools and access, the mission it reads. Both links. */
export const agentDetailSearch = z.object({
	tab: z.enum(AGENT_TABS).optional().catch(undefined),
	mission: z.string().uuid().optional().catch(undefined),
});

// Not nested under /catalog/agents (the trailing underscore): the list renders
// a whole page with no outlet, and this page replaces it. Breadcrumbs still
// lead back to All agents, its sidebar ancestor.
export const Route = createFileRoute("/catalog/agents_/$slug")({
	staticData: { device: "construction", crumb: ({ slug }) => slug ?? "" },
	validateSearch: agentDetailSearch,
	head: ({ params }) => ({
		meta: [{ title: `${params.slug} · All agents · AVEL` }],
	}),
	component: AgentRoute,
});

function AgentRoute() {
	const { slug } = Route.useParams();
	const { tab = "overview", mission } = Route.useSearch();
	const navigate = Route.useNavigate();
	// The page reads the same template, so its name is in the cache.
	const agent = useAgentTemplate(slug);
	return (
		<Page
			title={agent.data?.name ?? slug}
			definition="One agent: who it is, what it may touch, and how it has done."
		>
			<AgentDetail
				slug={slug}
				tab={tab}
				mission={mission}
				onTab={(next) =>
					navigate({
						search: (prev) => ({
							...prev,
							tab: next === "overview" ? undefined : next,
						}),
						replace: true,
					})
				}
				onMission={(next) =>
					navigate({
						search: (prev) => ({ ...prev, mission: next }),
						replace: true,
					})
				}
			/>
		</Page>
	);
}
