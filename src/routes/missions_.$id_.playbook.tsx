import { createFileRoute } from "@tanstack/react-router";
import { MissionPlaybook } from "@/components/avel/playbook-mission";
import { Page } from "../shell/page";

// Beside the mission page, not inside it (both trailing underscores): the
// mission page has no outlet. Breadcrumbs lead Missions → the mission → here.
export const Route = createFileRoute("/missions_/$id_/playbook")({
	// ROUTES.md marks it desktop: the resolved process is read at a desk.
	staticData: { device: "construction", crumb: "Playbook" },
	head: () => ({ meta: [{ title: "Playbook · Mission · Missions · AVEL" }] }),
	component: MissionPlaybookRoute,
});

function MissionPlaybookRoute() {
	const { id } = Route.useParams();
	return (
		<Page
			title="Playbook"
			definition="The process this mission follows, resolved from its type. Read-only."
		>
			<MissionPlaybook id={id} />
		</Page>
	);
}
