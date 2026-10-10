import { createFileRoute } from "@tanstack/react-router";
import { PlaybookDetail } from "@/components/avel/playbook-detail";
import { Page } from "../shell/page";

// Not nested under /playbooks (the trailing underscore): the list renders a
// whole page with no outlet, and this page replaces it. Breadcrumbs still
// lead back to Playbooks, its sidebar ancestor.
export const Route = createFileRoute("/playbooks_/$missionType")({
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
	return (
		<Page
			title={missionType}
			definition="The process one kind of mission follows. Read-only."
		>
			<PlaybookDetail missionType={missionType} />
		</Page>
	);
}
