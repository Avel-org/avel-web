import { createFileRoute } from "@tanstack/react-router";
import { Surface } from "@/components/avel/surface";
import { linkFor } from "../shell/nav";
import { Page, pageHead } from "../shell/page";

export const Route = createFileRoute("/settings/account")({
	staticData: { device: "capture" },
	head: pageHead("/settings/account"),
	component: SettingsAccountPage,
});

function SettingsAccountPage() {
	return (
		<Page to="/settings/account">
			<Surface
				data-testid="account-settings"
				notBuilt={{
					icon: linkFor("/settings/account").icon,
					title: "Your sign-in and preferences",
					what: "Manage how you sign in, review your active sessions and set your preferences.",
					// No doc names a sign-in or session procedure.
					needs: [],
				}}
			/>
		</Page>
	);
}
