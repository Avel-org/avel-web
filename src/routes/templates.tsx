import { createFileRoute } from "@tanstack/react-router";
import { startingState, templateScope } from "avel-server/contract";
import { useCallback } from "react";
import { z } from "zod";
import {
	TEMPLATE_SORTS,
	type TemplateFilters,
	TemplateList,
} from "@/components/avel/template-list";
import {
	missionCountLabel,
	templateCountLabel,
	useTemplates,
} from "@/lib/api/templates";
import { Page, pageHead } from "../shell/page";

/**
 * The page's state in the URL. `view` is Board (cards, the default) or
 * Table (ruling 36); `scope`, `state`, `q` and `sort` filter and order both,
 * so a filtered list survives a reload and is a link.
 */
export const templatesSearch = z.object({
	view: z.enum(["board", "table"]).optional().catch(undefined),
	scope: templateScope.optional().catch(undefined),
	state: startingState.optional().catch(undefined),
	q: z.string().trim().max(200).optional().catch(undefined),
	sort: z.enum(TEMPLATE_SORTS).optional().catch(undefined),
});

export const Route = createFileRoute("/templates")({
	staticData: { device: "construction" },
	validateSearch: templatesSearch,
	head: pageHead("/templates"),
	component: TemplatesPage,
});

/**
 * "4 templates, 9 missions built from them": the count, then the real
 * missions built from them (each template's missionCount, summed).
 */
export function templatesSubtitle(
	templates: readonly { missionCount: number }[],
): string {
	const missions = templates.reduce((sum, t) => sum + t.missionCount, 0);
	const built =
		missions === 0
			? "no missions built from them yet"
			: `${missionCountLabel(missions).toLowerCase()} built from them`;
	return `${templateCountLabel(templates.length)}, ${built}`;
}

function TemplatesPage() {
	const templates = useTemplates();
	const search = Route.useSearch();
	const view = search.view ?? "board";
	const navigate = Route.useNavigate();
	const filters: TemplateFilters = {
		scope: search.scope,
		state: search.state,
		q: search.q ?? "",
		sort: search.sort ?? "missions",
	};
	// Stable, so the search box's debounce does not restart on every render.
	const onFilters = useCallback(
		(next: Partial<TemplateFilters>) =>
			navigate({
				search: (prev) => ({
					...prev,
					...next,
					// Defaults leave the URL, so the plain page is plain /templates.
					q: next.q === undefined ? prev.q : next.q || undefined,
					sort:
						next.sort === undefined
							? prev.sort
							: next.sort === "missions"
								? undefined
								: next.sort,
				}),
				replace: true,
			}),
		[navigate],
	);
	return (
		<Page
			to="/templates"
			subtitle={templates.data ? templatesSubtitle(templates.data) : undefined}
		>
			<TemplateList
				query={templates}
				view={view}
				filters={filters}
				onFilters={onFilters}
				onView={(next) =>
					navigate({
						search: (prev) => ({
							...prev,
							view: next === "board" ? undefined : next,
						}),
						replace: true,
					})
				}
			/>
		</Page>
	);
}
