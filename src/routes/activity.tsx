import { createFileRoute } from "@tanstack/react-router";
import { Surface } from "@/components/avel/surface";
import { linkFor } from "../shell/nav";
import { Page, pageHead } from "../shell/page";

export const Route = createFileRoute("/activity")({
	staticData: { device: "capture" },
	head: pageHead("/activity"),
	component: ActivityPage,
});

function ActivityPage() {
	return (
		<Page to="/activity">
			<Surface
				data-testid="activity-log"
				notBuilt={{
					icon: linkFor("/activity").icon,
					title: "A complete record of what happened",
					what: "Every action across your missions, in order and never edited. Filter by action, entity, mission or date to trace any change to its source.",
					// ROUTES.md names the activity group but no procedure.
					needs: [],
				}}
			/>
		</Page>
	);
}
