import { createFileRoute } from "@tanstack/react-router";
import { Surface } from "@/components/avel/surface";
import { linkFor } from "../shell/nav";
import { Page, pageHead } from "../shell/page";

export const Route = createFileRoute("/settings/repositories")({
	staticData: { device: "construction" },
	head: pageHead("/settings/repositories"),
	component: SettingsRepositoriesPage,
});

function SettingsRepositoriesPage() {
	return (
		<Page to="/settings/repositories">
			<Surface
				data-testid="repo-policies"
				notBuilt={{
					icon: linkFor("/settings/repositories").icon,
					title: "Repository policies",
					what: "Set how AVEL may deliver to each repository. A repository without a policy is never pushed to directly on its default branch, so the safe default needs no setup.",
					// ROUTES.md names the repo-policy group but no procedure.
					needs: [],
				}}
			/>
		</Page>
	);
}
