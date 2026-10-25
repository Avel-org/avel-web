import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PlaybookBuilder } from "@/components/avel/playbook-builder";
import { usePlaybook } from "@/lib/api/playbooks";
import { Page } from "../shell/page";

// Not nested under /presets (the trailing underscore): Teams renders a whole
// page with no outlet, and this page replaces it. Playbooks are the second
// section of Teams, so breadcrumbs lead back to Teams, its sidebar ancestor.
/**
 * `landed` marks an arrival from creating it, so the builder holds the
 * landed highlight once (ruling 35).
 */
export const playbookSearch = z.object({
	landed: z.boolean().optional().catch(undefined),
});

export const Route = createFileRoute("/presets_/playbooks/$missionType")({
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
	// The playbook by its name once read ("Booking template"); the mission
	// type it is keyed by shows in the builder beside the name.
	const playbook = usePlaybook(missionType);
	return (
		<Page
			title={playbook.data?.name ?? missionType}
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
