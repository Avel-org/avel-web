import { Link } from "@tanstack/react-router";
import type { Skill } from "avel-server/contract";
import { Compass, MousePointerClick, Plus, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SAMPLE_SKILLS } from "./catalog-placeholders";
import { CatalogBack } from "./catalog-sample";
import { SkillDiscover } from "./catalog-skill-discover";
import { SkillInspector } from "./catalog-skill-inspector";
import { NewSkillForm } from "./catalog-skill-new";
import { SkillSidebar } from "./catalog-skill-sidebar";
import { EmptyState } from "./empty-state";

/*
 * The skill library, /catalog/skills (ROUTES.md, SKILLS.md), laid out as a
 * registry: skills grouped by source on the left, and on the right one
 * skill's inspector, Discover (what sources offer), or a new skill. Agents
 * never write a skill; an operator does, and those writes are disabled until
 * avel-server has the routes. Every skill shown is a labelled sample from
 * catalog-placeholders.ts (AVEL-DESIGN.md ruling 32).
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
				className={cn(view === "discover" && "border-accent bg-state-selected")}
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

/**
 * The skill to inspect, read from the same list the sidebar shows, so the
 * two never disagree. A view outranks a selection: Discover and New skill
 * are whole panes.
 */
export function selectedSkill<T extends { slug: string }>(
	skills: readonly T[],
	view: SkillsView | undefined,
	selected: string | undefined,
): T | undefined {
	if (view !== undefined || selected === undefined) return undefined;
	return skills.find((skill) => skill.slug === selected);
}

export function CatalogSkills({
	skills = SAMPLE_SKILLS,
	selected,
	view,
	q,
	draftsOnly,
	onFilter,
}: {
	/**
	 * The skills the sidebar lists, and the only place a selection is read
	 * from, so the list and the inspector can never disagree.
	 */
	skills?: readonly Skill[];
	selected: string | undefined;
	view: SkillsView | undefined;
	q: string | undefined;
	draftsOnly: boolean;
	onFilter: (text: string) => void;
}) {
	const skill = selectedSkill(skills, view, selected);
	const showing = view !== undefined || selected !== undefined;
	return (
		<div data-testid="catalog-skills" className="flex min-h-0 flex-1 gap-6">
			<div
				data-testid="catalog-skills-list-pane"
				className={cn(
					"flex w-full flex-col gap-3 lg:w-80 lg:shrink-0",
					// Below lg the right pane replaces the list: two panes need the width.
					showing && "max-lg:hidden",
				)}
			>
				<SkillSidebar
					skills={skills}
					selected={skill?.slug}
					q={q}
					draftsOnly={draftsOnly}
					onFilter={onFilter}
				/>
			</div>
			<div
				data-testid="catalog-skills-detail-pane"
				className={cn(
					"flex min-w-0 flex-1 flex-col gap-4 lg:border-l lg:border-border lg:pl-6",
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
				) : skill ? (
					<SkillInspector key={skill.slug} skill={skill} />
				) : selected ? (
					<EmptyState
						data-testid="catalog-skills-not-found"
						icon={SearchX}
						title="No skill with this name"
						description={`Nothing in the library is called “${selected}”. It may have been renamed or retired; choose one from the list.`}
					/>
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
