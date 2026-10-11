import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PlaybookBuilder } from "@/components/avel/playbook-builder";
import { StatusPill } from "@/components/avel/status-pill";
import { usePlaybook } from "@/lib/api/playbooks";
import { Page } from "../shell/page";

// Not nested under /playbooks (the trailing underscore): the list renders a
// whole page with no outlet, and this page replaces it. Breadcrumbs still
// lead back to Playbooks, its sidebar ancestor.
/**
 * `landed` marks an arrival from creating it, so the builder holds the
 * landed highlight once (ruling 35).
 */
export const playbookSearch = z.object({
	landed: z.boolean().optional().catch(undefined),
});

export const Route = createFileRoute("/playbooks_/$missionType")({
	validateSearch: playbookSearch,
	staticData: {
		device: "construction",
		crumb: ({ missionType }) => missionType ?? "",
	},
	head: ({ params }) => ({
		meta: [{ title: `${params.missionType} · Playbooks · AVEL` }],
	}),
	component: PlaybookRoute,
});

function PlaybookRoute() {
	const { missionType } = Route.useParams();
	const { landed } = Route.useSearch();
	return (
		<Page
			title={missionType}
			definition="The process this kind of mission follows. Edit it on the canvas or in Properties."
			actions={<VersionPill missionType={missionType} />}
		>
			<div
				data-testid="playbook-page"
				className={landed ? "landed rounded-md" : undefined}
			>
				<PlaybookBuilder missionType={missionType} />
			</div>
		</Page>
	);
}

/** The stored version, once the playbook is loaded. */
function VersionPill({ missionType }: { missionType: string }) {
	const playbook = usePlaybook(missionType);
	return playbook.data ? (
		<StatusPill
			size="sm"
			tone="pass"
			label={`v${playbook.data.version}`}
			data-testid="playbook-version-pill"
		/>
	) : null;
}
