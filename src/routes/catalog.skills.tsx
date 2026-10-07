import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { CatalogSkills, SkillsActions } from "@/components/avel/catalog-skills";
import { Page, pageHead } from "../shell/page";

/**
 * The page's state in the URL, so every view is a link and Back walks it.
 * - `skill` is the selected skill's slug.
 * - `view` opens Discover or New skill in place of a skill.
 * - `q` filters the sidebar; `filter=drafts` shows only drafts (the review
 *   banner's link).
 */
export const catalogSkillsSearch = z.object({
	skill: z.string().max(100).optional().catch(undefined),
	view: z.enum(["discover", "new"]).optional().catch(undefined),
	q: z
		.string()
		.max(200)
		.transform((value) => (value.trim() === "" ? undefined : value))
		.optional()
		.catch(undefined),
	filter: z.literal("drafts").optional().catch(undefined),
});

export const Route = createFileRoute("/catalog/skills")({
	staticData: { device: "construction" },
	validateSearch: catalogSkillsSearch,
	head: pageHead("/catalog/skills"),
	component: CatalogSkillsPage,
});

function CatalogSkillsPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: "/catalog/skills" });
	return (
		<Page to="/catalog/skills" actions={<SkillsActions view={search.view} />}>
			<CatalogSkills
				selected={search.skill}
				view={search.view}
				q={search.q}
				draftsOnly={search.filter === "drafts"}
				onFilter={(text) =>
					navigate({
						search: (prev) => ({
							...prev,
							q: text.trim() === "" ? undefined : text,
						}),
						replace: true,
					})
				}
			/>
		</Page>
	);
}
