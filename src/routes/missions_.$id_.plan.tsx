import { createFileRoute } from "@tanstack/react-router";
import { MissionPlanPage } from "@/components/avel/plan-page";
import { Page } from "../shell/page";

// Beside the mission page, not inside it (both trailing underscores): the
// mission page has no outlet. Breadcrumbs lead Missions → the mission → here.
export const Route = createFileRoute("/missions_/$id_/plan")({
	// Planning is construction: modules and requirements are built at a desk.
	staticData: { device: "construction", crumb: "Plan" },
	head: () => ({ meta: [{ title: "Plan · Mission · Missions · AVEL" }] }),
	component: MissionPlanRoute,
});

function MissionPlanRoute() {
	const { id } = Route.useParams();
	return (
		<Page
			title="Plan"
			definition="The brief split into modules: what each part of the mission builds, checked against the brief."
		>
			<MissionPlanPage id={id} />
		</Page>
	);
}
