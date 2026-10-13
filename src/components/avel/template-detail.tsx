import { Link } from "@tanstack/react-router";
import type { Playbook, Template } from "avel-server/contract";
import { ListChecks, SearchX, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { isNotFound } from "@/lib/api/catalog";
import type { ApiError } from "@/lib/api/errors";
import {
	missionCountLabel,
	SCOPE_LABEL,
	SCOPE_SUMMARY,
	STARTING_STATE_LABEL,
	STARTING_STATE_SENTENCE,
	templateName,
	useTemplate,
} from "@/lib/api/templates";
import { cn } from "@/lib/utils";
import { linkFor } from "@/shell/nav";
import { EmptyState } from "./empty-state";
import {
	BANNER_BUTTON,
	BannerStat,
	BannerStatus,
	type BannerTab,
	BannerTile,
	EntityBanner,
} from "./entity-banner";
import { DELIVERABLE_LABEL, gateSummary } from "./playbook-list";
import { SectionPanel } from "./section-panel";
import { ErrorState, type ErrorStateProps, Surface } from "./surface";
import { TemplateCover } from "./template-cover";
import {
	TeamName,
	type TemplateLinks,
	UNREADABLE_COPY,
	useTemplateLinks,
} from "./template-links";
import { TemplateMissions } from "./template-missions";

/*
 * One template's page (ruling 38): the entity banner, then one tab at a time.
 * Everything on it is live: the template from templates.get, its playbook
 * from playbooks.list (keyed by the template's slug) and its team's name
 * from presets.list.
 */

export const TEMPLATE_TABS = ["overview", "playbook", "missions"] as const;

export type TemplateTabId = (typeof TEMPLATE_TABS)[number];

const TAB_LABEL: Record<TemplateTabId, string> = {
	overview: "Overview",
	playbook: "Playbook",
	missions: "Missions",
};

/** "Full stack · Greenfield · template-booking"; just the slug when unread. */
export function templateFacts(template: Template): string {
	return [
		template.scope ? SCOPE_LABEL[template.scope] : null,
		template.startingState
			? STARTING_STATE_LABEL[template.startingState]
			: null,
		template.slug,
	]
		.filter((part): part is string => part !== null)
		.join(" · ");
}

export function TemplateDetail({
	slug,
	tab,
	onTab,
}: {
	slug: string;
	tab: TemplateTabId;
	onTab: (tab: TemplateTabId) => void;
}) {
	const query = useTemplate(slug);
	const failed = ({ error, retry, retrying }: ErrorStateProps<ApiError>) =>
		isNotFound(error) ? (
			<EmptyState
				data-testid="template-detail-not-found"
				icon={SearchX}
				title="No template with this name"
				description={`No template is called “${slug}”. avel-server lists only the templates it allows; choose one from Templates.`}
			/>
		) : (
			<ErrorState error={error} retry={retry} retrying={retrying} />
		);
	return (
		<Surface
			data-testid="template-detail-surface"
			query={query}
			// One template is never empty: a missing one answers NOT_FOUND.
			isEmpty={() => false}
			loading={
				<div
					data-testid="template-detail-skeleton"
					className="flex flex-col gap-6"
				>
					<Skeleton className="h-48 w-full rounded-md" />
					<Skeleton className="h-64 w-full rounded-md" />
				</div>
			}
			empty={null}
			error={failed}
		>
			{(template) => (
				<TemplatePage template={template} tab={tab} onTab={onTab} />
			)}
		</Surface>
	);
}

function TemplatePage({
	template,
	tab,
	onTab,
}: {
	template: Template;
	tab: TemplateTabId;
	onTab: (tab: TemplateTabId) => void;
}) {
	const links = useTemplateLinks();
	const playbook = links.playbookFor(template.slug);
	const name = templateName(template);
	// The mission count is the only count a route supplies.
	const tabs: BannerTab[] = TEMPLATE_TABS.map((id) => ({
		id,
		label: TAB_LABEL[id],
		...(id === "missions" ? { count: template.missionCount } : {}),
	}));
	return (
		<Tabs
			value={tab}
			onValueChange={(next) => onTab(next as TemplateTabId)}
			data-testid="template-detail"
			data-template={template.slug}
			className="min-w-0 gap-6 [&>*]:min-w-0"
		>
			<EntityBanner
				data-testid="template-banner"
				back={{ label: "Templates", to: "/templates" }}
				tile={
					<BannerTile
						icon={linkFor("/templates").icon}
						data-testid="template-banner-tile"
					/>
				}
				name={name}
				status={
					<BannerStatus
						data-testid="template-banner-status"
						label={template.readable ? "Readable" : "Not readable"}
						live={template.readable}
					/>
				}
				facts={templateFacts(template)}
				stats={
					<TemplateStats
						template={template}
						playbook={playbook}
						links={links}
					/>
				}
				actions={<TemplateActions template={template} links={links} />}
				tabs={tabs}
				tabsLabel={`${name}'s page`}
			/>
			<TabsContent value="overview" className="flex flex-col gap-6">
				<TemplateCoverStrip template={template} />
				<div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
					<SectionPanel
						title="Manifest"
						description="Read from the repository's .avel/template.json and its default branch."
						data-testid="template-manifest-panel"
					>
						<TemplateManifest template={template} />
					</SectionPanel>
					<SectionPanel
						title="Built from it"
						description="What uses this template."
						data-testid="template-uses-panel"
					>
						<Facts
							data-testid="template-uses"
							rows={[
								["Missions", missionCountLabel(template.missionCount)],
								[
									"Playbook",
									<PlaybookFact
										key="playbook"
										slug={template.slug}
										links={links}
									/>,
								],
								[
									"Default team",
									template.defaultPresetId === null ? (
										"None"
									) : (
										<Link
											to="/presets"
											search={{ preset: template.defaultPresetId }}
											key="team"
											data-testid="template-uses-team"
											className="text-foreground underline-offset-4 hover:underline"
										>
											<TeamName id={template.defaultPresetId} />
										</Link>
									),
								],
							]}
						/>
					</SectionPanel>
				</div>
			</TabsContent>
			<TabsContent value="playbook">
				<TemplatePlaybook template={template} links={links} />
			</TabsContent>
			<TabsContent value="missions">
				<TemplateMissions template={template} />
			</TabsContent>
		</Tabs>
	);
}

/** The banner's numbers: missions, then the playbook's version and gates. */
function TemplateStats({
	template,
	playbook,
	links,
}: {
	template: Template;
	playbook: Playbook | undefined;
	links: TemplateLinks;
}) {
	return (
		<>
			<BannerStat
				data-testid="template-stat-missions"
				value={String(template.missionCount)}
				label={template.missionCount === 1 ? "mission" : "missions"}
			/>
			{links.ready && playbook ? (
				<>
					<BannerStat
						data-testid="template-stat-version"
						value={`v${playbook.version}`}
						label="playbook"
					/>
					<BannerStat
						data-testid="template-stat-gates"
						value={String(playbook.gates.length)}
						label={playbook.gates.length === 1 ? "gate" : "gates"}
					/>
				</>
			) : null}
		</>
	);
}

/** Open its playbook and its team: links, so each is a real address. */
function TemplateActions({
	template,
	links,
}: {
	template: Template;
	links: TemplateLinks;
}) {
	const playbook = links.playbookFor(template.slug);
	return (
		<>
			{playbook ? (
				<Button asChild size="sm" className={cn(BANNER_BUTTON)}>
					<Link
						to="/playbooks/$missionType"
						params={{ missionType: template.slug }}
						data-testid="template-open-playbook"
					>
						<ListChecks aria-hidden="true" />
						Open playbook
					</Link>
				</Button>
			) : null}
			{template.defaultPresetId === null ? null : (
				<Button asChild size="sm" className={cn(BANNER_BUTTON)}>
					<Link
						to="/presets"
						search={{ preset: template.defaultPresetId }}
						data-testid="template-open-team"
					>
						<Users aria-hidden="true" />
						Open team
					</Link>
				</Button>
			)}
		</>
	);
}

/** A definition list of label and value rows. */
function Facts({
	rows,
	"data-testid": testId,
}: {
	rows: readonly (readonly [string, ReactNode])[];
	"data-testid": string;
}) {
	return (
		<dl
			data-testid={testId}
			className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-6 gap-y-3"
		>
			{rows.map(([label, value]) => (
				<div key={label} className="contents">
					<dt className="type-small text-text-muted">{label}</dt>
					<dd className="type-small min-w-0 break-words text-foreground">
						{value}
					</dd>
				</div>
			))}
		</dl>
	);
}

/** The manifest's fields and the head commit, or why they are unknown. */
function TemplateManifest({ template }: { template: Template }) {
	const mono = (text: string, testId: string) => (
		<span data-testid={testId} className="type-mono-small break-all">
			{text}
		</span>
	);
	return (
		<div className="flex flex-col gap-4">
			{template.readable ? null : (
				<p
					data-testid="template-manifest-unreadable"
					className="type-small text-gate-warn"
				>
					{UNREADABLE_COPY}
				</p>
			)}
			<Facts
				data-testid="template-manifest"
				rows={[
					["Slug", mono(template.slug, "template-manifest-slug")],
					["Name", template.name ?? "Unknown"],
					["Scope", template.scope ? SCOPE_LABEL[template.scope] : "Unknown"],
					[
						"Starting state",
						template.startingState
							? STARTING_STATE_LABEL[template.startingState]
							: "Unknown",
					],
					[
						"Latest commit",
						template.latestSha
							? mono(template.latestSha, "template-manifest-sha")
							: "Unknown",
					],
				]}
			/>
		</div>
	);
}

function PlaybookFact({ slug, links }: { slug: string; links: TemplateLinks }) {
	if (links.failed) return "Playbooks could not be read";
	if (!links.ready) return <Skeleton className="h-4 w-24" />;
	const playbook = links.playbookFor(slug);
	return playbook ? (
		<Link
			to="/playbooks/$missionType"
			params={{ missionType: slug }}
			data-testid="template-uses-playbook"
			className="text-foreground underline-offset-4 hover:underline"
		>
			{`${playbook.name}, v${playbook.version}`}
		</Link>
	) : (
		"None"
	);
}

/** The playbook keyed by this template's slug: its shape, and a way in. */
function TemplatePlaybook({
	template,
	links,
}: {
	template: Template;
	links: TemplateLinks;
}) {
	if (links.failed || !links.ready) {
		return (
			<div data-testid="template-playbook-pending">
				{links.failed ? (
					<p className="type-small text-text-muted">
						Playbooks could not be read. Open Playbooks to try again.
					</p>
				) : (
					<Skeleton className="h-40 w-full rounded-md" />
				)}
			</div>
		);
	}
	const playbook = links.playbookFor(template.slug);
	if (!playbook) {
		return (
			<EmptyState
				data-testid="template-playbook-none"
				icon={ListChecks}
				title="No playbook for this template"
				description={`A playbook keyed by ${template.slug} sets the waves, gates and deliverable for missions built from it. Create one on Playbooks with ${template.slug} as its mission type.`}
				action={
					<Button asChild variant="outline" size="sm">
						<Link to="/playbooks" data-testid="template-playbook-all">
							Open Playbooks
						</Link>
					</Button>
				}
			/>
		);
	}
	return (
		<SectionPanel
			title={playbook.name}
			description="The process every mission built from this template follows."
			data-testid="template-playbook-panel"
			actions={
				<Button asChild variant="outline" size="sm">
					<Link
						to="/playbooks/$missionType"
						params={{ missionType: template.slug }}
						data-testid="template-playbook-open"
					>
						Open builder
					</Link>
				</Button>
			}
		>
			<Facts
				data-testid="template-playbook-summary"
				rows={[
					["Version", `v${playbook.version}`],
					[
						"Waves",
						playbook.wavesApplicable.length > 0
							? playbook.wavesApplicable.join(" ")
							: "None",
					],
					["Gates", gateSummary(playbook.gates)],
					["Deliverable", DELIVERABLE_LABEL[playbook.deliverable]],
				]}
			/>
		</SectionPanel>
	);
}

/**
 * The project card's cover, wide (ruling 48): the same generated art at the
 * head of Overview, with what the template starts as written over it.
 */
function TemplateCoverStrip({ template }: { template: Template }) {
	const { scope, startingState } = template;
	const sentence = template.readable
		? [
				startingState ? STARTING_STATE_SENTENCE[startingState] : null,
				scope ? `${SCOPE_LABEL[scope]}: ${SCOPE_SUMMARY[scope]}` : null,
			]
				.filter((part): part is string => part !== null)
				.join(" ")
		: "Not readable. Its scope and starting state are unknown.";
	return (
		<TemplateCover
			template={template}
			image={template.cover}
			variant="strip"
			data-testid="template-cover-strip"
			className="h-44 rounded-md border border-border-plate"
		>
			{sentence === "" ? null : (
				<p
					data-testid="template-cover-strip-sentence"
					className="absolute bottom-3 left-3 max-w-[min(32rem,calc(100%-1.5rem))] rounded-xs border border-banner-line bg-banner/85 px-3 py-1.5 type-small text-banner-text backdrop-blur-sm"
				>
					{sentence}
				</p>
			)}
		</TemplateCover>
	);
}
