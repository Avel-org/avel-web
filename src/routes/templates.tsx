import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { TEMPLATE_VIEWS, TemplateList } from "@/components/avel/template-list";
import { ViewToggle } from "@/components/avel/view-toggle";
import { templateCountLabel, useTemplates } from "@/lib/api/templates";
import { Page, pageHead } from "../shell/page";

/**
 * The page's state in the URL. `view` is Board (cards, the default) or
 * Table (ruling 36), so the chosen view survives a reload and is a link.
 */
export const templatesSearch = z.object({
	view: z.enum(["board", "table"]).optional().catch(undefined),
});

export const Route = createFileRoute("/templates")({
	staticData: { device: "construction" },
	validateSearch: templatesSearch,
	head: pageHead("/templates"),
	component: TemplatesPage,
});

function TemplatesPage() {
	const templates = useTemplates();
	const view = Route.useSearch().view ?? "board";
	const navigate = Route.useNavigate();
	return (
		<Page
			to="/templates"
			subtitle={
				templates.data ? templateCountLabel(templates.data.length) : undefined
			}
			actions={
				<ViewToggle
					options={TEMPLATE_VIEWS}
					testIdPrefix="templates-view"
					view={view}
					onChange={(next) =>
						navigate({
							search: next === "board" ? {} : { view: next },
							replace: true,
						})
					}
				/>
			}
		>
			<TemplateList query={templates} view={view} />
		</Page>
	);
}
