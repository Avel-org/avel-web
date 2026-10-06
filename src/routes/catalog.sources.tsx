import { createFileRoute } from "@tanstack/react-router";
import { Surface } from "@/components/avel/surface";
import { linkFor } from "../shell/nav";
import { Page, pageHead } from "../shell/page";

export const Route = createFileRoute("/catalog/sources")({
	staticData: { device: "construction" },
	head: pageHead("/catalog/sources"),
	component: CatalogSourcesPage,
});

function CatalogSourcesPage() {
	return (
		<Page to="/catalog/sources">
			<Surface
				data-testid="skill-sources"
				notBuilt={{
					icon: linkFor("/catalog/sources").icon,
					title: "Where skills come from",
					what: "The sources your skill library is imported from, kept in one place so every skill can be traced back to its origin.",
					// ROUTES.md lists skillSource procedures as a gap, unnamed.
					needs: [],
				}}
			/>
		</Page>
	);
}
