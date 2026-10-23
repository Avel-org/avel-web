import { Link } from "@tanstack/react-router";
import { Compass, Library, Plus, Puzzle, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	isNotFound,
	loadedRows,
	useSkill,
	type useSkills,
} from "@/lib/api/catalog";
import type { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { CatalogListFooter } from "./catalog-sample";
import { SkillDiscover } from "./catalog-skill-discover";
import { EditSkillForm, NewSkillForm } from "./catalog-skill-editor";
import { SkillIndex, SkillTrail } from "./catalog-skill-index";
import { SkillInspector } from "./catalog-skill-inspector";
import { SkillSources } from "./catalog-skill-sources";
import { EmptyState } from "./empty-state";
import { PanelFooter } from "./panel-footer";
import { ErrorState, type ErrorStateProps, Surface } from "./surface";

/*
 * The skill library, /catalog/skills (ROUTES.md, SKILLS.md), as one reading
 * column (ruling 52, after ui-skills.com): the index of every skill (GET
 * /api/skills) in sections, and in its place, one at a time, a skill read as
 * a document (GET /api/skills/by-slug/:slug), Discover, Sources, a new
 * skill, or a skill's editor. The URL says which, so each is a link. Agents
 * never write a skill; an operator does, here.
 */

export type SkillsView = "discover" | "new" | "sources" | "edit";

/** The page's actions: Sources, Discover and New skill, each a view in the URL. */
export function SkillsActions({ view }: { view: SkillsView | undefined }) {
	return (
		<>
			<Button
				size="sm"
				variant="outline"
				className={cn(
					view === "sources" && "border-selected-border bg-selected",
				)}
				asChild
			>
				<Link
					to="/catalog/skills"
					search={{ view: "sources" }}
					data-testid="skills-sources"
					aria-current={view === "sources" ? "page" : undefined}
				>
					<Library aria-hidden="true" />
					Sources
				</Link>
			</Button>
			<Button
				size="sm"
				variant="outline"
				// The selected fill marks the open view; outline alone barely changed.
				className={cn(
					view === "discover" && "border-selected-border bg-selected",
				)}
				asChild
			>
				<Link
					to="/catalog/skills"
					search={{ view: "discover" }}
					data-testid="skills-discover"
					aria-current={view === "discover" ? "page" : undefined}
				>
					<Compass aria-hidden="true" />
					Discover
				</Link>
			</Button>
			<Button size="sm" asChild>
				<Link
					to="/catalog/skills"
					search={{ view: "new" }}
					data-testid="skills-new"
					aria-current={view === "new" ? "page" : undefined}
				>
					<Plus aria-hidden="true" />
					New skill
				</Link>
			</Button>
		</>
	);
}

export function CatalogSkills({
	query,
	selected,
	view,
	source,
	q,
	draftsOnly,
	onFilter,
}: {
	/** The live list the index shows, owned by the route. */
	query: ReturnType<typeof useSkills>;
	selected: string | undefined;
	view: SkillsView | undefined;
	/** The chosen source's id, in Sources. */
	source?: string;
	q: string | undefined;
	draftsOnly: boolean;
	onFilter: (text: string) => void;
}) {
	// A view outranks a selection: Discover, New skill and Sources are whole
	// pages of the column. Edit is the selected skill's own view.
	const slug = view === undefined || view === "edit" ? selected : undefined;
	const showing = view !== undefined || selected !== undefined;
	return (
		<div
			data-testid="catalog-skills"
			className={cn(
				"mx-auto flex w-full min-w-0 flex-col gap-6 pb-10",
				// Sources lists and edits side by side; the rest reads in a column.
				view === "sources" ? "max-w-5xl" : "max-w-3xl",
			)}
		>
			{showing ? <SkillTrail current={trailLabel(view, slug)} /> : null}
			{view === "discover" ? (
				<SkillDiscover />
			) : view === "new" ? (
				<NewSkillForm />
			) : view === "sources" ? (
				<SkillSources
					selected={source}
					skills={query.data ? loadedRows(query.data) : []}
				/>
			) : view === "edit" && slug !== undefined ? (
				<SkillEditPane key={slug} slug={slug} />
			) : slug !== undefined ? (
				<SkillInspectorPane key={slug} slug={slug} />
			) : (
				<Surface
					data-testid="catalog-skills-surface"
					query={query}
					isEmpty={(data) => loadedRows(data).length === 0}
					loading={<SkillIndexSkeleton />}
					empty={
						<EmptyState
							data-testid="catalog-skills-empty"
							icon={Puzzle}
							title="No skills yet"
							description="A skill is text an agent reads, or a tool its room provides. Write one, or import one from a source."
							action={
								<Button size="sm" variant="outline" asChild>
									<Link
										to="/catalog/skills"
										search={{ view: "new" }}
										data-testid="catalog-skills-empty-new"
									>
										<Plus aria-hidden="true" />
										New skill
									</Link>
								</Button>
							}
						/>
					}
					error={ErrorState}
				>
					{(data) => (
						<SkillIndex
							skills={loadedRows(data)}
							q={q}
							draftsOnly={draftsOnly}
							onFilter={onFilter}
							footer={
								<PanelFooter
									data-testid="catalog-skills-read-age"
									queries={[query]}
								>
									<CatalogListFooter
										loaded={loadedRows(data).length}
										total={data.pages[0]?.meta.total}
										hasMore={query.hasNextPage}
										loadingMore={query.isFetchingNextPage}
										onLoadMore={() => query.fetchNextPage()}
										data-testid="catalog-skills-list-footer"
									/>
								</PanelFooter>
							}
						/>
					)}
				</Surface>
			)}
		</div>
	);
}

/** The trail's last step: the open view, or the skill's slug. */
function trailLabel(
	view: SkillsView | undefined,
	slug: string | undefined,
): string | undefined {
	if (view === "discover") return "Discover";
	if (view === "new") return "New skill";
	if (view === "sources") return "Sources";
	if (view === "edit") return slug === undefined ? undefined : `${slug}, edit`;
	return slug;
}

/** The index while it loads: the two cards, the filter, then rows. */
function SkillIndexSkeleton() {
	return (
		<div
			data-testid="catalog-skills-skeleton"
			aria-hidden="true"
			className="flex flex-col gap-8"
		>
			<div className="grid gap-3 sm:grid-cols-2">
				<Skeleton className="h-[5.25rem] rounded-card" />
				<Skeleton className="h-[5.25rem] rounded-card" />
			</div>
			<Skeleton className="h-control-md w-full rounded-control" />
			<div className="flex flex-col gap-1">
				<Skeleton className="mb-2 h-4 w-32" />
				{[0, 1, 2, 3].map((i) => (
					<div key={i} className="flex items-center gap-3 py-3">
						<Skeleton className="size-tile-lg rounded-tile" />
						<span className="flex flex-1 flex-col gap-1.5">
							<Skeleton className="h-3.5 w-40" />
							<Skeleton className="h-3.5 w-11/12" />
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

/**
 * The selected skill, read by its slug with its text. NOT_FOUND is a stale
 * link, not a failure: it says so. Any other error is the standard error
 * state.
 */
export function SkillInspectorPane({ slug }: { slug: string }) {
	const query = useSkill(slug);
	return (
		<Surface
			data-testid="skill-inspector-surface"
			query={query}
			// One skill is never empty: a missing one answers NOT_FOUND.
			isEmpty={() => false}
			loading={<SkillInspectorSkeleton />}
			empty={null}
			error={staleSlug(slug)}
		>
			{(skill) => <SkillInspector skill={skill} />}
		</Surface>
	);
}

/** The selected skill's editor, read by its slug with its text, as the inspector is. */
export function SkillEditPane({ slug }: { slug: string }) {
	const query = useSkill(slug);
	return (
		<Surface
			data-testid="skill-edit-surface"
			query={query}
			isEmpty={() => false}
			loading={<SkillInspectorSkeleton />}
			empty={null}
			error={staleSlug(slug)}
		>
			{(skill) => <EditSkillForm skill={skill} />}
		</Surface>
	);
}

/** A failed read by slug: NOT_FOUND is a stale link, said in words. */
function staleSlug(slug: string) {
	return ({ error, retry, retrying }: ErrorStateProps<ApiError>) =>
		isNotFound(error) ? (
			<EmptyState
				data-testid="catalog-skills-not-found"
				icon={SearchX}
				title="No skill with this name"
				description={`Nothing in the library is called “${slug}”. It may have been renamed or retired; go back to Skills and choose one.`}
			/>
		) : (
			<ErrorState error={error} retry={retry} retrying={retrying} />
		);
}

/** A skill's shape while it loads: the head, its pin, then the text. */
function SkillInspectorSkeleton() {
	return (
		<div
			data-testid="skill-inspector-skeleton"
			aria-hidden="true"
			className="flex flex-col gap-6"
		>
			<div className="flex items-center gap-3">
				<Skeleton className="size-11 rounded-tile" />
				<span className="flex flex-col gap-1.5">
					<Skeleton className="h-6 w-48" />
					<Skeleton className="h-3.5 w-24" />
				</span>
			</div>
			<Skeleton className="h-4 w-full" />
			<Skeleton className="h-11 w-full rounded-control" />
			<Skeleton className="h-64 w-full rounded-card" />
		</div>
	);
}
