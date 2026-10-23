import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ExportPreflight } from "@/components/avel/export-preflight";
import { Page } from "../shell/page";

/** The preview being reviewed: a dry-run export, so a reload lands on it. */
export const preflightSearch = z.object({
	preview: z.string().uuid().optional().catch(undefined),
});

// Beside the mission page, not inside it (both trailing underscores), as
// the plan is. Breadcrumbs lead Missions → the mission → here.
export const Route = createFileRoute("/missions_/$id_/exports/new")({
	// Initiating a delivery is desk work: never from a phone (ROUTES.md).
	staticData: { device: "construction", crumb: "Export" },
	validateSearch: preflightSearch,
	head: () => ({ meta: [{ title: "Export · Mission · Missions · AVEL" }] }),
	component: PreflightRoute,
});

function PreflightRoute() {
	const { id } = Route.useParams();
	const { preview } = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<Page
			title="Export"
			definition="Preview what delivering the gate's latest run does, then deliver it."
		>
			<ExportPreflight
				missionId={id}
				previewId={preview ?? null}
				onPreviewed={(previewId) =>
					navigate({ search: { preview: previewId }, replace: true })
				}
				onDelivered={(exportId) =>
					navigate({
						to: "/missions/$id/exports/$exportId",
						params: { id, exportId },
					})
				}
			/>
		</Page>
	);
}
