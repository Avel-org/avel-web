import { createFileRoute } from "@tanstack/react-router";
import { MissionPage } from "@/components/avel/mission-page";
import { Page } from "../shell/page";

/** The first eight characters of a mission id: its short name everywhere. */
const short = (id: string) => id.slice(0, 8);

// Not nested under /missions (the trailing underscore): the list renders a
// whole page with no outlet, and this page replaces it rather than sitting
// inside it. Breadcrumbs still lead back to Missions, its sidebar ancestor.
export const Route = createFileRoute("/missions_/$id")({
	// ROUTES.md: the overview works on a phone; its actions are links.
	staticData: { device: "capture", crumb: ({ id }) => short(id ?? "") },
	head: ({ params }) => ({
		meta: [{ title: `${short(params.id)} · Missions · AVEL` }],
	}),
	component: MissionRoute,
});

function MissionRoute() {
	const { id } = Route.useParams();
	return (
		<Page
			title={short(id)}
			definition="One mission: where it stands, what it shipped, and who is on it."
		>
			<MissionPage id={id} />
		</Page>
	);
}
