import { Link } from "@tanstack/react-router";
import type { SkillListItem } from "avel-server/contract";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { skillsNeedingReview } from "./catalog-placeholders";
import { SkillStatusPill } from "./catalog-sample";
import { ROW_LINK_GROUP, RowChevron } from "./row-link";
import { StatusGlyph } from "./status-pill";

/*
 * The Skills sidebar: a filter, the review banner, then every skill grouped
 * by where it came from. "Yours" (AVEL's own, an internal source) comes
 * first, then each vendor or community source by name.
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

export type SkillGroup<T> = { id: string; label: string; skills: T[] };

/** "Yours" first, then each other source by name; empty groups are left out. */
export function groupBySource<T extends SkillListItem>(
	skills: readonly T[],
): SkillGroup<T>[] {
	const yours = skills.filter((skill) => skill.source.kind === "internal");
	const others = new Map<string, SkillGroup<T>>();
	for (const skill of skills) {
		if (skill.source.kind === "internal") continue;
		const group = others.get(skill.source.id) ?? {
			id: skill.source.id,
			label: skill.source.name,
			skills: [],
		};
		group.skills.push(skill);
		others.set(skill.source.id, group);
	}
	const sorted = [...others.values()].sort((a, b) =>
		a.label.localeCompare(b.label),
	);
	return [
		...(yours.length > 0
			? [{ id: "yours", label: "Yours", skills: yours }]
			: []),
		...sorted,
	];
}

/** The banner's words: "1 update needs review", "2 updates need review". */
export function reviewBannerText(count: number): string {
	return count === 1 ? "1 update needs review" : `${count} updates need review`;
}

/**
 * The Skills panel's toolbar: the search, then, while any skill waits for
 * review, the review banner, which is the drafts filter (its link toggles
 * `filter=drafts`). Both live in the URL. `skills` is empty until the list
 * has read, so the banner waits for it.
 */
export function SkillToolbar({
	skills,
	q,
	draftsOnly,
	onFilter,
}: {
	skills: readonly SkillListItem[];
	q: string | undefined;
	draftsOnly: boolean;
	onFilter: (text: string) => void;
}) {
	const review = skillsNeedingReview(skills).length;
	return (
		<div className="flex w-full min-w-0 flex-col gap-2">
			<div className="relative">
				<Search
					aria-hidden="true"
					className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-subtle"
				/>
				<Input
					type="search"
					aria-label="Filter skills"
					placeholder="Filter skills"
					data-testid="skill-filter"
					value={q ?? ""}
					onChange={(event) => onFilter(event.target.value)}
					className="pl-9"
				/>
			</div>
			{review > 0 ? (
				<ReviewBanner count={review} active={draftsOnly} q={q} />
			) : null}
		</div>
	);
}

/** The skills the filters keep, grouped by source: the Skills panel's body. */
export function SkillSidebar({
	skills,
	selected,
	q,
	draftsOnly,
}: {
	skills: readonly SkillListItem[];
	selected: string | undefined;
	q: string | undefined;
	draftsOnly: boolean;
}) {
	const groups = groupBySource(filterSkills(skills, q, draftsOnly));
	return (
		<section
			aria-label="Skills"
			data-testid="skill-sidebar"
			className="flex min-h-0 flex-col gap-3"
		>
			{groups.length === 0 ? (
				<p
					data-testid="skill-sidebar-none"
					className="px-3 py-2 type-small text-text-subtle"
				>
					No skill matches.
				</p>
			) : (
				<div data-testid="skill-sidebar-groups" className="flex flex-col gap-3">
					{groups.map((group) => (
						<section
							key={group.id}
							aria-label={group.label}
							data-testid={`skill-group-${group.id}`}
							className="flex flex-col gap-0.5"
						>
							<h2 className="flex items-baseline gap-1.5 px-3 pb-0.5 type-caption text-text-subtle">
								<span className="font-medium text-text-muted">
									{group.label}
								</span>
								<span className="tabular-nums">{group.skills.length}</span>
							</h2>
							<ul aria-label={group.label} className="flex flex-col gap-0.5">
								{group.skills.map((skill) => (
									<li key={skill.id}>
										<SkillRegistryRow
											skill={skill}
											selected={skill.slug === selected}
											q={q}
											draftsOnly={draftsOnly}
										/>
									</li>
								))}
							</ul>
						</section>
					))}
				</div>
			)}
		</section>
	);
}

/**
 * The review banner. A newer version from a source arrives as a draft with a
 * new hash; nothing updates itself. The banner links to the drafts, and from
 * there back to every skill.
 */
function ReviewBanner({
	count,
	active,
	q,
}: {
	count: number;
	active: boolean;
	q: string | undefined;
}) {
	return (
		<Link
			to="/catalog/skills"
			search={{ q, filter: active ? undefined : "drafts" }}
			data-testid="skill-review-banner"
			data-active={active || undefined}
			className={cn(
				ROW_LINK_GROUP,
				"focus-inset flex min-h-10 items-center gap-2 rounded-control border px-3 py-2 transition-colors duration-(--duration-micro) ease-avel",
				active
					? "border-selected-border bg-selected"
					: "border-border bg-app-panel hover:border-border-strong hover:bg-app-raised",
			)}
		>
			<StatusGlyph tone="pending" className="text-gate-pending" />
			<span className="type-small flex-1 text-foreground">
				{reviewBannerText(count)}
			</span>
			<span className="type-caption text-text-subtle">
				{active ? "Show all" : "Show drafts"}
			</span>
			<RowChevron />
		</Link>
	);
}

/**
 * One skill in the sidebar: its name, its description on one line, and its
 * status when it is not plain approved. A draft and a retired skill each
 * carry the status pill the inspector shows, glyph and word, because a bare
 * dot or a greyed row alone does not say which state it is. A retired skill
 * also goes quiet, its words in the subtle ink (v3 UX 6), never faded by
 * opacity. The row is a link, so a selection is a URL.
 */
export function SkillRegistryRow({
	skill,
	selected,
	q,
	draftsOnly,
}: {
	skill: SkillListItem;
	selected: boolean;
	q: string | undefined;
	draftsOnly: boolean;
}) {
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
			data-selected={selected || undefined}
			className={cn(
				"focus-inset relative flex flex-col gap-0.5 rounded-control px-3 py-2 transition-colors duration-(--duration-micro) ease-avel hover:bg-app-raised",
				selected &&
					"bg-selected before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-accent hover:bg-selected",
			)}
		>
			<span className="flex items-center gap-2">
				<span
					data-testid="skill-row-name"
					className={cn(
						"type-small min-w-0 flex-1 truncate font-medium",
						skill.status === "retired" ? "text-text-subtle" : "text-foreground",
					)}
					title={skill.name}
				>
					{skill.name}
				</span>
				{skill.status === "draft" ? (
					<span
						className="inline-flex"
						title="Draft: waits for review before it can be attached"
					>
						<SkillStatusPill status="draft" data-testid="skill-row-draft" />
					</span>
				) : skill.status === "retired" ? (
					<span
						className="inline-flex"
						title="Retired: read-only, and it can't be attached again"
					>
						<SkillStatusPill status="retired" data-testid="skill-row-retired" />
					</span>
				) : null}
			</span>
			<span
				className={cn(
					"type-caption truncate",
					skill.status === "retired" ? "text-text-subtle" : "text-text-muted",
				)}
			>
				{skill.description}
			</span>
		</Link>
	);
}
