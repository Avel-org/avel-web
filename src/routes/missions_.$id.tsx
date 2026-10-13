import { createFileRoute } from "@tanstack/react-router";
import { useMission } from "@/components/avel/mission-data";
import { MissionPage } from "@/components/avel/mission-page";
import { missionLabel } from "@/shell/command-search";
import { Page } from "../shell/page";

// Not nested under /missions (the trailing underscore): the list renders a
// whole page with no outlet, and this page replaces it rather than sitting
// inside it. Breadcrumbs still lead back to Missions, its sidebar ancestor.
export const Route = createFileRoute("/missions_/$id")({
	// ROUTES.md: the overview works on a phone; its actions are links.
	// A mission has no name and its id is never shown: the tab says
	// "Mission", and the crumb and the title name it once it is read.
	staticData: {
		device: "capture",
		crumb: "Mission",
		useCrumbName: ({ id }) => {
			const mission = useMission(id ?? "");
			return mission.data ? missionLabel(mission.data) : undefined;
		},
	},
	head: () => ({ meta: [{ title: "Mission · Missions · AVEL" }] }),
	component: MissionRoute,
});

function MissionRoute() {
	const { id } = Route.useParams();
	// MissionPage reads the same mission, so this shares its request.
	const mission = useMission(id);
	return (
		<Page
			title={mission.data ? missionLabel(mission.data) : "Mission"}
			definition="One mission: where it stands, what it shipped, and who is on it."
		>
			<MissionPage id={id} />
		</Page>
	);
}
