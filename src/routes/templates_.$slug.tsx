import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
	TEMPLATE_TABS,
	TemplateDetail,
} from "@/components/avel/template-detail";
import { useTemplate } from "@/lib/api/templates";
import { Page } from "../shell/page";

/** The open tab, so a tab is a link. Overview is no parameter. */
export const templateDetailSearch = z.object({
	tab: z.enum(TEMPLATE_TABS).optional().catch(undefined),
});

// Not nested under /templates (the trailing underscore): the list renders a
// whole page with no outlet, and this page replaces it. Breadcrumbs still
// lead back to Templates, its sidebar ancestor.
export const Route = createFileRoute("/templates_/$slug")({
	staticData: { device: "construction", crumb: ({ slug }) => slug ?? "" },
	validateSearch: templateDetailSearch,
	head: ({ params }) => ({
		meta: [{ title: `${params.slug} · Templates · AVEL` }],
	}),
	component: TemplateRoute,
});

function TemplateRoute() {
	const { slug } = Route.useParams();
	const { tab = "overview" } = Route.useSearch();
	const navigate = Route.useNavigate();
	// The page reads the same template, so its name is in the cache.
	const template = useTemplate(slug);
	return (
		<Page
			title={template.data?.name ?? slug}
			definition="One AVEL project template: the repository, its manifest, and what is built from it."
		>
			<TemplateDetail
				slug={slug}
				tab={tab}
				onTab={(next) =>
					navigate({
						search: { tab: next === "overview" ? undefined : next },
						replace: true,
					})
				}
			/>
		</Page>
	);
}
