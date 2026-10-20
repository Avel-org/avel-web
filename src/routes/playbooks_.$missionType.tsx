import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PlaybookBuilder } from "@/components/avel/playbook-builder";
import { Page } from "../shell/page";

// Not nested under /playbooks (the trailing underscore): the list renders a
// whole page with no outlet, and this page replaces it. Breadcrumbs still
// lead back to Playbooks, its sidebar ancestor.
/**
 * `landed` marks an arrival from creating it, so the builder holds the
 * landed highlight once (ruling 35).
 */
export const playbookSearch = z.object({
	landed: z.boolean().optional().catch(undefined),
});

export const Route = createFileRoute("/playbooks_/$missionType")({
	validateSearch: playbookSearch,
	staticData: {
		device: "construction",
		crumb: ({ missionType }) => missionType ?? "",
	},
	head: ({ params }) => ({
		meta: [{ title: `${params.missionType} · Playbooks · AVEL` }],
	}),
	component: PlaybookRoute,
});

function PlaybookRoute() {
	const { missionType } = Route.useParams();
	const { landed } = Route.useSearch();
	return (
		<Page
			title={missionType}
			definition="The process this kind of mission follows. Edit it on the canvas or in Details."
		>
			<div
				data-testid="playbook-page"
				className={landed ? "landed rounded-card" : undefined}
			>
				<PlaybookBuilder missionType={missionType} linkOut />
			</div>
		</Page>
	);
}
