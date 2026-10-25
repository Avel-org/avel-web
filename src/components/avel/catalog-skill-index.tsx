import { Link } from "@tanstack/react-router";
import type { SkillLayer, SkillListItem } from "avel-server/contract";
import {
	ArrowRight,
	BookText,
	ChevronRight,
	Compass,
	PenLine,
	Wrench,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SkillStatusPill } from "./catalog-sample";
import { ROW_LINK_GROUP, RowChevron } from "./row-link";
import { SearchField } from "./search-field";

/*
 * The skill library as an index (ruling 52, after ui-skills.com): one
 * reading column, two ways in (write one, or discover one), then every skill
 * as a quiet row in sections. The sections are AVEL's own: what waits for
 * review comes first, then where each skill is delivered. A role skill is
 * part of every identity covering its role; stack and domain skills are
 * given at dispatch. A row is a link, so a skill is a URL.
 */

/** Skills whose name, slug or description holds the text, ignoring case. */
export function filterSkills<T extends SkillListItem>(
	skills: readonly T[],
	q: string | undefined,
	draftsOnly: boolean,
): T[] {
	const needle = q?.trim().toLowerCase() ?? "";
	return skills.filter(
		(skill) =>
			(!draftsOnly || skill.status === "draft") &&
			(needle === "" ||
				skill.name.toLowerCase().includes(needle) ||
				skill.slug.toLowerCase().includes(needle) ||
				skill.description.toLowerCase().includes(needle)),
	);
}

export type SkillSectionId = "review" | SkillLayer | "retired";

/** The index's sections, in reading order, each with what it means. */
export const SKILL_SECTIONS: readonly {
	id: SkillSectionId;
	label: string;
	meaning: string;
}[] = [
	{
		id: "review",
		label: "Needs your review",
		meaning: "Drafts. Nothing attaches until you approve it.",
	},
	{
		id: "role",
		label: "Role skills",
		meaning: "In the identity of every agent that covers the role.",
	},
	{
		id: "stack",
		label: "Stack skills",
		meaning: "Given at dispatch to missions built on that stack.",
	},
	{
		id: "domain",
		label: "Domain skills",
		meaning: "Given at dispatch, for the client's field.",
	},
	{
		id: "retired",
		label: "Retired",
		meaning: "Read-only. They can't be attached again.",
	},
];

/** Which section a skill reads in: its status first, then its layer. */
export function sectionOf(skill: Pick<SkillListItem, "status" | "layer">) {
	if (skill.status === "draft") return "review";
	if (skill.status === "retired") return "retired";
	return skill.layer;
}

/** The skills in sections, in order; empty sections are left out. */
export function skillSections<T extends SkillListItem>(skills: readonly T[]) {
	return SKILL_SECTIONS.map((section) => ({
		...section,
		skills: skills.filter((skill) => sectionOf(skill) === section.id),
	})).filter((section) => section.skills.length > 0);
}

/** "Yours" for AVEL's own, else the source's name: where the row puts an author. */
export function sourceName(skill: Pick<SkillListItem, "source">): string {
	return skill.source.kind === "internal" ? "Yours" : skill.source.name;
}

/**
 * A skill's mark: what kind of thing it is. A book for knowledge an agent
 * reads, a wrench for a capability its room provides. Neutral: the kind is
 * a fact, not a state and not something to act on (audit D3).
 */
export function SkillMark({
	type,
	size = "md",
}: {
	type: SkillListItem["type"];
	size?: "md" | "lg";
}) {
	const Icon = type === "capability" ? Wrench : BookText;
	return (
		<span
			aria-hidden="true"
			data-skill-type={type}
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-tile border border-border bg-app-raised text-text-muted",
				size === "lg" ? "size-11" : "size-tile-lg",
			)}
		>
			<Icon className="size-4" />
		</span>
	);
}

/** The two ways in: write a skill, or discover one from a source. */
function EntryCard({
	to,
	icon: Icon,
	title,
	description,
	"data-testid": testId,
}: {
	to: "new" | "discover";
	icon: typeof PenLine;
	title: string;
	description: string;
	"data-testid": string;
}) {
	return (
		<Link
			to="/catalog/skills"
			search={{ view: to }}
			data-testid={testId}
			className={cn(
				ROW_LINK_GROUP,
				"flex min-w-0 flex-col gap-1 rounded-card border border-border bg-app-panel p-4 shadow-card transition-colors duration-(--duration-micro) ease-avel hover:border-border-strong hover:bg-app-raised",
			)}
		>
			<span className="flex items-center gap-2">
				<Icon aria-hidden="true" className="size-4 text-text-muted" />
				<span className="flex-1 type-title text-text">{title}</span>
				<ArrowRight
					aria-hidden="true"
					className="size-3.5 text-text-subtle transition-[color,translate] duration-(--duration-micro) ease-avel group-hover/row:translate-x-0.5 group-hover/row:text-text"
				/>
			</span>
			<span className="type-small text-text-muted">{description}</span>
		</Link>
	);
}

/** One skill: its mark, name and source, its state, and one line about it. */
export function SkillIndexRow({
	skill,
	q,
	draftsOnly,
}: {
	skill: SkillListItem;
	q: string | undefined;
	draftsOnly: boolean;
}) {
	const retired = skill.status === "retired";
	return (
		<Link
			to="/catalog/skills"
			search={{
				skill: skill.slug,
				q,
				filter: draftsOnly ? "drafts" : undefined,
			}}
			data-testid={`skill-row-${skill.slug}`}
			data-status={skill.status}
			className={cn(
				ROW_LINK_GROUP,
				"focus-inset -mx-3 flex min-w-0 items-center gap-3 rounded-control px-3 py-3 transition-colors duration-(--duration-micro) ease-avel hover:bg-app-raised",
			)}
		>
			<SkillMark type={skill.type} />
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="flex min-w-0 items-baseline gap-2">
					<span
						data-testid="skill-row-name"
						title={skill.name}
						className={cn(
							"min-w-0 truncate type-small font-medium",
							retired ? "text-text-subtle" : "text-text",
						)}
					>
						{skill.name}
					</span>
					<span
						data-testid="skill-row-source"
						className="shrink-0 type-caption text-text-subtle"
					>
						{sourceName(skill)}
					</span>
				</span>
				<span
					title={skill.description}
					className={cn(
						"truncate type-small",
						retired ? "text-text-subtle" : "text-text-muted",
					)}
				>
					{skill.description}
				</span>
			</span>
			<span className="flex shrink-0 items-center gap-2">
				{skill.status === "approved" ? null : (
					<SkillStatusPill
						status={skill.status}
						data-testid={`skill-row-${skill.status}`}
					/>
				)}
				<span className="type-mono text-text-subtle">{`v${skill.version}`}</span>
				<RowChevron />
			</span>
		</Link>
	);
}

/** A section's head: its name with a count, and what it means. */
function SectionHead({
	id,
	label,
	meaning,
	count,
}: {
	id: string;
	label: string;
	meaning: string;
	count: number;
}) {
	return (
		<header className="flex flex-col gap-0.5 pb-1">
			<h2
				id={`skill-section-${id}`}
				className="flex items-center gap-1 type-small font-medium text-text-muted"
			>
				{label}
				<span className="tabular-nums text-text-subtle">{count}</span>
			</h2>
			<p className="type-caption text-text-subtle">{meaning}</p>
		</header>
	);
}

/**
 * The index: the ways in, the filter, then the sections. The filter and the
 * drafts view live in the URL (`q`, `filter=drafts`), as before.
 */
export function SkillIndex({
	skills,
	q,
	draftsOnly,
	onFilter,
	footer,
}: {
	skills: readonly SkillListItem[];
	q: string | undefined;
	draftsOnly: boolean;
	onFilter: (text: string) => void;
	/** The list's read age and paging, under the last section. */
	footer: ReactNode;
}) {
	const sections = skillSections(filterSkills(skills, q, draftsOnly));
	return (
		<div data-testid="skill-index" className="flex flex-col gap-8">
			<div className="grid gap-3 sm:grid-cols-2">
				<EntryCard
					to="new"
					icon={PenLine}
					title="Write a skill"
					description="Knowledge an agent reads, or a tool its room provides. It starts as a draft."
					data-testid="skill-entry-new"
				/>
				<EntryCard
					to="discover"
					icon={Compass}
					title="Discover"
					description="Browse what your sources offer. An import arrives as a draft to review."
					data-testid="skill-entry-discover"
				/>
			</div>
			<div className="flex flex-col gap-2">
				<SearchField
					data-testid="skill-filter"
					label="Search skills by name, slug or description"
					placeholder="Search skills"
					shortcut="/"
					value={q ?? ""}
					onChange={onFilter}
				/>
				{draftsOnly ? (
					<p
						data-testid="skill-drafts-only"
						className="flex items-center gap-2 type-caption text-text-muted"
					>
						Showing drafts only.
						<Link
							to="/catalog/skills"
							search={{ q }}
							className="rounded-xs text-accent-text underline-offset-4 hover:underline"
						>
							Show every skill
						</Link>
					</p>
				) : null}
			</div>
			{sections.length === 0 ? (
				<p
					data-testid="skill-index-none"
					className="type-small text-text-subtle"
				>
					No skill matches.
				</p>
			) : (
				sections.map((section) => (
					<section
						key={section.id}
						aria-labelledby={`skill-section-${section.id}`}
						data-testid={`skill-section-${section.id}`}
						className="flex flex-col"
					>
						<SectionHead
							id={section.id}
							label={section.label}
							meaning={section.meaning}
							count={section.skills.length}
						/>
						<ul className="flex flex-col divide-y divide-border">
							{section.skills.map((skill) => (
								<li key={skill.id}>
									<SkillIndexRow skill={skill} q={q} draftsOnly={draftsOnly} />
								</li>
							))}
						</ul>
					</section>
				))
			)}
			<div className="flex items-center justify-between gap-2 border-t border-border pt-3">
				{footer}
			</div>
		</div>
	);
}

/** Back to the index, as the reference's trail: "Skills › name". */
export function SkillTrail({ current }: { current?: string }) {
	return (
		<nav
			aria-label="Skill"
			data-testid="catalog-skills-back"
			className="flex min-w-0 items-center gap-1 type-small text-text-muted"
		>
			<Link
				to="/catalog/skills"
				// Exact, query included: on /catalog/skills?skill=… this link is
				// the way back, not the current page, so it takes no aria-current.
				activeOptions={{ exact: true }}
				className="rounded-xs hover:text-text"
				data-testid="skill-trail-index"
			>
				Skills
			</Link>
			{current ? (
				<>
					<ChevronRight
						aria-hidden="true"
						className="size-3.5 text-text-subtle"
					/>
					<span
						aria-current="page"
						className="min-w-0 truncate text-text-subtle"
					>
						{current}
					</span>
				</>
			) : null}
		</nav>
	);
}
