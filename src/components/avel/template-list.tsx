import { Link } from "@tanstack/react-router";
import type { Template } from "avel-server/contract";
import { Rows3, SquareKanban } from "lucide-react";
import {
	SCOPE_LABEL,
	STARTING_STATE_LABEL,
	shortSha,
	templateName,
	type useTemplates,
} from "@/lib/api/templates";
import { linkFor } from "@/shell/nav";
import { type DataColumn, DataTable } from "./data-table";
import { EmptyState } from "./empty-state";
import { ErrorState, Surface } from "./surface";
import { TemplateBoard, TemplateCardSkeleton } from "./template-card";
import {
	PlaybookLink,
	TeamLink,
	type TemplateLinks,
	useTemplateLinks,
} from "./template-links";
import type { ViewOption } from "./view-toggle";

/*
 * Templates, /templates: the AVEL project templates, the repositories a
 * mission is built from, read live from templates.list. A board of project
 * cards by default (TemplateCard, ruling 48) and a table for reading
 * (ruling 36). Each template links to the
 * playbook keyed by its slug and to that playbook's default team.
 */

/** Board (cards, the default) or Table (the rows), as the URL's `view` says. */
export type TemplateView = "board" | "table";

/** Board, then Table: the options for the shared view switch. */
export const TEMPLATE_VIEWS = [
	{ id: "board", label: "Board", icon: SquareKanban },
	{ id: "table", label: "Table", icon: Rows3 },
] as const satisfies readonly ViewOption<TemplateView>[];

/** The list. The route owns the query; this renders it. */
export function TemplateList({
	query,
	view = "board",
}: {
	query: ReturnType<typeof useTemplates>;
	view?: TemplateView;
}) {
	const links = useTemplateLinks();
	return (
		<div data-testid="templates" className="flex flex-col gap-4 pb-6">
			<Surface
				data-testid="template-list"
				query={query}
				loading={<TemplateCardSkeleton />}
				empty={
					<EmptyState
						data-testid="templates-empty"
						icon={linkFor("/templates").icon}
						title="No templates yet"
						description="A template is a repository a mission is built from. avel-server lists the ones it allows; none are listed."
					/>
				}
				error={ErrorState}
			>
				{(templates) =>
					view === "table" ? (
						<DataTable
							label="Templates"
							data-testid="template-table"
							// Wider than the column at 900: it scrolls in its own frame.
							stickyHeader={false}
							columns={columns(links)}
							rows={templates}
							getRowId={(row) => row.slug}
						/>
					) : (
						<TemplateBoard templates={templates} links={links} />
					)
				}
			</Surface>
		</div>
	);
}

function columns(links: TemplateLinks): DataColumn<Template>[] {
	const unknown = <span className="font-sans text-text-subtle">Unknown</span>;
	return [
		{
			id: "name",
			header: "Template",
			cell: (row) => (
				<span className="flex flex-col">
					<Link
						to="/templates/$slug"
						params={{ slug: row.slug }}
						data-testid={`template-row-link-${row.slug}`}
						className="font-medium text-foreground underline-offset-4 hover:underline"
					>
						{templateName(row)}
					</Link>
					{row.readable ? null : (
						<span
							data-testid={`template-row-unreadable-${row.slug}`}
							className="type-caption text-gate-warn"
						>
							Not readable
						</span>
					)}
				</span>
			),
		},
		{ id: "slug", header: "Slug", mono: true, cell: (row) => row.slug },
		{
			id: "scope",
			header: "Scope",
			width: "8rem",
			cell: (row) => (row.scope ? SCOPE_LABEL[row.scope] : unknown),
		},
		{
			id: "startingState",
			header: "Starting state",
			width: "9rem",
			cell: (row) =>
				row.startingState ? STARTING_STATE_LABEL[row.startingState] : unknown,
		},
		{
			id: "sha",
			header: "Commit",
			width: "7rem",
			mono: true,
			cell: (row) => (row.latestSha ? shortSha(row.latestSha) : unknown),
		},
		{
			id: "missions",
			header: "Missions",
			width: "6rem",
			align: "end",
			mono: true,
			cell: (row) => String(row.missionCount),
		},
		{
			id: "playbook",
			header: "Playbook",
			width: "9rem",
			cell: (row) => <PlaybookLink slug={row.slug} links={links} />,
		},
		{
			id: "team",
			header: "Default team",
			width: "10rem",
			cell: (row) =>
				row.defaultPresetId === null ? (
					<span className="text-text-subtle">None</span>
				) : (
					<TeamLink slug={row.slug} template={row} />
				),
		},
	];
}
