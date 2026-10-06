import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
	CatalogSkills,
	NewSkillButton,
} from "@/components/avel/catalog-skills";
import { Page, pageHead } from "../shell/page";

/** `skill` is the selected skill's slug; a selection is a link. */
export const catalogSkillsSearch = z.object({
	skill: z.string().max(100).optional().catch(undefined),
});

export const Route = createFileRoute("/catalog/skills")({
	staticData: { device: "construction" },
	validateSearch: catalogSkillsSearch,
	head: pageHead("/catalog/skills"),
	component: CatalogSkillsPage,
});

function CatalogSkillsPage() {
	const { skill } = Route.useSearch();
	return (
		<Page to="/catalog/skills" actions={<NewSkillButton />}>
			<CatalogSkills selected={skill} />
		</Page>
	);
}
