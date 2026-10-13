import { Link } from "@tanstack/react-router";
import type { Template } from "avel-server/contract";
import { ArrowRight, GitCommitHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
	missionCountLabel,
	SCOPE_LABEL,
	SCOPE_SUMMARY,
	STARTING_STATE_LABEL,
	STARTING_STATE_SENTENCE,
	templateName,
} from "@/lib/api/templates";
import { cn } from "@/lib/utils";
import { ShortHash } from "./short-hash";
import { TemplateCover } from "./template-cover";
import {
	PlaybookLink,
	TeamLink,
	type TemplateLinks,
	UNREADABLE_COPY,
} from "./template-links";

/*
 * A template as a project card (ruling 48): a plate built from sections,
 * headed by a cover that bleeds to the plate's edges. The cover is drawn
 * from the template's scope and starting state (TemplateCover). Below it the
 * plate's body rises into the cover as a tab carrying the latest commit,
 * then come the title, what it starts as, what it runs with, and a footer.
 *
 * The whole card opens the template's page through its title link,
 * stretched over the plate. The playbook and team links sit above that
 * stretch, so no link is ever inside another, and the keyboard meets the
 * title, then the playbook, then the team.
 */

/** A section's label, engraved. */
function SectionLabel({ children }: { children: ReactNode }) {
	return (
		<span className="engraved type-caption font-medium tracking-wide text-text-subtle uppercase">
			{children}
		</span>
	);
}

function CardSection({
	label,
	section,
	slug,
	children,
}: {
	label: string;
	section: string;
	slug: string;
	children: ReactNode;
}) {
	return (
		<div
			data-testid={`template-card-${section}-${slug}`}
			data-section={section}
			className="flex min-w-0 flex-col gap-2 border-t border-border px-4 py-3"
		>
			<SectionLabel>{label}</SectionLabel>
			{children}
		</div>
	);
}

/** Readable or Not readable: a dot and a word. */
function ReadableStatus({ template }: { template: Template }) {
	return (
		<span
			data-testid={`template-card-status-${template.slug}`}
			data-readable={template.readable}
			className={cn(
				"inline-flex shrink-0 items-center gap-1.5 type-caption font-medium",
				template.readable ? "text-text-muted" : "text-gate-warn",
			)}
		>
			<span
				aria-hidden="true"
				className={cn(
					"size-1.5 rounded-full",
					template.readable ? "bg-gate-pass" : "bg-gate-warn",
				)}
			/>
			{template.readable ? "Readable" : "Not readable"}
		</span>
	);
}

/** What a mission built from it starts as: the starting state, then the scope. */
function StartsAs({ template }: { template: Template }) {
	if (!template.readable) {
		return (
			<p
				data-testid={`template-card-unreadable-${template.slug}`}
				className="type-small text-gate-warn"
			>
				{UNREADABLE_COPY}
			</p>
		);
	}
	const { scope, startingState } = template;
	if (!scope && !startingState) {
		return (
			<p className="type-small text-text-subtle">
				Its manifest names no scope or starting state.
			</p>
		);
	}
	return (
		<div className="flex flex-col gap-1 type-small text-text-muted">
			{startingState ? (
				<p data-testid={`template-card-state-sentence-${template.slug}`}>
					<span className="font-medium text-foreground">
						{`${STARTING_STATE_LABEL[startingState]}. `}
					</span>
					{STARTING_STATE_SENTENCE[startingState]}
				</p>
			) : null}
			{scope ? (
				<p data-testid={`template-card-scope-${template.slug}`}>
					<span className="font-medium text-foreground">
						{`${SCOPE_LABEL[scope]}. `}
					</span>
					{SCOPE_SUMMARY[scope]}
				</p>
			) : null}
		</div>
	);
}

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
				className="group/card plate plate-interactive relative flex h-full min-w-0 flex-col overflow-hidden rounded-md border has-[a[data-stretched]:focus-visible]:-translate-y-px has-[a[data-stretched]:focus-visible]:border-border-strong"
			>
				<TemplateCover
					template={template}
					image={template.cover}
					data-testid={`template-card-cover-${slug}`}
					className="h-44 shrink-0"
				/>

				{/* Title: the tab rising into the cover, then name, status and slug. */}
				<div
					data-testid={`template-card-title-${slug}`}
					data-section="title"
					className="flex min-w-0 flex-col gap-1 bg-app-plate px-4 pb-3"
				>
					<span
						data-testid={`template-card-tab-${slug}`}
						className="cover-tab relative -mt-7 -ml-4 inline-flex h-7 items-center gap-1.5 self-start pr-3 pl-4 type-mono-small text-text-muted"
					>
						<GitCommitHorizontal
							aria-hidden="true"
							className="size-3.5 text-accent-text"
						/>
						{template.latestSha ? (
							// Above the card's stretched link, so Copy is its own control.
							<ShortHash
								value={template.latestSha}
								label="the latest commit"
								data-testid="template-card-sha"
								className="relative z-10"
							/>
						) : (
							<span className="font-sans type-caption text-text-subtle">
								Commit unknown
							</span>
						)}
					</span>
					<span className="flex min-w-0 items-baseline justify-between gap-3 pt-2">
						<h2
							id={nameId}
							className="engraved min-w-0 truncate type-h2 text-foreground"
						>
							<Link
								to="/templates/$slug"
								params={{ slug }}
								data-stretched=""
								data-testid={`template-card-link-${slug}`}
								// Stretched over the card: the whole plate opens the page.
								className="rounded-xs after:absolute after:inset-0 after:content-['']"
							>
								{templateName(template)}
							</Link>
						</h2>
						<ReadableStatus template={template} />
					</span>
					<span
						data-testid={`template-card-slug-${slug}`}
						className="truncate type-mono-small text-text-subtle"
					>
						{slug}
					</span>
				</div>

				<div className="flex flex-1 flex-col bg-app-plate">
					<CardSection label="Starts as" section="starts" slug={slug}>
						<StartsAs template={template} />
					</CardSection>

					<CardSection label="Runs with" section="runs" slug={slug}>
						<dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1.5 type-small">
							<dt className="type-caption text-text-subtle">Playbook</dt>
							<dd className="flex min-w-0">
								<PlaybookLink slug={slug} links={links} full />
							</dd>
							<dt className="type-caption text-text-subtle">Team</dt>
							<dd className="flex min-w-0">
								{template.defaultPresetId === null ? (
									<span
										data-testid={`template-team-none-${slug}`}
										className="text-text-subtle"
									>
										No default team
									</span>
								) : (
									<TeamLink slug={slug} template={template} />
								)}
							</dd>
						</dl>
					</CardSection>

					<div
						data-testid={`template-card-footer-${slug}`}
						className="mt-auto flex items-center justify-between gap-3 border-t border-border px-4 py-2.5"
					>
						<span
							data-testid={`template-card-missions-${slug}`}
							className="type-small text-text-muted tabular-nums"
						>
							{missionCountLabel(template.missionCount)}
						</span>
						{/* The stretched title link is the action; this names it. */}
						<span
							aria-hidden="true"
							data-testid={`template-card-open-${slug}`}
							className="inline-flex items-center gap-1 type-small font-medium text-accent-text"
						>
							Open
							<ArrowRight className="size-4 transition-transform duration-(--duration-micro) ease-avel motion-safe:group-hover/card:translate-x-0.5" />
						</span>
					</div>
				</div>
			</article>
		</li>
	);
}

/** As many columns as fit, never narrower than a card reads. */
const GRID =
	"grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,18rem),1fr))]";

/** The board: a project card per template, in allowlist order. */
export function TemplateBoard({
	templates,
	links,
}: {
	templates: readonly Template[];
	links: TemplateLinks;
}) {
	return (
		<ul aria-label="Templates" data-testid="template-board" className={GRID}>
			{templates.map((template) => (
				<TemplateCard key={template.slug} template={template} links={links} />
			))}
		</ul>
	);
}

/** Three cards in the real shape: cover, tab, title, two sections, footer. */
export function TemplateCardSkeleton() {
	return (
		<ul
			data-testid="template-list-skeleton"
			aria-hidden="true"
			className={GRID}
		>
			{[0, 1, 2].map((i) => (
				<li key={i} className="min-w-0">
					<div className="plate flex flex-col overflow-hidden rounded-md border">
						<div className="template-cover h-44" />
						<div className="flex flex-col gap-2 bg-app-plate px-4 pb-3">
							<span className="cover-tab -mt-7 -ml-4 flex h-7 w-28 items-center pl-4">
								<Skeleton className="h-3 w-16" />
							</span>
							<Skeleton className="mt-2 h-5 w-32" />
							<Skeleton className="h-3 w-24" />
						</div>
						{["w-full", "w-40"].map((width) => (
							<div
								key={width}
								className="flex flex-col gap-2 border-t border-border bg-app-plate px-4 py-3"
							>
								<Skeleton className="h-3 w-16" />
								<Skeleton className={cn("h-4", width)} />
							</div>
						))}
						<div className="flex justify-between border-t border-border bg-app-plate px-4 py-2.5">
							<Skeleton className="h-4 w-20" />
							<Skeleton className="h-4 w-12" />
						</div>
					</div>
				</li>
			))}
		</ul>
	);
}
