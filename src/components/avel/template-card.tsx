import { Link } from "@tanstack/react-router";
import type { Template, TemplateScope } from "avel-server/contract";
import {
	ArrowLeftRight,
	ArrowRight,
	Boxes,
	ClipboardCheck,
	Database,
	Layers,
	type LucideIcon,
	Monitor,
	Plug,
	Plus,
	ScrollText,
	Server,
	Users,
	Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime } from "@/lib/api/clients";
import {
	missionCountLabel,
	SCOPE_LABEL,
	SCOPE_SUMMARY,
	STARTING_STATE_LABEL,
	STARTING_STATE_SENTENCE,
	templateName,
} from "@/lib/api/templates";
import { cn } from "@/lib/utils";
import { TemplateCover } from "./template-cover";
import {
	PlaybookLink,
	TeamLink,
	TeamName,
	type TemplateLinks,
	UNREADABLE_COPY,
} from "./template-links";

/*
 * A template as a card (rulings 48 and 49, in v3's style; restored
 * 2026-10-22 at the operator's request): a tile row, the name and its slug,
 * two lines of what it is, its scope and starting state as tags, then what
 * a mission from it runs with (the playbook keyed by its slug, by name with
 * its version and gate count, and the default team), and a footer with its
 * missions and latest commit. The contract carries no description, so the
 * two lines are the scope's and starting state's own sentences
 * (docs/TEMPLATES.md). The whole card opens the template's page through its
 * title link, stretched over the card; the playbook and team links sit above
 * it and never nest inside it.
 *
 * The "Recently used" row has wider cards (RecentTemplateCard): the cover
 * band, then the flow a mission built from it follows, scope to playbook to
 * team, and New mission, disabled with its reason.
 */

/** Each scope's mark. Neutral: an icon in a ringed tile, never a hue. */
export const SCOPE_ICON = {
	"full-stack": Layers,
	frontend: Monitor,
	backend: Server,
	integration: Plug,
	data: Database,
	automation: Workflow,
	migration: ArrowLeftRight,
	audit: ClipboardCheck,
} as const satisfies Record<TemplateScope, LucideIcon>;

/** v3 .tile.tile-ring: a neutral ringed tile holding an icon. */
const TILE =
	"inline-grid shrink-0 place-items-center rounded-tile border border-border bg-app-panel text-text-muted [&_svg]:size-4";

function ScopeTile({ template }: { template: Template }) {
	const Icon = template.scope ? SCOPE_ICON[template.scope] : Boxes;
	return (
		<span
			aria-hidden="true"
			data-testid={`template-card-tile-${template.slug}`}
			className={cn(TILE, "size-tile-md")}
		>
			<Icon />
		</span>
	);
}

/**
 * What the template is, in two lines: the scope's sentence, then the
 * starting state's. An unreadable repository says so instead.
 */
export function templateDescription(template: Template): string {
	if (!template.readable) return UNREADABLE_COPY;
	const parts: string[] = [];
	if (template.scope) parts.push(SCOPE_SUMMARY[template.scope]);
	if (template.startingState)
		parts.push(STARTING_STATE_SENTENCE[template.startingState]);
	return parts.length > 0
		? parts.join(" ")
		: "Its manifest names no scope or starting state.";
}

/** The title link, stretched over its card: the whole card opens the page. */
function TitleLink({ template }: { template: Template }) {
	return (
		<Link
			to="/templates/$slug"
			params={{ slug: template.slug }}
			data-stretched=""
			data-testid={`template-card-link-${template.slug}`}
			className="rounded-xs after:absolute after:inset-0 after:content-['']"
		>
			{templateName(template)}
		</Link>
	);
}

/** v3's option card: a hairline that strengthens on hover, the raised fill under the pointer. */
const CARD =
	"group/card relative flex h-full min-w-0 flex-col overflow-hidden rounded-card border border-border bg-app-panel shadow-card transition-colors duration-(--duration-micro) ease-avel hover:border-border-strong hover:bg-app-raised has-[a[data-stretched]:focus-visible]:border-border-strong";

export function TemplateCard({
	template,
	links,
}: {
	template: Template;
	links: TemplateLinks;
}) {
	const { slug } = template;
	const nameId = `template-card-name-${slug}`;
	return (
		<li data-testid={`template-card-item-${slug}`} className="min-w-0">
			<article
				aria-labelledby={nameId}
				data-testid={`template-card-${slug}`}
				data-readable={template.readable}
				className={CARD}
			>
				<div className="flex flex-1 flex-col gap-3 p-4">
					<div className="flex items-start justify-between gap-3">
						<ScopeTile template={template} />
						{template.readable ? null : (
							<Badge
								variant="outline"
								data-testid={`template-card-unreadable-${slug}`}
								className="text-gate-warn"
							>
								Not readable
							</Badge>
						)}
					</div>
					<div className="flex min-w-0 flex-col gap-1">
						<span className="flex min-w-0 flex-col">
							<h2
								id={nameId}
								title={templateName(template)}
								className="min-w-0 truncate type-title text-text"
							>
								<TitleLink template={template} />
							</h2>
							<span
								data-testid={`template-card-slug-${slug}`}
								title={slug}
								className="truncate type-mono text-text-subtle"
							>
								{slug}
							</span>
						</span>
						<p
							data-testid={`template-card-description-${slug}`}
							className="line-clamp-2 min-h-9 type-small text-text-muted"
						>
							{templateDescription(template)}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-1.5">
						{template.scope ? (
							<Badge
								variant="secondary"
								data-testid={`template-card-scope-${slug}`}
							>
								{SCOPE_LABEL[template.scope]}
							</Badge>
						) : null}
						{template.startingState ? (
							<Badge
								variant="outline"
								data-testid={`template-card-state-${slug}`}
							>
								{STARTING_STATE_LABEL[template.startingState]}
							</Badge>
						) : null}
					</div>
				</div>
				{/* What a mission from it runs with: its playbook and team. */}
				<dl
					data-testid={`template-card-runs-${slug}`}
					className="flex flex-col gap-1.5 border-t border-border px-4 py-3 type-small"
				>
					<div className="flex min-w-0 items-baseline gap-3">
						<dt className="w-16 shrink-0 type-caption text-text-subtle">
							Playbook
						</dt>
						<dd className="min-w-0 flex-1">
							<PlaybookLink slug={slug} links={links} full />
						</dd>
					</div>
					<div className="flex min-w-0 items-baseline gap-3">
						<dt className="w-16 shrink-0 type-caption text-text-subtle">
							Team
						</dt>
						<dd className="min-w-0 flex-1 truncate">
							{template.defaultPresetId === null ? (
								<span
									data-testid={`template-team-${slug}-none`}
									className="text-text-subtle"
								>
									No default team
								</span>
							) : (
								<TeamLink slug={slug} template={template} />
							)}
						</dd>
					</div>
				</dl>
				<div
					data-testid={`template-card-footer-${slug}`}
					className="flex items-center gap-3 border-t border-border px-4 py-2 type-caption text-text-muted tabular-nums"
				>
					<span data-testid={`template-card-missions-${slug}`}>
						{missionCountLabel(template.missionCount)}
					</span>
					{template.latestSha ? (
						<span
							data-testid={`template-card-commit-${slug}`}
							title={template.latestSha}
							className="type-mono text-text-subtle"
						>
							<span aria-hidden="true">{template.latestSha.slice(0, 8)}</span>
							<span className="sr-only">{`Latest commit ${template.latestSha}`}</span>
						</span>
					) : null}
					{/* The stretched title link is the action; this names it. */}
					<span
						aria-hidden="true"
						className="ml-auto inline-flex items-center gap-1 font-medium text-accent-text"
					>
						Open
						<ArrowRight className="size-3.5 transition-transform duration-(--duration-micro) ease-avel motion-safe:group-hover/card:translate-x-0.5" />
					</span>
				</div>
			</article>
		</li>
	);
}

/** One step of the flow a mission follows: a small neutral tile, its name, and what it is. */
function FlowStep({
	icon: Icon,
	label,
	detail,
	"data-testid": testId,
}: {
	icon: LucideIcon;
	label: React.ReactNode;
	/** The muted second line: what the step is ("Scope", "Playbook v1", "Team"). */
	detail: React.ReactNode;
	"data-testid": string;
}) {
	return (
		<span
			data-testid={testId}
			className="flex min-w-0 items-center gap-2 @[30rem]/flow:flex-1"
		>
			<span
				aria-hidden="true"
				className={cn(TILE, "size-tile-sm [&_svg]:size-3.5")}
			>
				<Icon />
			</span>
			<span className="flex min-w-0 flex-col">
				<span className="truncate type-small text-text">{label}</span>
				<span className="truncate type-caption text-text-subtle">{detail}</span>
			</span>
		</span>
	);
}

/**
 * A template in the Recently used row: the cover band, the flow (scope, then
 * the playbook keyed by its slug with its version, then its default team),
 * when a mission built from it last moved, and New mission, disabled with
 * its reason (missions cannot be created yet).
 *
 * Its cover is always the drawn art on the flat band, never the manifest's
 * image: a repository's screenshot brings its own colours, and v3 keeps the
 * page's hues to meaning (no decorative hues). The template's page shows the
 * image. `wide`, for the only card in its row, sets the cover on the left.
 */
export function RecentTemplateCard({
	template,
	links,
	lastActivityAt,
	now,
	wide = false,
}: {
	template: Template;
	links: TemplateLinks;
	lastActivityAt: string;
	now: number;
	wide?: boolean;
}) {
	const { slug } = template;
	const playbook = links.ready ? links.playbookFor(slug) : undefined;
	const ScopeIcon = template.scope ? SCOPE_ICON[template.scope] : Boxes;
	// Across when the three steps fit, down (each arrow turned) when they do
	// not: never two on one line and one below.
	const arrow = (
		<ArrowRight
			aria-hidden="true"
			data-flow-arrow=""
			className="ml-2 size-3.5 shrink-0 rotate-90 text-text-subtle @[30rem]/flow:ml-0 @[30rem]/flow:rotate-0"
		/>
	);
	return (
		<li data-testid={`template-recent-${slug}`} className="min-w-0">
			<article
				aria-labelledby={`template-recent-name-${slug}`}
				data-wide={wide || undefined}
				className={cn(CARD, wide && "md:flex-row")}
			>
				<TemplateCover
					template={template}
					data-testid={`template-recent-cover-${slug}`}
					className={cn(
						"h-28 shrink-0",
						wide && "md:h-auto md:min-h-40 md:w-2/5 md:border-r md:border-b-0",
					)}
				/>
				<div className="flex min-w-0 flex-1 flex-col">
					<div className="flex flex-1 flex-col gap-3 p-4">
						<div className="flex min-w-0 items-baseline justify-between gap-3">
							<h3
								id={`template-recent-name-${slug}`}
								className="min-w-0 truncate type-title text-text"
							>
								<TitleLink template={template} />
							</h3>
							<span
								data-testid={`template-recent-activity-${slug}`}
								className="shrink-0 type-caption text-text-subtle"
							>
								{`Used ${relativeTime(lastActivityAt, now)}`}
							</span>
						</div>
						{/* The container is the wrapper: a query measures its container,
						    and only what is inside it can answer. */}
						<div className="@container/flow min-w-0">
							<div
								data-testid={`template-recent-flow-${slug}`}
								className="flex min-w-0 flex-col gap-1.5 @[30rem]/flow:flex-row @[30rem]/flow:items-center @[30rem]/flow:gap-2"
							>
								<span className="sr-only">A mission from it runs with: </span>
								<FlowStep
									icon={ScopeIcon}
									label={
										template.scope ? SCOPE_LABEL[template.scope] : "Unknown"
									}
									detail="Scope"
									data-testid={`template-recent-flow-scope-${slug}`}
								/>
								{arrow}
								<FlowStep
									icon={ScrollText}
									label={
										links.failed
											? "Unknown"
											: !links.ready
												? "Reading"
												: (playbook?.name ?? "None")
									}
									detail={
										playbook ? `Playbook v${playbook.version}` : "Playbook"
									}
									data-testid={`template-recent-flow-playbook-${slug}`}
								/>
								{arrow}
								<FlowStep
									icon={Users}
									label={
										template.defaultPresetId === null ? (
											"None"
										) : (
											<TeamName id={template.defaultPresetId} />
										)
									}
									detail="Team"
									data-testid={`template-recent-flow-team-${slug}`}
								/>
							</div>
						</div>
					</div>
					<div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2">
						<span className="type-caption text-text-muted tabular-nums">
							{missionCountLabel(template.missionCount)}
						</span>
						{/* Above the card's stretched link, so it is its own control. */}
						<span className="relative z-10">
							<Button
								asChild
								size="sm"
								variant="outline"
								data-testid={`template-recent-new-mission-${slug}`}
							>
								<Link to="/missions" search={{ new: true }}>
									<Plus aria-hidden="true" />
									New mission
								</Link>
							</Button>
						</span>
					</div>
				</div>
			</article>
		</li>
	);
}

/** As many columns as fit, never narrower than a card reads. */
export const TEMPLATE_GRID =
	"grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,18rem),1fr))]";

/** The board: a card per template, in the order given. */
export function TemplateBoard({
	templates,
	links,
}: {
	templates: readonly Template[];
	links: TemplateLinks;
}) {
	return (
		<ul
			aria-label="Templates"
			data-testid="template-board"
			className={TEMPLATE_GRID}
		>
			{templates.map((template) => (
				<TemplateCard key={template.slug} template={template} links={links} />
			))}
		</ul>
	);
}

/** Three cards in the real shape: tile, name, two lines, tag, footer. */
export function TemplateCardSkeleton() {
	return (
		<ul
			data-testid="template-list-skeleton"
			aria-hidden="true"
			className={TEMPLATE_GRID}
		>
			{[0, 1, 2].map((i) => (
				<li key={i} className="min-w-0">
					<div className="flex flex-col overflow-hidden rounded-card border border-border bg-app-panel shadow-card">
						<div className="flex flex-col gap-3 p-4">
							<Skeleton className="size-tile-md rounded-tile" />
							<Skeleton className="h-5 w-32" />
							<Skeleton className="h-4 w-full" />
							<Skeleton className="h-4 w-3/4" />
							<Skeleton className="h-5 w-20 rounded-sm" />
						</div>
						<div className="flex flex-col gap-2 border-t border-border px-4 py-3">
							<Skeleton className="h-4 w-40" />
							<Skeleton className="h-4 w-28" />
						</div>
						<div className="flex justify-between border-t border-border px-4 py-2">
							<Skeleton className="h-4 w-20" />
							<Skeleton className="h-4 w-12" />
						</div>
					</div>
				</li>
			))}
		</ul>
	);
}
