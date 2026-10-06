import { createFileRoute } from "@tanstack/react-router";
import { Surface } from "@/components/avel/surface";
import { linkFor } from "../shell/nav";
import { Page, pageHead } from "../shell/page";

export const Route = createFileRoute("/catalog/skills")({
	staticData: { device: "construction" },
	head: pageHead("/catalog/skills"),
	component: CatalogSkillsPage,
});

function CatalogSkillsPage() {
	return (
		<Page to="/catalog/skills">
			<Surface
				data-testid="skill-library"
				notBuilt={{
					icon: linkFor("/catalog/skills").icon,
					title: "The skill library",
					what: "Browse skills by layer, type and status, with the tools each one grants. Imported skills start as drafts and can be attached once approved.",
					needs: ["skill.list"],
				}}
			/>
		</Page>
	);
}
