import { Link } from "@tanstack/react-router";
import {
	Compass,
	MousePointerClick,
	Plus,
	SearchX,
	Sparkles,
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
import { SkillInspector } from "./catalog-skill-inspector";
import { NewSkillForm } from "./catalog-skill-new";
import { SkillSidebar, SkillToolbar } from "./catalog-skill-sidebar";
import { DataPanel } from "./data-panel";
import { EmptyState } from "./empty-state";
import { PanelFooter } from "./panel-footer";
import { ErrorState, type ErrorStateProps, Surface } from "./surface";

/*
 * The skill library, /catalog/skills (ROUTES.md, SKILLS.md), laid out as a
 * registry: skills grouped by source on the left (GET /api/skills), and on
 * the right one skill's inspector (GET /api/skills/by-slug/:slug), Discover
 * (what sources offer), or a new skill. Agents never write a skill; an
 * operator does, and those writes are disabled until their forms exist.
 */

export type SkillsView = "discover" | "new";

/** The page's actions: Discover and New skill, each a view in the URL. */
export function SkillsActions({ view }: { view: SkillsView | undefined }) {
	return (
		<>
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
	q,
	draftsOnly,
	onFilter,
}: {
	/** The live list the sidebar shows, owned by the route. */
	query: ReturnType<typeof useSkills>;
	selected: string | undefined;
	view: SkillsView | undefined;
	q: string | undefined;
	draftsOnly: boolean;
	onFilter: (text: string) => void;
}) {
	// A view outranks a selection: Discover and New skill are whole panes.
	const slug = view === undefined ? selected : undefined;
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
									icon={Sparkles}
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
				) : slug !== undefined ? (
					<SkillInspectorPane key={slug} slug={slug} />
				) : (
					<EmptyState
						data-testid="catalog-skills-choose"
						icon={MousePointerClick}
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
	const failed = ({ error, retry, retrying }: ErrorStateProps<ApiError>) =>
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
	return (
		<Surface
			data-testid="skill-inspector-surface"
			query={query}
			// One skill is never empty: a missing one answers NOT_FOUND.
			isEmpty={() => false}
			loading={<SkillInspectorSkeleton />}
			empty={null}
			error={failed}
		>
			{(skill) => <SkillInspector skill={skill} />}
		</Surface>
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
