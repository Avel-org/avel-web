import { createFileRoute } from "@tanstack/react-router";
import { ExportStatus } from "@/components/avel/export-status";
import { Page } from "../shell/page";

// Keyed on the export's id, so it survives a closed tab, a reload and a
// phone (ROUTES.md). Breadcrumbs lead Missions → the mission → here.
export const Route = createFileRoute("/missions_/$id_/exports/$exportId")({
	// Reading and downloading a finished export is fine from a phone.
	staticData: { device: "approve", crumb: "Export" },
	head: () => ({ meta: [{ title: "Export · Mission · Missions · AVEL" }] }),
	component: ExportRoute,
});

function ExportRoute() {
	const { id, exportId } = Route.useParams();
	return (
		<Page
			title="Export"
			definition="One export: what it shipped, from which gate run, and where it stands."
		>
			<ExportStatus missionId={id} exportId={exportId} />
		</Page>
	);
}
