import { Link } from "@tanstack/react-router";
import type { SkillLayer, SkillListItem } from "avel-server/contract";
import { MousePointerClick, Plus, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
	agentsOfSkill,
	attachability,
	CATALOG_MISSING,
	enforcementBadge,
	isImported,
	SAMPLE_ROOMS_ENFORCING,
	SAMPLE_SKILLS,
	sampleSkill,
} from "./catalog-placeholders";
import {
	AgentLink,
	CatalogBack,
	CatalogField,
	CatalogListSkeleton,
	type CatalogQuery,
	inCatalogOrder,
	RoleTag,
	SampleHash,
	SampleRegion,
	SkillKind,
	SkillStatusPill,
	sampleQuery,
} from "./catalog-sample";
import { EmptyState } from "./empty-state";
import { SectionPanel } from "./section-panel";
import { StatusPill } from "./status-pill";
import { ErrorState, Surface } from "./surface";

/*
 * The skill library, /catalog/skills (ROUTES.md, SKILLS.md). Skills are
 * written and reviewed here, by the operator only: agents never write or edit
 * a skill. Until module 4's routes land, every skill is a labelled sample
 * from catalog-placeholders.ts (AVEL-DESIGN.md ruling 32). The write controls
 * are real and disabled, each with its reason.
 */

/** Why each operator write is disabled today. Real, not a sample. */
export const SKILL_WRITE_REASON = {
	create:
		"Writing skills needs avel-server's skill routes, which arrive with module 4",
	approve:
		"Approving a skill needs avel-server's skill routes, which arrive with module 4",
	retire:
		"Retiring a skill needs avel-server's skill routes, which arrive with module 4",
} as const;

/** The page's action: a new skill, operator only, disabled until the routes exist. */
export function NewSkillButton({
	"data-testid": testId = "catalog-skills-new",
}: {
	"data-testid"?: string;
}) {
	return (
		<Button
			size="sm"
			data-testid={testId}
			disabledReason={SKILL_WRITE_REASON.create}
		>
			<Plus aria-hidden="true" />
			New skill
		</Button>
	);
}

const LAYERS: { layer: SkillLayer; label: string; what: string }[] = [
	{
		layer: "role",
		label: "Role",
		what: "Part of who an agent is, in its identity.",
	},
	{
		layer: "stack",
		label: "Stack",
		what: "What a project's technology needs, given at dispatch.",
	},
	{
		layer: "domain",
		label: "Domain",
		what: "A field's vocabulary and rules, given at dispatch.",
	},
];

export function CatalogSkills({
	selected,
	query = sampleQuery(SAMPLE_SKILLS),
}: {
	selected: string | undefined;
	query?: CatalogQuery<SkillListItem>;
}) {
	const skill = selected ? sampleSkill(selected) : undefined;
	return (
		<div data-testid="catalog-skills" className="flex min-h-0 flex-1 gap-6">
			<div
				data-testid="catalog-skills-list-pane"
				className={cn(
					"flex w-full flex-col gap-3 lg:w-80 lg:shrink-0",
					// Below lg a selection replaces the list: two panes need the width.
					skill && "max-lg:hidden",
				)}
			>
				<SkillList selected={skill?.slug} query={query} />
			</div>
			<div
				data-testid="catalog-skills-detail-pane"
				className={cn(
					"flex min-w-0 flex-1 flex-col gap-4 lg:border-l lg:border-border lg:pl-6",
					!skill && "max-lg:hidden",
				)}
			>
				{skill ? (
					<>
						<CatalogBack
							to="/catalog/skills"
							label="Back to skills"
							data-testid="catalog-skills-back"
						/>
						<SkillDetail key={skill.slug} skill={skill} />
					</>
				) : (
					<EmptyState
						data-testid="catalog-skills-choose"
						icon={MousePointerClick}
						title="Choose a skill"
						description="Choose one to see its description, the roles it is for, the tools it grants and the agents that carry it."
					/>
				)}
			</div>
		</div>
	);
}

function SkillList({
	selected,
	query,
}: {
	selected: string | undefined;
	query: CatalogQuery<SkillListItem>;
}) {
	return (
		<SampleRegion
			missing={CATALOG_MISSING.skills}
			title="Skills"
			what="Every skill, grouped by layer, with its type and status."
			data-testid="catalog-skills-list"
		>
			<Surface
				data-testid="catalog-skills-surface"
				query={query}
				loading={<CatalogListSkeleton data-testid="catalog-skills-skeleton" />}
				empty={
					<EmptyState
						data-testid="catalog-skills-empty"
						compact
						icon={Wrench}
						title="No skills yet"
						description="Skills are written and reviewed here, by an operator. An imported skill arrives as a draft and is attached only once approved."
						action={<NewSkillButton data-testid="catalog-skills-empty-new" />}
					/>
				}
				error={ErrorState}
			>
				{(all) => (
					<div className="flex flex-col gap-3">
						{LAYERS.map(({ layer, label, what }) => {
							const skills = all.filter((s) => s.layer === layer);
							if (skills.length === 0) return null;
							return (
								<section
									key={layer}
									aria-label={`${label} skills`}
									data-testid={`catalog-skills-layer-${layer}`}
									className="flex flex-col gap-1"
								>
									<header className="flex items-baseline gap-2 px-3">
										<h2 className="type-caption font-medium text-foreground">
											{label}
										</h2>
										<span className="type-caption text-text-subtle">
											{what}
										</span>
									</header>
									<ul
										aria-label={`${label} skills`}
										className="flex flex-col gap-0.5"
									>
										{skills.map((skill) => (
											<li key={skill.id}>
												<SkillRow
													skill={skill}
													selected={skill.slug === selected}
												/>
											</li>
										))}
									</ul>
								</section>
							);
						})}
					</div>
				)}
			</Surface>
		</SampleRegion>
	);
}

function SkillRow({
	skill,
	selected,
}: {
	skill: SkillListItem;
	selected: boolean;
}) {
	return (
		<Link
			to="/catalog/skills"
			search={{ skill: skill.slug }}
			data-testid={`catalog-skill-row-${skill.slug}`}
			data-selected={selected || undefined}
			className={cn(
				"focus-inset relative flex flex-col gap-1 rounded-sm px-3 py-2 transition-colors duration-(--duration-micro) ease-avel hover:bg-state-hover",
				selected &&
					"bg-state-selected before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-accent hover:bg-state-selected",
			)}
		>
			<span className="flex items-center gap-2">
				<span
					data-testid="catalog-skill-row-name"
					className="type-small line-clamp-2 min-w-0 flex-1 font-medium text-foreground"
				>
					{skill.name}
				</span>
				<SkillStatusPill status={skill.status} />
			</span>
			<span className="flex items-center gap-2">
				<SkillKind skill={skill} />
				{isImported(skill) ? (
					<span className="type-caption text-text-subtle">Imported</span>
				) : null}
			</span>
		</Link>
	);
}

/** One skill: what it is, who it is for, what it grants, who carries it. */
export function SkillDetail({ skill }: { skill: SkillListItem }) {
	return (
		<div
			data-testid="catalog-skill-detail"
			data-skill={skill.slug}
			className="flex flex-col gap-4 pb-6"
		>
			<Overview skill={skill} />
			<Description skill={skill} />
			<Grants skill={skill} />
			<CarriedBy skill={skill} />
		</div>
	);
}

function Overview({ skill }: { skill: SkillListItem }) {
	const badge = enforcementBadge(skill.type, SAMPLE_ROOMS_ENFORCING);
	const attach = attachability(skill);
	return (
		<SectionPanel
			title="Skill"
			data-testid="catalog-skill-overview"
			actions={
				// Operator-only writes. Real controls, disabled until the routes exist.
				<>
					<Button
						size="sm"
						variant="outline"
						data-testid="catalog-skill-approve"
						disabledReason={SKILL_WRITE_REASON.approve}
					>
						Approve
					</Button>
					<Button
						size="sm"
						variant="outline"
						data-testid="catalog-skill-retire"
						disabledReason={SKILL_WRITE_REASON.retire}
					>
						Retire
					</Button>
				</>
			}
		>
			<SampleRegion
				missing={CATALOG_MISSING.skills}
				title="Skill"
				what="The skill's name, layer, type, status, enforcement, source, hash and review."
				data-testid="catalog-skill-overview-sample"
			>
				<p className="type-h2 text-foreground">{skill.name}</p>
				<div className="flex flex-wrap items-center gap-2">
					<SkillKind skill={skill} />
					<SkillStatusPill
						status={skill.status}
						data-testid="catalog-skill-status"
					/>
					{skill.type === "capability" ? (
						<StatusPill
							size="sm"
							tone={badge.enforced ? "pass" : "warn"}
							label={badge.label}
							data-testid="catalog-skill-enforcement"
						/>
					) : (
						<Badge variant="outline" data-testid="catalog-skill-enforcement">
							{badge.label}
						</Badge>
					)}
				</div>
				<p
					data-testid="catalog-skill-attach"
					data-attachable={attach.attachable}
					className="type-small text-text-muted"
				>
					{attach.attachable ? "Can be attached." : attach.reason}
				</p>
				<dl className="flex flex-wrap gap-x-6 gap-y-2">
					<CatalogField label="Slug">
						<span className="type-mono-small">{skill.slug}</span>
					</CatalogField>
					<CatalogField label="Version">
						<span className="type-mono-small">{`v${skill.version}`}</span>
					</CatalogField>
					<CatalogField label="Source">
						<Link
							to="/catalog/sources"
							data-testid="catalog-skill-source"
							className="rounded-xs text-accent-text underline-offset-4 hover:underline"
						>
							{skill.source.name}
						</Link>
					</CatalogField>
					<CatalogField label="Content hash">
						<SampleHash
							value={skill.contentSha256}
							label="the content hash"
							data-testid="catalog-skill-hash"
						/>
					</CatalogField>
					<CatalogField label="Reviewed">
						{skill.reviewedBy && skill.reviewedAt ? (
							// reviewedBy is a user id; the contract has no name for it yet.
							<span className="type-mono-small">
								{skill.reviewedAt.slice(0, 10)}
							</span>
						) : (
							<span className="text-text-subtle">Not reviewed</span>
						)}
					</CatalogField>
				</dl>
			</SampleRegion>
		</SectionPanel>
	);
}

function Description({ skill }: { skill: SkillListItem }) {
	return (
		<SectionPanel
			title="Description"
			description="Loaded into every dispatch it applies to. Written as when to use it."
			data-testid="catalog-skill-description"
		>
			<SampleRegion
				missing={CATALOG_MISSING.skills}
				title="Description"
				what="The description agents always see, its length, and the roles it is recommended for."
				data-testid="catalog-skill-description-sample"
			>
				<p className="type-body text-foreground">{skill.description}</p>
				<p
					data-testid="catalog-skill-description-length"
					data-length={skill.description.length}
					className="type-mono-small text-text-subtle"
				>
					{`${skill.description.length} characters`}
				</p>
				<div className="flex flex-col gap-1.5">
					<h3 className="type-caption text-text-subtle">Recommended for</h3>
					<ul aria-label="Recommended roles" className="flex flex-wrap gap-1.5">
						{inCatalogOrder(skill.recommendedFor).map((role) => (
							<li key={role}>
								<RoleTag role={role} />
							</li>
						))}
					</ul>
				</div>
			</SampleRegion>
		</SectionPanel>
	);
}

function Grants({ skill }: { skill: SkillListItem }) {
	// Knowledge grants nothing; the section is a capability's only.
	if (skill.type !== "capability") return null;
	return (
		<SectionPanel
			title="Tools granted"
			description="The runner provides these in the agent's room, and nothing else."
			data-testid="catalog-skill-grants"
		>
			<SampleRegion
				missing={CATALOG_MISSING.skills}
				title="Tools granted"
				what="The tools a capability grants and the size of what it reads and returns."
				data-testid="catalog-skill-grants-sample"
			>
				<ul aria-label="Tools granted" className="flex flex-col gap-1">
					{(skill.grants ?? []).map((grant) => (
						<li key={grant} className="type-small text-foreground">
							{grant}
						</li>
					))}
				</ul>
				{skill.ioShape ? (
					<dl className="flex flex-wrap gap-x-6 gap-y-2">
						<CatalogField label="Reads">
							<span className="type-mono-small">{skill.ioShape.reads}</span>
						</CatalogField>
						<CatalogField label="Returns">
							<span className="type-mono-small">{skill.ioShape.returns}</span>
						</CatalogField>
					</dl>
				) : null}
			</SampleRegion>
		</SectionPanel>
	);
}

function CarriedBy({ skill }: { skill: SkillListItem }) {
	const agents = agentsOfSkill(skill);
	return (
		<SectionPanel
			title="Carried by"
			description="Agents covering a role this skill is recommended for."
			data-testid="catalog-skill-agents"
		>
			<SampleRegion
				missing={CATALOG_MISSING.templates}
				title="Carried by"
				what="The agent templates that carry this skill through their roles."
				data-testid="catalog-skill-agents-sample"
			>
				{agents.length === 0 ? (
					<p className="type-small text-text-subtle">
						No agent covers a role this skill is for.
					</p>
				) : (
					<ul
						aria-label="Agents carrying this skill"
						className="flex flex-col gap-1.5"
					>
						{agents.map((agent) => (
							<li key={agent.id} className="flex flex-wrap items-center gap-2">
								<AgentLink agent={agent} />
								<span className="type-mono-small text-text-subtle">
									{agent.roles
										.filter((role) => skill.recommendedFor.includes(role))
										.join(", ")}
								</span>
							</li>
						))}
					</ul>
				)}
			</SampleRegion>
		</SectionPanel>
	);
}
