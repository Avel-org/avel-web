import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import {
	landableFocus,
	MissionLoadoutPage,
} from "@/components/avel/loadout-page";
import { Page } from "../shell/page";

/**
 * The page's state in the URL.
 * - `view` is "table" for the table; absent is the board.
 * - `focus` is where a Resolve link lands: entry:<id>, wave:<A-E> or
 *   role:<role> (loadout-coherence.tsx's focusParam). One that does not
 *   parse is dropped (landableFocus). It is cleared once it has landed.
 */
const loadoutSearch = z.object({
	view: z.literal("table").optional().catch(undefined),
	focus: z
		.string()
		.refine((value) => landableFocus(value) !== null)
		.optional()
		.catch(undefined),
});

// Beside the mission page, not inside it (both trailing underscores): the
// mission page has no outlet. Breadcrumbs lead Missions → the mission → here.
export const Route = createFileRoute("/missions_/$id_/roster")({
	// ROUTES.md marks the loadout desktop: a squad is assembled at a desk.
	staticData: { device: "construction", crumb: "Loadout" },
	validateSearch: loadoutSearch,
	head: () => ({ meta: [{ title: "Loadout · Mission · Missions · AVEL" }] }),
	component: MissionLoadoutRoute,
});

function MissionLoadoutRoute() {
	const { id } = Route.useParams();
	const { view, focus } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	return (
		<Page
			title="Loadout"
			definition="The mission's squad: which agents, in which waves, with what instructions and budget. Coherence updates as you change it."
		>
			<MissionLoadoutPage
				id={id}
				focus={focus}
				view={view === "table" ? "table" : "board"}
				onView={(next) =>
					navigate({
						search: (prev) => ({
							...prev,
							view: next === "table" ? "table" : undefined,
						}),
					})
				}
				onLanded={() =>
					navigate({
						search: (prev) => ({ ...prev, focus: undefined }),
						replace: true,
					})
				}
			/>
		</Page>
	);
}
