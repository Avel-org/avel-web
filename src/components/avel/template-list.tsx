import { Link } from "@tanstack/react-router";
import type { Playbook, Template } from "avel-server/contract";
import { Rows3, SquareKanban } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { loadedPlaybooks, usePlaybooks } from "@/lib/api/playbooks";
import { usePreset } from "@/lib/api/presets";
import {
	missionCountLabel,
	SCOPE_LABEL,
	STARTING_STATE_LABEL,
	shortSha,
	templateName,
	type useTemplates,
} from "@/lib/api/templates";
import { cn } from "@/lib/utils";
import { linkFor } from "@/shell/nav";
import { type DataColumn, DataTable } from "./data-table";
import { EmptyState } from "./empty-state";
import { ErrorState, Surface } from "./surface";
import type { ViewOption } from "./view-toggle";

/*
 * Templates, /templates: the AVEL project templates, the repositories a
 * mission is built from, read live from templates.list. A board of cards by
 * default and a table for reading (ruling 36). Each template links to the
 * playbook keyed by its slug and to that playbook's default team.
 */

/** Board (cards, the default) or Table (the rows), as the URL's `view` says. */
export type TemplateView = "board" | "table";

/** Board, then Table: the options for the shared view switch. */
export const TEMPLATE_VIEWS = [
	{ id: "board", label: "Board", icon: SquareKanban },
	{ id: "table", label: "Table", icon: Rows3 },
] as const satisfies readonly ViewOption<TemplateView>[];

/** Why an unreadable template shows no manifest fields, in one sentence. */
export const UNREADABLE_COPY =
	"AVEL could not read this repository or its manifest, so its name, scope, starting state and commit are unknown.";

/**
 * What the board needs beside each template: the playbook keyed by its
 * slug. `ready` is false until the playbooks are read, so a card never says
 * "No playbook" early. A team's name is read by its id (TeamName).
 */
export type TemplateLinks = {
	ready: boolean;
	failed: boolean;
	playbookFor: (slug: string) => Playbook | undefined;
};

export function useTemplateLinks(): TemplateLinks {
	const playbooks = usePlaybooks();
	const bySlug = new Map(
		(playbooks.data ? loadedPlaybooks(playbooks.data) : []).map((p) => [
			p.missionType,
			p,
		]),
	);
	return {
		ready: playbooks.status === "success",
		failed: playbooks.status === "error",
		playbookFor: (slug) => bySlug.get(slug),
	};
}

/**
 * A team's name, read by its id (GET /api/presets/:id). "Default team"
 * while it loads, and when the team is gone or can't be read: the link
 * still opens it on Teams, which says so.
 */
export function TeamName({ id }: { id: string }) {
	const team = usePreset(id);
	return <>{team.data?.name ?? "Default team"}</>;
}

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
				loading={<TemplateListSkeleton />}
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

/** Three cards in the board's shape: few, so it does not promise many. */
function TemplateListSkeleton() {
	return (
		<div
			data-testid="template-list-skeleton"
			className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
		>
			{[0, 1, 2].map((i) => (
				<div key={i} className="plate flex flex-col gap-3 rounded-md p-4">
					<Skeleton className="h-4 w-40" />
					<Skeleton className="h-3 w-28" />
					<Skeleton className="h-6 w-full" />
					<Skeleton className="h-3 w-32" />
				</div>
			))}
		</div>
	);
}

/**
 * The board: a card per template. The name is the card's link to its page,
 * stretched over the card; the playbook and team links sit above that
 * stretch, so a card holds three links without nesting one in another.
 */
export function TemplateBoard({
	templates,
	links,
}: {
	templates: readonly Template[];
	links: TemplateLinks;
}) {
	return (
		<ul
			data-testid="template-board"
			className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
		>
			{templates.map((template) => (
				<li key={template.slug}>
					<article
						data-testid={`template-card-${template.slug}`}
						data-readable={template.readable}
						className="plate plate-interactive relative flex h-full flex-col gap-3 rounded-md p-4"
					>
						<span className="flex items-baseline justify-between gap-2">
							<Link
								to="/templates/$slug"
								params={{ slug: template.slug }}
								data-testid={`template-card-link-${template.slug}`}
								className="type-body min-w-0 truncate font-medium text-foreground after:absolute after:inset-0 after:rounded-md"
							>
								{templateName(template)}
							</Link>
							<span
								data-testid={`template-card-missions-${template.slug}`}
								className="shrink-0 type-small text-text-muted tabular-nums"
							>
								{missionCountLabel(template.missionCount)}
							</span>
						</span>
						<span
							data-testid={`template-card-slug-${template.slug}`}
							className="type-mono-small text-text-muted"
						>
							{template.slug}
						</span>
						{template.readable ? (
							<TemplateFacts template={template} />
						) : (
							<p
								data-testid={`template-card-unreadable-${template.slug}`}
								className="type-small text-gate-warn"
							>
								{UNREADABLE_COPY}
							</p>
						)}
						<span className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border pt-3 type-small">
							<PlaybookLink slug={template.slug} links={links} />
							<TeamLink slug={template.slug} template={template} />
						</span>
					</article>
				</li>
			))}
		</ul>
	);
}

/** Scope, starting state and the latest commit, as three chips. */
function TemplateFacts({ template }: { template: Template }) {
	const chip =
		"inline-flex h-6 items-center rounded-xs border border-border px-2 type-caption text-text-muted";
	return (
		<span
			data-testid={`template-card-facts-${template.slug}`}
			className="flex flex-wrap gap-1.5"
		>
			{template.scope ? (
				<span data-testid="template-card-scope" className={chip}>
					{SCOPE_LABEL[template.scope]}
				</span>
			) : null}
			{template.startingState ? (
				<span data-testid="template-card-state" className={chip}>
					{STARTING_STATE_LABEL[template.startingState]}
				</span>
			) : null}
			{template.latestSha ? (
				<span
					data-testid="template-card-sha"
					title={template.latestSha}
					className={cn(chip, "type-mono-small")}
				>
					{shortSha(template.latestSha)}
				</span>
			) : null}
		</span>
	);
}

const LINK =
	"relative z-10 rounded-xs text-foreground underline-offset-4 hover:underline";

/** The playbook keyed by this slug, or that there is none. */
export function PlaybookLink({
	slug,
	links,
}: {
	slug: string;
	links: TemplateLinks;
}) {
	if (links.failed)
		return (
			<span
				data-testid={`template-playbook-${slug}`}
				className="text-text-subtle"
			>
				Playbooks could not be read
			</span>
		);
	if (!links.ready)
		return (
			<Skeleton
				data-testid={`template-playbook-${slug}-loading`}
				className="h-4 w-24"
			/>
		);
	const playbook = links.playbookFor(slug);
	return playbook ? (
		<Link
			to="/playbooks/$missionType"
			params={{ missionType: slug }}
			data-testid={`template-playbook-${slug}`}
			className={LINK}
		>
			{`Playbook v${playbook.version}`}
		</Link>
	) : (
		<span
			data-testid={`template-playbook-${slug}`}
			className="text-text-subtle"
		>
			No playbook
		</span>
	);
}

/** The playbook's default team, linked to it on Teams; nothing without one. */
export function TeamLink({
	slug,
	template,
}: {
	slug: string;
	template: Pick<Template, "defaultPresetId">;
}) {
	const id = template.defaultPresetId;
	if (id === null) return null;
	return (
		<Link
			to="/presets"
			search={{ preset: id }}
			data-testid={`template-team-${slug}`}
			className={cn(LINK, "text-text-muted")}
		>
			<TeamName id={id} />
		</Link>
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
