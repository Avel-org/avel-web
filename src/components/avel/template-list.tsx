import { queryOptions, useQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	contract,
	type StartingState,
	TEMPLATE_SCOPES,
	type Template,
	type TemplateScope,
} from "avel-server/contract";
import { Rows3, SearchX, SquareKanban } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { type ApiClient, callPage, queryKeys, useApiClient } from "@/lib/api";
import {
	type MissionOrigin,
	SCOPE_LABEL,
	STARTING_STATE_LABEL,
	templateName,
	type useTemplates,
} from "@/lib/api/templates";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { linkFor } from "@/shell/nav";
import { type DataColumn, DataTable, STRETCHED_LINK } from "./data-table";
import { EmptyState } from "./empty-state";
import { SearchField } from "./search-field";
import { Segmented } from "./segmented";
import { ShortHash } from "./short-hash";
import { ErrorState, Surface } from "./surface";
import {
	RecentTemplateCard,
	TemplateBoard,
	TemplateCardSkeleton,
} from "./template-card";
import {
	PlaybookLink,
	TeamLink,
	type TemplateLinks,
	useTemplateLinks,
} from "./template-links";
import { type ViewOption, ViewToggle } from "./view-toggle";

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

/** How the board and table are ordered. "recent" is by the newest mission built from each. */
export const TEMPLATE_SORTS = ["missions", "name", "recent"] as const;
export type TemplateSort = (typeof TEMPLATE_SORTS)[number];

const SORT_LABEL = {
	missions: "Most missions",
	name: "Name",
	recent: "Recently used",
} as const satisfies Record<TemplateSort, string>;

/** The filters in the URL: scope, starting state, search and sort. */
export type TemplateFilters = {
	scope?: TemplateScope;
	state?: StartingState;
	q: string;
	sort: TemplateSort;
};

/** How many templates the Recently used row shows. */
export const RECENT_TEMPLATES = 3;

// ---------------------------------------------------------------------------
// When each template was last used: the newest activity among the missions
// built from it. missions.list has no per-template "last used", so it is one
// one-row read per template and origin (sorted by last activity), and only
// for templates with missions. Keyed under "missions", so a mission write
// reads them again.

function lastUsedQuery(api: ApiClient, slug: string, origin: MissionOrigin) {
	return queryOptions({
		queryKey: queryKeys.templateMissions.latest(slug, origin),
		queryFn: () =>
			callPage(contract.missions.list, () =>
				api.missions.list({
					query: {
						origin,
						templateRef: slug,
						sort: "lastActivity",
						includeArchived: "true",
						limit: 1,
					},
				}),
			),
		select: (page) => page.data[0]?.lastActivityAt ?? null,
	});
}

/** Each used template's newest mission activity, by slug, once read. */
export function useTemplatesLastUsed(
	templates: readonly Template[] | undefined,
): Map<string, string> {
	const api = useApiClient();
	const used = (templates ?? []).filter((t) => t.missionCount > 0);
	const origins: MissionOrigin[] = ["client", "internal"];
	const reads = useQueries({
		queries: used.flatMap((t) =>
			origins.map((origin) => lastUsedQuery(api, t.slug, origin)),
		),
	});
	const last = new Map<string, string>();
	used.forEach((t, i) => {
		const times = [reads[2 * i]?.data, reads[2 * i + 1]?.data].filter(
			(at): at is string => typeof at === "string",
		);
		const newest = times.sort().at(-1);
		if (newest) last.set(t.slug, newest);
	});
	return last;
}

/** The templates the filters keep, in the chosen order. Pure, so it tests. */
export function filterTemplates(
	templates: readonly Template[],
	filters: TemplateFilters,
	lastUsed: ReadonlyMap<string, string>,
): Template[] {
	const q = filters.q.trim().toLowerCase();
	const kept = templates.filter(
		(t) =>
			(filters.scope === undefined || t.scope === filters.scope) &&
			(filters.state === undefined || t.startingState === filters.state) &&
			(q === "" ||
				[templateName(t), t.slug, t.scope ? SCOPE_LABEL[t.scope] : ""]
					.join(" ")
					.toLowerCase()
					.includes(q)),
	);
	const byName = (a: Template, b: Template) =>
		templateName(a).localeCompare(templateName(b));
	return kept.sort((a, b) =>
		filters.sort === "missions"
			? b.missionCount - a.missionCount || byName(a, b)
			: filters.sort === "recent"
				? (lastUsed.get(b.slug) ?? "").localeCompare(
						lastUsed.get(a.slug) ?? "",
					) || byName(a, b)
				: byName(a, b),
	);
}

/** The Recently used row: the templates with the newest mission activity. */
export function recentTemplates(
	templates: readonly Template[],
	lastUsed: ReadonlyMap<string, string>,
): { template: Template; lastActivityAt: string }[] {
	return templates
		.flatMap((template) => {
			const at = lastUsed.get(template.slug);
			return at ? [{ template, lastActivityAt: at }] : [];
		})
		.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
		.slice(0, RECENT_TEMPLATES);
}

/** The list. The route owns the query and the URL's filters; this renders them. */
export function TemplateList({
	query,
	view = "board",
	filters = { q: "", sort: "missions" },
	onFilters = () => {},
	onView = () => {},
}: {
	query: ReturnType<typeof useTemplates>;
	view?: TemplateView;
	filters?: TemplateFilters;
	onFilters?: (next: Partial<TemplateFilters>) => void;
	onView?: (view: TemplateView) => void;
}) {
	const links = useTemplateLinks();
	const lastUsed = useTemplatesLastUsed(query.data);
	const now = useNow();
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
				{(templates) => {
					const recent = recentTemplates(templates, lastUsed);
					const shown = filterTemplates(templates, filters, lastUsed);
					return (
						<div className="flex flex-col gap-4">
							{view === "board" && recent.length > 0 ? (
								<section
									aria-labelledby="templates-recent-title"
									data-testid="templates-recent"
									className="flex flex-col gap-3"
								>
									<h2 id="templates-recent-title" className="type-eyebrow">
										Recently used
									</h2>
									{/* One card spans the row; two take two columns; three, three. */}
									<ul
										data-count={recent.length}
										className={cn(
											"grid gap-4",
											recent.length === 2 && "md:grid-cols-2",
											recent.length === 3 && "md:grid-cols-2 lg:grid-cols-3",
										)}
									>
										{recent.map(({ template, lastActivityAt }) => (
											<RecentTemplateCard
												key={template.slug}
												template={template}
												links={links}
												lastActivityAt={lastActivityAt}
												now={now}
												wide={recent.length === 1}
											/>
										))}
									</ul>
								</section>
							) : null}
							<TemplateFilterRow
								templates={templates}
								filters={filters}
								onFilters={onFilters}
								view={view}
								onView={onView}
							/>
							{shown.length === 0 ? (
								<EmptyState
									data-testid="templates-no-match"
									icon={SearchX}
									title="No templates match"
									description="Nothing in the allowlist matches these filters."
									action={
										<Button
											size="sm"
											variant="outline"
											data-testid="templates-clear-filters"
											onClick={() =>
												onFilters({
													scope: undefined,
													state: undefined,
													q: "",
												})
											}
										>
											Clear filters
										</Button>
									}
								/>
							) : view === "table" ? (
								<DataTable
									label="Templates"
									data-testid="template-table"
									// Wider than the column at 900: it scrolls in its own frame.
									stickyHeader={false}
									columns={columns(links)}
									rows={shown}
									getRowId={(row) => row.slug}
									linkedRows
									viewKey="templates"
								/>
							) : (
								<TemplateBoard templates={shown} links={links} />
							)}
						</div>
					);
				}}
			</Surface>
		</div>
	);
}

/** One segmented control's options: All, then each value present, with counts. */
function Segments<V extends string>({
	legend,
	testId,
	options,
	value,
	total,
	onChange,
}: {
	legend: string;
	testId: string;
	options: { value: V; label: string; count: number }[];
	value: V | undefined;
	total: number;
	onChange: (value: V | undefined) => void;
}) {
	return (
		<Segmented
			data-testid={testId}
			legend={legend}
			showLegend
			options={[{ value: undefined, label: "All", count: total }, ...options]}
			value={value}
			onChange={onChange}
		/>
	);
}

/**
 * Scope and starting state as segmented controls, each with its count over
 * the whole list (scopes in contract order, only those present), then the
 * search ("/" focuses it), the sort and the Board | Table switch. The switch
 * ends the row, as it ends the panel toolbar on Clients, Connections and
 * Playbooks, so every Board | Table page keeps it in the same place.
 */
function TemplateFilterRow({
	templates,
	filters,
	onFilters,
	view,
	onView,
}: {
	templates: readonly Template[];
	filters: TemplateFilters;
	onFilters: (next: Partial<TemplateFilters>) => void;
	view: TemplateView;
	onView: (view: TemplateView) => void;
}) {
	const [draft, setDraft] = useState(filters.q);
	// The URL keeps q trimmed. A change from elsewhere (Back, a link) replaces
	// the draft; the draft's own write coming back does not, so a typed
	// trailing space survives.
	useEffect(
		() => setDraft((current) => draftFor(current, filters.q)),
		[filters.q],
	);
	useEffect(() => {
		if (draft.trim() === filters.q) return;
		const timer = window.setTimeout(() => onFilters({ q: draft }), 200);
		return () => window.clearTimeout(timer);
	}, [draft, filters.q, onFilters]);

	const countOf = <K extends "scope" | "startingState">(
		key: K,
		value: Template[K],
	) => templates.filter((t) => t[key] === value).length;
	const scopes = TEMPLATE_SCOPES.filter(
		(scope) => countOf("scope", scope) > 0,
	).map((scope) => ({
		value: scope,
		label: SCOPE_LABEL[scope],
		count: countOf("scope", scope),
	}));
	const states = (["greenfield", "brownfield"] as const)
		.filter((state) => countOf("startingState", state) > 0)
		.map((state) => ({
			value: state,
			label: STARTING_STATE_LABEL[state],
			count: countOf("startingState", state),
		}));

	return (
		<div
			data-testid="templates-filters"
			className="flex flex-wrap items-center gap-2"
		>
			<Segments
				legend="Scope"
				testId="templates-scope"
				options={scopes}
				value={filters.scope}
				total={templates.length}
				onChange={(scope) => onFilters({ scope })}
			/>
			{states.length > 1 ? (
				<Segments
					legend="Starts"
					testId="templates-state"
					options={states}
					value={filters.state}
					total={templates.length}
					onChange={(state) => onFilters({ state })}
				/>
			) : null}
			<div className="ml-auto flex flex-wrap items-center gap-2">
				<SearchField
					data-testid="templates-search"
					label="Search templates by name, slug or scope"
					placeholder="Search templates"
					shortcut="/"
					value={draft}
					onChange={setDraft}
					className="w-full sm:w-56"
				/>
				<Select
					value={filters.sort}
					onValueChange={(sort) => onFilters({ sort: sort as TemplateSort })}
				>
					<SelectTrigger
						size="default"
						aria-label="Sort templates"
						data-testid="templates-sort"
						className="w-40"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{TEMPLATE_SORTS.map((sort) => (
							<SelectItem
								key={sort}
								value={sort}
								data-testid={`templates-sort-${sort}`}
							>
								{SORT_LABEL[sort]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<ViewToggle
					options={TEMPLATE_VIEWS}
					testIdPrefix="templates-view"
					view={view}
					onChange={onView}
				/>
			</div>
		</div>
	);
}

/**
 * The search box's text after the URL's q changes: the draft when it is the
 * same search (the URL trims, so "web " stays "web "), otherwise the URL's.
 */
export function draftFor(draft: string, q: string): string {
	return draft.trim() === q ? draft : q;
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
						className={cn(
							"font-medium text-foreground underline-offset-4 hover:underline",
							STRETCHED_LINK,
						)}
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
			cell: (row) =>
				row.latestSha ? (
					<ShortHash
						value={row.latestSha}
						label="the latest commit"
						className="relative z-10"
					/>
				) : (
					unknown
				),
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
			// Above the row's stretched link, so it opens the playbook, not the row.
			cell: (row) => (
				<span className="relative z-10">
					<PlaybookLink slug={row.slug} links={links} />
				</span>
			),
		},
		{
			id: "team",
			header: "Default team",
			width: "10rem",
			cell: (row) =>
				row.defaultPresetId === null ? (
					<span className="text-text-subtle">None</span>
				) : (
					<span className="relative z-10">
						<TeamLink slug={row.slug} template={row} />
					</span>
				),
		},
	];
}
