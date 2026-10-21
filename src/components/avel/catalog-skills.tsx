import { Link } from "@tanstack/react-router";
import {
	Compass,
	Library,
	MousePointer2,
	Plus,
	Puzzle,
	SearchX,
} from "lucide-react";
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
import {
	CatalogBack,
	CatalogListFooter,
	CatalogListSkeleton,
} from "./catalog-sample";
import { SkillDiscover } from "./catalog-skill-discover";
import { EditSkillForm, NewSkillForm } from "./catalog-skill-editor";
import { SkillInspector } from "./catalog-skill-inspector";
import { SkillSidebar, SkillToolbar } from "./catalog-skill-sidebar";
import { SkillSources } from "./catalog-skill-sources";
import { DataPanel } from "./data-panel";
import { EmptyState } from "./empty-state";
import { PanelFooter } from "./panel-footer";
import { ErrorState, type ErrorStateProps, Surface } from "./surface";

/*
 * The skill library, /catalog/skills (ROUTES.md, SKILLS.md), laid out as a
 * registry: skills grouped by source on the left (GET /api/skills), and on
 * the right one skill's inspector (GET /api/skills/by-slug/:slug), Discover
 * (what sources offer), Sources (where skills come from), a new skill, or
 * the selected skill's editor. Agents never write a skill; an operator does,
 * here.
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
	/** The live list the sidebar shows, owned by the route. */
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
	// panes. Edit is the selected skill's own view.
	const slug = view === undefined || view === "edit" ? selected : undefined;
	const showing = view !== undefined || selected !== undefined;
	return (
		<div data-testid="catalog-skills" className="flex min-h-0 flex-1 gap-4">
			<div
				data-testid="catalog-skills-list-pane"
				className={cn(
					"flex w-full flex-col lg:w-80 lg:shrink-0",
					// Below lg the right pane replaces the list: two panes need the width.
					showing && "max-lg:hidden",
				)}
			>
				{/* The list is the page's panel: when it was read, how many are
					    shown and Load more in its footer band. */}
				<DataPanel
					data-testid="catalog-skills-panel"
					title="Skills"
					count={query.data?.pages[0]?.meta.total}
					toolbar={
						<SkillToolbar
							skills={query.data ? loadedRows(query.data) : []}
							q={q}
							draftsOnly={draftsOnly}
							onFilter={onFilter}
						/>
					}
					footer={
						<PanelFooter
							data-testid="catalog-skills-read-age"
							queries={[query]}
						>
							{query.data ? (
								<CatalogListFooter
									loaded={loadedRows(query.data).length}
									total={query.data.pages[0]?.meta.total}
									hasMore={query.hasNextPage}
									loadingMore={query.isFetchingNextPage}
									onLoadMore={() => query.fetchNextPage()}
									data-testid="catalog-skills-list-footer"
								/>
							) : null}
						</PanelFooter>
					}
				>
					<div className="p-3">
						<Surface
							data-testid="catalog-skills-surface"
							query={query}
							isEmpty={(data) => loadedRows(data).length === 0}
							loading={
								<CatalogListSkeleton data-testid="catalog-skills-skeleton" />
							}
							empty={
								<EmptyState
									data-testid="catalog-skills-empty"
									compact
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
								<SkillSidebar
									skills={loadedRows(data)}
									selected={slug}
									q={q}
									draftsOnly={draftsOnly}
								/>
							)}
						</Surface>
					</div>
				</DataPanel>
			</div>
			<div
				data-testid="catalog-skills-detail-pane"
				className={cn(
					"flex min-w-0 flex-1 flex-col gap-4",
					!showing && "max-lg:hidden",
				)}
			>
				{showing ? (
					<CatalogBack
						to="/catalog/skills"
						label="Back to skills"
						data-testid="catalog-skills-back"
					/>
				) : null}
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
					<EmptyState
						data-testid="catalog-skills-choose"
						icon={MousePointer2}
						title="Choose a skill"
						description="Choose one to see its facts, the roles it attaches to, the agents that carry it and its SKILL.md."
					/>
				)}
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
				description={`Nothing in the library is called “${slug}”. It may have been renamed or retired; choose one from the list.`}
			/>
		) : (
			<ErrorState error={error} retry={retry} retrying={retrying} />
		);
}

/** The inspector's shape while it loads: a title, a line, then panels. */
function SkillInspectorSkeleton() {
	return (
		<div
			data-testid="skill-inspector-skeleton"
			aria-hidden="true"
			className="flex flex-col gap-4"
		>
			<Skeleton className="h-7 w-64" />
			<Skeleton className="h-4 w-40" />
			<Skeleton className="h-32 w-full rounded-card" />
			<Skeleton className="h-48 w-full rounded-card" />
		</div>
	);
}
