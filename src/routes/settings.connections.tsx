import { createFileRoute } from "@tanstack/react-router";
import {
	ConnectionList,
	NewConnectionButton,
} from "@/components/avel/connection-list";
import {
	connectionCountLabel,
	connectionsTotal,
	useConnections,
} from "@/lib/api/connections";
import { Page, pageHead } from "../shell/page";

export const Route = createFileRoute("/settings/connections")({
	staticData: { device: "construction" },
	head: pageHead("/settings/connections"),
	component: SettingsConnectionsPage,
});

/** The route owns the list; the top bar counts from meta.total, never the rows loaded. */
function SettingsConnectionsPage() {
	const connections = useConnections();
	const total = connectionsTotal(connections.data);
	return (
		<Page
			to="/settings/connections"
			subtitle={total === undefined ? undefined : connectionCountLabel(total)}
			actions={<NewConnectionButton />}
		>
			<ConnectionList query={connections} />
		</Page>
	);
}
