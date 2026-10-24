import {
	type AgentTemplate,
	ROLE_TEAM,
	ROLES,
	type Role,
	type Skill,
	TEAM_LABELS,
	TEAMS,
	type Team,
} from "avel-server/contract";
import { Check, Copy, Pencil } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { loadedRows, useAgentTemplates } from "@/lib/api/catalog";
import { useCopy } from "@/lib/clipboard";
import { AgentAvatar } from "./agent-avatar";
import {
	agentsOfSkill,
	attachability,
	carryingRoles,
	enforcementBadge,
	SAMPLE_ROOMS_ENFORCING,
} from "./catalog-placeholders";
import {
	AgentLink,
	CatalogField,
	CatalogListSkeleton,
	RoleTag,
	SkillStatusPill,
} from "./catalog-sample";
import { SkillActions } from "./catalog-skill-actions";
import { SkillMark } from "./catalog-skill-index";
import { rolesBlocker, SkillRolesModal } from "./catalog-skill-roles";
import { type CodeTone, CodeView } from "./code-view";
import { shortHash } from "./short-hash";
import { StatusPill } from "./status-pill";
import { ErrorState, Surface } from "./surface";

/*
 * One skill, read as a document (ruling 52): its head, its pin (where the
 * reference shows an install command: what an agent receives, by hash),
 * its facts, where it attaches, who carries it, and its SKILL.md. The skill
 * is live (GET /api/skills/by-slug/:slug), with a role skill's roles
 * (attachedRoles), and so are the agents that carry it (GET
 * /api/agent-templates). Only an operator writes a skill: Edit, Approve and
 * Retire sit in the header (catalog-skill-actions.tsx), and Change roles
 * under its roles (catalog-skill-roles.tsx).
 */

/** Why the operator writes with no route are held. Real, not a sample. */
export const SKILL_WRITE_REASON = {
	// No route in avel-server at all.
	import: "avel-server has no route for importing from a source yet",
} as const;

/** What the content hash covers (DATA-CONTRACTS-V2.md, Skill). */
export const HASH_COVERS =
	"Covers the description, content, AVEL's additions, grants, io shape, type and layer. Any change to them changes the hash.";

/**
 * "From Framework vendor pack", or "Yours". The skill carries its source's
 * name and kind (the list needs no per-row source query).
 */
export function sourceLine(skill: Pick<Skill, "source">): string {
	if (skill.source.kind === "internal") return "Yours";
	return `From ${skill.source.name}`;
}

/**
 * SKILL.md as an agent reads it: frontmatter (name, description, version),
 * then the content. AVEL's additions are never merged in; they show apart.
 */
export function skillMarkdown(
	skill: Pick<Skill, "slug" | "description" | "version" | "contentMd">,
): string {
	return [
		"---",
		`name: ${skill.slug}`,
		`description: ${skill.description}`,
		`version: ${skill.version}`,
		"---",
		"",
		skill.contentMd,
	].join("\n");
}

/** Frontmatter, its fences included, reads as keys; # lines as headings. */
export function skillLineTone(
	line: string,
	index: number,
	frontmatterEnd: number,
): CodeTone | undefined {
	if (index <= frontmatterEnd) return "key";
	if (line.startsWith("#")) return "heading";
	return undefined;
}

export function SkillInspector({ skill }: { skill: Skill }) {
	return (
		<article
			aria-labelledby="skill-title"
			data-testid="skill-inspector"
			data-skill={skill.slug}
			className="flex flex-col gap-8"
		>
			<Header skill={skill} />
			<Pinned skill={skill} />
			<Facts skill={skill} />
			<Attach skill={skill} />
			<CarriedBy skill={skill} />
			<Markdown skill={skill} />
		</article>
	);
}

function Header({ skill }: { skill: Skill }) {
	return (
		<header data-testid="skill-header" className="flex flex-col gap-3">
			{/* Below sm the actions wrap under the name, so the title keeps the width. */}
			<div className="flex flex-wrap items-start gap-x-4 gap-y-3">
				<div
					data-testid="skill-header-facts"
					className="flex min-w-0 flex-1 items-center gap-3"
				>
					<SkillMark type={skill.type} size="lg" />
					<span className="flex min-w-0 flex-col gap-0.5">
						<h2
							id="skill-title"
							title={skill.name}
							className="truncate type-page text-foreground"
						>
							{skill.name}
						</h2>
						<span className="flex flex-wrap items-center gap-x-2 gap-y-1">
							<span
								data-testid="skill-source-line"
								className="type-small text-text-subtle"
							>
								{sourceLine(skill)}
							</span>
							{skill.status === "approved" ? null : (
								<SkillStatusPill status={skill.status} />
							)}
						</span>
					</span>
				</div>
				{/* Operator-only writes: Edit, Approve and Retire. */}
				<SkillActions skill={skill} />
			</div>
			<p className="type-body text-text-muted">{skill.description}</p>
		</header>
	);
}

/**
 * What an agent receives, by hash: this version's ref and its content hash,
 * in one mono line with Copy (the full hash). It stands where a public
 * library shows its install command; in AVEL a skill is never installed, it
 * is pinned, and any change to it is a new hash.
 */
function Pinned({ skill }: { skill: Skill }) {
	const { status, copy } = useCopy();
	return (
		<section
			aria-labelledby="skill-pinned"
			data-testid="skill-pinned"
			className="flex flex-col gap-2"
		>
			<h3 id="skill-pinned" className="type-small font-medium text-text-muted">
				Pinned
			</h3>
			<div className="flex min-w-0 items-center gap-2 rounded-control border border-border bg-app-raised py-1 pr-1 pl-3">
				<span className="flex min-w-0 flex-1 items-baseline gap-3">
					<code className="min-w-0 truncate type-mono text-text">
						{`${skill.slug}@v${skill.version}`}
					</code>
					{/* Seven characters, as a commit shows (section 12); the whole
					    hash on hover, to screen readers and behind Copy. */}
					<span className="flex shrink-0 items-baseline gap-1.5">
						<span className="type-caption text-text-subtle">sha256</span>
						<code
							data-testid="skill-hash"
							data-full={skill.contentSha256}
							title={skill.contentSha256}
							className="type-mono text-text-muted"
						>
							<span aria-hidden="true">{shortHash(skill.contentSha256)}</span>
							<span className="sr-only">{skill.contentSha256}</span>
						</code>
					</span>
				</span>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Copy the content hash"
					data-testid="skill-hash-copy"
					onClick={() => void copy(skill.contentSha256)}
				>
					{status === "Copied" ? (
						<Check aria-hidden="true" />
					) : (
						<Copy aria-hidden="true" />
					)}
				</Button>
				<span aria-live="polite" className="sr-only">
					{status}
				</span>
			</div>
			<p
				data-testid="skill-hash-covers"
				className="type-caption text-text-subtle"
			>
				{`Agents receive exactly this text. ${HASH_COVERS}`}
			</p>
		</section>
	);
}

/**
 * A section of the document: a hairline above, its title, an optional line
 * saying what it holds, then its content. Not a boxed panel: the page reads
 * top to bottom as one column (ruling 52).
 */
function DocSection({
	title,
	description,
	action,
	"data-testid": testId,
	children,
}: {
	title: string;
	description?: string;
	/** One control at the end of the title's row, such as Copy. */
	action?: ReactNode;
	"data-testid": string;
	children: ReactNode;
}) {
	const id = `${testId}-title`;
	return (
		<section
			aria-labelledby={id}
			data-testid={testId}
			className="flex flex-col gap-3 border-t border-border pt-6"
		>
			<header className="flex items-end justify-between gap-3">
				<span className="flex min-w-0 flex-col gap-0.5">
					<h3 id={id} className="type-title text-text">
						{title}
					</h3>
					{description ? (
						<p className="type-small text-text-muted">{description}</p>
					) : null}
				</span>
				{action}
			</header>
			{children}
		</section>
	);
}

function Facts({ skill }: { skill: Skill }) {
	const badge = enforcementBadge(skill.type, SAMPLE_ROOMS_ENFORCING);
	const attach = attachability(skill);
	return (
		<DocSection title="Facts" data-testid="skill-facts">
			<div className="flex flex-col gap-3">
				<dl className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-6 gap-y-3">
					<CatalogField label="Layer">
						<span className="type-mono">{skill.layer}</span>
					</CatalogField>
					<CatalogField label="Type">
						<span className="type-mono">{skill.type}</span>
					</CatalogField>
					<CatalogField label="Status">
						<SkillStatusPill status={skill.status} data-testid="skill-status" />
					</CatalogField>
					<CatalogField label="Version">
						<span className="type-mono">{`v${skill.version}`}</span>
					</CatalogField>
					<CatalogField label="Reviewed">
						{skill.reviewedAt ? (
							<span className="type-mono">{skill.reviewedAt.slice(0, 10)}</span>
						) : (
							<span className="text-text-subtle">Not reviewed</span>
						)}
					</CatalogField>
					<CatalogField label="Description">
						<span
							data-testid="skill-description-length"
							data-length={skill.description.length}
						>
							<span className="type-mono">{skill.description.length}</span>{" "}
							<span className="text-text-muted">
								characters, loaded on every dispatch
							</span>
						</span>
					</CatalogField>
				</dl>
				<div className="flex flex-wrap items-center gap-2">
					{skill.type === "capability" ? (
						<StatusPill
							size="sm"
							tone={badge.enforced ? "pass" : "warn"}
							label={badge.label}
							data-testid="skill-enforcement"
						/>
					) : (
						<Badge variant="outline" data-testid="skill-enforcement">
							{badge.label}
						</Badge>
					)}
					<span
						data-testid="skill-attach"
						data-attachable={attach.attachable}
						className="type-small text-text-muted"
					>
						{attach.attachable ? "Can be attached." : attach.reason}
					</span>
				</div>
				{skill.type === "capability" ? (
					<div
						data-testid="skill-capability"
						className="flex flex-wrap items-start gap-x-6 gap-y-3"
					>
						<CatalogField label="Grants">
							<ul aria-label="Tools granted" className="flex flex-wrap gap-1.5">
								{skill.grants.map((grant) => (
									<li key={grant}>
										<Badge variant="outline" data-testid="skill-grant">
											{grant}
										</Badge>
									</li>
								))}
							</ul>
						</CatalogField>
						<CatalogField label="Io shape">
							<span data-testid="skill-io" className="type-mono">
								{`reads ${skill.ioShape.reads} → returns ${skill.ioShape.returns}`}
							</span>
						</CatalogField>
					</div>
				) : null}
			</div>
		</DocSection>
	);
}

/**
 * Where a skill attaches. A role skill attaches to roles, so it shows one
 * toggle per role, grouped by team. A stack or domain skill is given at
 * dispatch to missions, never toggled per role, so it says so in words.
 */
function Attach({ skill }: { skill: Skill }) {
	if (skill.layer !== "role") {
		return (
			<DocSection title="Attaches to" data-testid="skill-attach-panel">
				<div
					data-testid="skill-attach-dispatch"
					className="flex flex-col gap-2"
				>
					<p
						data-testid="skill-dispatch"
						className="type-small text-text-muted"
					>
						{`A ${skill.layer} skill attaches to missions, not roles. It is given at dispatch to missions whose roles include:`}
					</p>
					<ul aria-label="Recommended roles" className="flex flex-wrap gap-1.5">
						{ROLES.filter((role) => skill.recommendedFor.includes(role)).map(
							(role) => (
								<li key={role}>
									<RoleTag role={role} />
								</li>
							),
						)}
					</ul>
				</div>
			</DocSection>
		);
	}
	return <AttachedRoles skill={skill} />;
}

/**
 * A role skill's roles, grouped by team, and Change roles. Its attachments
 * are attachedRoles, never its recommendedFor, which is the dispatch filter
 * for stack and domain skills.
 */
function AttachedRoles({ skill }: { skill: Skill }) {
	const [changing, setChanging] = useState(false);
	const teams = attachedTeams(skill.attachedRoles);
	return (
		<DocSection
			title="Attached to"
			description="Every agent covering one of these roles carries the skill in its identity, so the skill is part of that agent's version hash."
			data-testid="skill-attach-panel"
		>
			<div data-testid="skill-attach-roles">
				{teams.length === 0 ? (
					<p
						data-testid="skill-attach-none"
						className="type-small text-text-subtle"
					>
						Attached to no role, so no agent carries it.
					</p>
				) : (
					<div className="flex flex-col gap-3">
						<p
							data-testid="skill-attach-total"
							className="type-caption text-text-subtle"
						>
							{attachedTotal(skill.attachedRoles.length, teams.length)}
						</p>
						<dl className="flex flex-col gap-2">
							{teams.map(({ team, roles }) => (
								<div
									key={team}
									data-testid={`skill-team-${team}`}
									className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5"
								>
									<dt
										title={TEAM_LABELS[team].meaning}
										className="w-24 shrink-0 type-small text-text-muted"
									>
										{TEAM_LABELS[team].label}
									</dt>
									<dd className="flex min-w-0 flex-1 flex-wrap gap-1.5">
										{roles.map((role) => (
											<RoleTag key={role} role={role} compact />
										))}
									</dd>
								</div>
							))}
						</dl>
					</div>
				)}
			</div>
			{/* Changing attachments is a change, so it is a modal (ruling 35). */}
			<div>
				<Button
					size="sm"
					variant="outline"
					data-testid="skill-attach-change"
					disabledReason={rolesBlocker(skill)}
					onClick={() => setChanging(true)}
				>
					<Pencil aria-hidden="true" />
					Change roles
				</Button>
			</div>
			{changing ? (
				<SkillRolesModal skill={skill} open onOpenChange={setChanging} />
			) : null}
		</DocSection>
	);
}

/** The attached roles by team, in catalog order; teams with none are left out. */
export function attachedTeams(
	on: readonly Role[],
): { team: Team; roles: Role[] }[] {
	return TEAMS.map((team) => ({
		team,
		roles: ROLES.filter(
			(role) => ROLE_TEAM[role] === team && on.includes(role),
		),
	})).filter((group) => group.roles.length > 0);
}

/** "1 role on 1 team", "4 roles across 2 teams". */
export function attachedTotal(roles: number, teams: number): string {
	const r = roles === 1 ? "1 role" : `${roles} roles`;
	return teams === 1 ? `${r} on 1 team` : `${r} across ${teams} teams`;
}

/**
 * The agents that carry the skill, out of the live templates. A stack or
 * domain skill's carriers are live: the templates covering a role it is
 * recommended for. A role skill's carriers follow its attachments, which are
 * a sample until module 5's read exists, so they sit behind that pill.
 */
function CarriedBy({ skill }: { skill: Skill }) {
	const templates = useAgentTemplates();
	return (
		<DocSection
			title="Carried by"
			description={
				skill.layer === "role"
					? "Agents covering a role this skill is attached to."
					: "Agents covering a role this skill is recommended for."
			}
			data-testid="skill-carried-by"
		>
			<Surface
				data-testid="skill-carried-by-surface"
				query={templates}
				// No templates at all is still an answer: nobody carries it.
				isEmpty={() => false}
				loading={
					<CatalogListSkeleton data-testid="skill-carried-by-skeleton" />
				}
				empty={null}
				error={ErrorState}
			>
				{(data) => <Carriers skill={skill} agents={loadedRows(data)} />}
			</Surface>
		</DocSection>
	);
}

/** Each carrier as a link, with the roles it shares with the skill. */
function Carriers({
	skill,
	agents: all,
}: {
	skill: Skill;
	agents: readonly AgentTemplate[];
}) {
	// Through the roles that carry it: a role skill's attachments, or a stack
	// or domain skill's recommendedFor.
	const roles = carryingRoles(skill);
	const agents = agentsOfSkill(skill, all);
	if (agents.length === 0) {
		return (
			<p
				data-testid="skill-carried-by-none"
				className="type-small text-text-subtle"
			>
				{skill.layer === "role"
					? "No agent covers a role this skill is attached to."
					: "No agent covers a role this skill is recommended for."}
			</p>
		);
	}
	return (
		<ul
			aria-label="Agents carrying this skill"
			data-testid="skill-carried-by-list"
			className="flex flex-col gap-2"
		>
			{agents.map((agent) => (
				<li key={agent.id} className="flex flex-wrap items-center gap-2">
					<AgentAvatar slug={agent.slug} size="sm" />
					<AgentLink agent={agent} />
					<span className="flex flex-wrap gap-1.5">
						{ROLES.filter(
							(role) => agent.roles.includes(role) && roles.includes(role),
						).map((role) => (
							<RoleTag key={role} role={role} compact />
						))}
					</span>
				</li>
			))}
		</ul>
	);
}

/** Copy for a whole text, with a polite live region saying how it went. */
function CopyText({
	text,
	label,
	className,
}: {
	text: string;
	label: string;
	className?: string;
}) {
	const { status, copy } = useCopy();
	return (
		<span className={className}>
			<Button
				size="sm"
				variant="outline"
				aria-label={`Copy ${label}`}
				data-testid="skill-markdown-copy"
				onClick={() => void copy(text)}
			>
				{status === "Copied" ? (
					<Check aria-hidden="true" />
				) : (
					<Copy aria-hidden="true" />
				)}
				{status === "Copied" ? "Copied" : "Copy"}
			</Button>
			<span aria-live="polite" className="sr-only">
				{status}
			</span>
		</span>
	);
}

function Markdown({ skill }: { skill: Skill }) {
	const text = skillMarkdown(skill);
	// The closing fence of the frontmatter: the second "---".
	const fenceEnd = text.split("\n").indexOf("---", 1);
	return (
		<DocSection
			title="SKILL.md"
			description="As an agent reads it: frontmatter, then the content."
			data-testid="skill-markdown"
			action={<CopyText text={text} label="SKILL.md" />}
		>
			<div className="flex flex-col gap-3">
				<CodeView
					text={text}
					label={`${skill.slug} SKILL.md`}
					data-testid="skill-code"
					lineTone={(line, index) => skillLineTone(line, index, fenceEnd)}
				/>
				{skill.avelEnhancementMd ? (
					<div data-testid="skill-additions" className="flex flex-col gap-1.5">
						<h3 className="type-caption font-medium text-text-muted">
							Kept apart from the original
						</h3>
						<CodeView
							text={skill.avelEnhancementMd}
							label={`AVEL's additions to ${skill.slug}`}
							data-testid="skill-additions-code"
							// No frontmatter here: only its headings are marked.
							lineTone={(line, index) => skillLineTone(line, index, -1)}
						/>
					</div>
				) : null}
			</div>
		</DocSection>
	);
}
