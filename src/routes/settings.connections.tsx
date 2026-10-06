import { createFileRoute } from "@tanstack/react-router";
import { Surface } from "@/components/avel/surface";
import { linkFor } from "../shell/nav";
import { Page, pageHead } from "../shell/page";

export const Route = createFileRoute("/settings/connections")({
	staticData: { device: "construction" },
	head: pageHead("/settings/connections"),
	component: SettingsConnectionsPage,
});

function SettingsConnectionsPage() {
	return (
		<Page to="/settings/connections">
			<Surface
				data-testid="connection-list"
				notBuilt={{
					icon: linkFor("/settings/connections").icon,
					title: "Connected accounts",
					what: "See each connected account's scope and status, and rotate or revoke its access. Tokens are never displayed, only where each one is stored.",
					// ROUTES.md names the connection group but no procedure.
					needs: [],
				}}
			/>
		</Page>
	);
}
