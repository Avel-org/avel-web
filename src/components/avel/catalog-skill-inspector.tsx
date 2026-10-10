import { ROLES, type Role, type Skill } from "avel-server/contract";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
	agentsOfSkill,
	attachability,
	CATALOG_MISSING,
	carryingRoles,
	enforcementBadge,
	SAMPLE_FAMILY_TABLE,
	SAMPLE_ROLE_FAMILY,
	SAMPLE_ROOMS_ENFORCING,
	SAMPLE_SOURCES,
} from "./catalog-placeholders";
import {
	AgentLink,
	CatalogField,
	RoleTag,
	SampleHash,
	SampleRegion,
	SkillStatusPill,
} from "./catalog-sample";
import { type CodeTone, CodeView } from "./code-view";
import { SectionPanel } from "./section-panel";
import { StatusPill } from "./status-pill";

/*
 * One skill, inspected: what it is, its technical facts, where it attaches,
 * who carries it, and its SKILL.md. Every value is a sample until the skill
 * routes are wired (AVEL-DESIGN.md ruling 32). The write controls are real
 * and disabled, each with its reason: only an operator writes a skill, and
 * the routes for it do not exist yet.
 */

/** Why each operator write is disabled today. Real, not a sample. */
export const SKILL_WRITE_REASON = {
	// avel-server has these routes (4f7c3a0); this page shows samples and is
	// not wired to them yet.
	approve: "Approving a skill isn't wired into this page yet",
	retire: "Retiring a skill isn't wired into this page yet",
	create: "Saving a new skill isn't wired into this page yet",
	// These have no route in avel-server at all.
	// role_skills is written by module 5; its route does not exist yet.
	attach:
		"Attaching a skill to a role uses PUT /api/skills/:id/roles/:role, arriving with module 5",
	import: "avel-server has no route for importing from a source yet",
} as const;

/** What the content hash covers (DATA-CONTRACTS-V2.md, Skill). */
export const HASH_COVERS =
	"Covers the description, content, AVEL's additions, grants, io shape, type and layer. Any change to them changes the hash.";

/** "From Framework vendor pack, example.com/vendor/skills", or "Yours". */
export function sourceLine(skill: Skill): string {
	if (skill.source.kind === "internal") return "Yours";
	const url = SAMPLE_SOURCES.find(
		(source) => source.id === skill.source.id,
	)?.url;
	const where = url ? `, ${url.replace(/^https?:\/\//, "")}` : "";
	return `From ${skill.source.name}${where}`;
}

/**
 * SKILL.md as an agent reads it: frontmatter (name, description, version),
 * then the content. AVEL's additions are never merged in; they show apart.
 */
export function skillMarkdown(skill: Skill): string {
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
			className="flex flex-col gap-4 pb-6"
		>
			<Header skill={skill} />
			<Facts skill={skill} />
			<Attach skill={skill} />
			<CarriedBy skill={skill} />
			<Markdown skill={skill} />
		</article>
	);
}

function Header({ skill }: { skill: Skill }) {
	return (
		// Below lg the actions sit above the header, so the title keeps the width.
		<header
			data-testid="skill-header"
			className="flex flex-col-reverse gap-3 lg:flex-row lg:items-start lg:gap-4"
		>
			<SampleRegion
				missing={CATALOG_MISSING.skills}
				title="Skill"
				what="The skill's name, where it came from, and when an agent should use it."
				data-testid="skill-header-sample"
				className="min-w-0 flex-1"
			>
				<h2 id="skill-title" className="type-h2 text-foreground">
					{skill.name}
				</h2>
				<p
					data-testid="skill-source-line"
					className="type-small text-text-subtle"
				>
					{sourceLine(skill)}
				</p>
				<p className="type-body text-text-muted">{skill.description}</p>
			</SampleRegion>
			{/* Operator-only writes. Real controls, disabled until the routes exist. */}
			<div
				data-testid="skill-actions"
				className="flex shrink-0 items-center gap-2 max-lg:self-end"
			>
				<Button
					size="sm"
					variant="outline"
					data-testid="skill-approve"
					disabledReason={SKILL_WRITE_REASON.approve}
				>
					Approve
				</Button>
				<Button
					size="sm"
					variant="outline"
					data-testid="skill-retire"
					disabledReason={SKILL_WRITE_REASON.retire}
				>
					Retire
				</Button>
			</div>
		</header>
	);
}

function Facts({ skill }: { skill: Skill }) {
	const badge = enforcementBadge(skill.type, SAMPLE_ROOMS_ENFORCING);
	const attach = attachability(skill);
	return (
		<SectionPanel title="Facts" data-testid="skill-facts">
			<SampleRegion
				missing={CATALOG_MISSING.skills}
				title="Facts"
				what="Layer, type, status, version, hash, review, description length, enforcement and, for a capability, its grants and io shape."
				data-testid="skill-facts-sample"
			>
				<dl className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-6 gap-y-3">
					<CatalogField label="Layer">
						<span className="type-mono-small">{skill.layer}</span>
					</CatalogField>
					<CatalogField label="Type">
						<span className="type-mono-small">{skill.type}</span>
					</CatalogField>
					<CatalogField label="Status">
						<SkillStatusPill status={skill.status} data-testid="skill-status" />
					</CatalogField>
					<CatalogField label="Version">
						<span className="type-mono-small">{`v${skill.version}`}</span>
					</CatalogField>
					<CatalogField label="Reviewed">
						{skill.reviewedAt ? (
							<span className="type-mono-small">
								{skill.reviewedAt.slice(0, 10)}
							</span>
						) : (
							<span className="text-text-subtle">Not reviewed</span>
						)}
					</CatalogField>
					<CatalogField label="Description">
						<span
							data-testid="skill-description-length"
							data-length={skill.description.length}
						>
							<span className="type-mono-small">
								{skill.description.length}
							</span>{" "}
							<span className="text-text-muted">
								characters, loaded on every dispatch
							</span>
						</span>
					</CatalogField>
				</dl>
				<div className="flex flex-col gap-1">
					<span className="type-caption text-text-subtle">Content hash</span>
					<SampleHash
						value={skill.contentSha256}
						label="the content hash"
						data-testid="skill-hash"
					/>
					<p
						data-testid="skill-hash-covers"
						className="type-caption text-text-subtle"
					>
						{HASH_COVERS}
					</p>
				</div>
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
							<span data-testid="skill-io" className="type-mono-small">
								{`reads ${skill.ioShape.reads} → returns ${skill.ioShape.returns}`}
							</span>
						</CatalogField>
					</div>
				) : null}
			</SampleRegion>
		</SectionPanel>
	);
}

/** The roles of each family, in the contract's catalog order. */
function rolesOf(family: string): Role[] {
	return ROLES.filter((role) => SAMPLE_ROLE_FAMILY[role] === family);
}

/**
 * Where a skill attaches. A role skill attaches to roles, so it shows one
 * toggle per role, grouped by family. A stack or domain skill is given at
 * dispatch to missions, never toggled per role, so it says so in words.
 */
function Attach({ skill }: { skill: Skill }) {
	if (skill.layer !== "role") {
		return (
			<SectionPanel title="Attaches to" data-testid="skill-attach-panel">
				<SampleRegion
					missing={CATALOG_MISSING.skills}
					title="Attaches to"
					what="The roles a stack or domain skill is given to at dispatch."
					data-testid="skill-attach-sample"
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
				</SampleRegion>
			</SectionPanel>
		);
	}
	// A role skill's attachments are role_skills (module 5), never its
	// recommendedFor, which is the dispatch filter for stack and domain skills.
	const attached = carryingRoles(skill);
	return (
		<SectionPanel
			title="Attaches to"
			description="Every agent covering a role turned on here carries the skill in its identity, so the skill is part of that agent's version hash."
			data-testid="skill-attach-panel"
		>
			<div className="flex flex-col gap-3">
				{/* Said once, readable without hovering; each switch still has it
				    in its tooltip and aria-describedby. */}
				<p
					data-testid="skill-attach-reason"
					className="rounded-sm border border-border bg-app-band px-3 py-2 type-small text-text-muted"
				>
					{`Read-only for now. ${SKILL_WRITE_REASON.attach}.`}
				</p>
				<SampleRegion
					missing={CATALOG_MISSING.roleAttachments}
					title="Attaches to"
					what="One switch per role, grouped by family, on where the skill is attached."
					data-testid="skill-attach-sample"
				>
					<div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
						{SAMPLE_FAMILY_TABLE.map(({ family }) => (
							<RoleToggleCard
								key={family}
								family={family}
								roles={rolesOf(family)}
								on={attached}
							/>
						))}
					</div>
				</SampleRegion>
			</div>
		</SectionPanel>
	);
}

/** "2 of 5 attached": a family's count, for its card header. */
export function attachedCount(
	roles: readonly Role[],
	on: readonly Role[],
): string {
	return `${roles.filter((role) => on.includes(role)).length} of ${roles.length} attached`;
}

/**
 * One family's roles, each with a switch showing whether the skill is
 * attached to it. Every switch is disabled with its reason until the write
 * routes exist. Firm roles are marked: firm agents work between missions and
 * never sit on a mission roster, but they can still carry a role skill, so
 * it is a label, not a block.
 */
export function RoleToggleCard({
	family,
	roles,
	on,
}: {
	family: string;
	roles: readonly Role[];
	on: readonly Role[];
}) {
	const firm = family === "Firm";
	return (
		<section
			aria-label={family}
			data-testid={`skill-family-${family}`}
			data-firm={firm || undefined}
			className="surface-steel flex flex-col gap-2 rounded-sm border border-border bg-app-band p-3"
		>
			<header className="flex items-baseline justify-between gap-2 border-b border-border pb-1.5">
				<h3 className="type-small font-medium text-foreground">{family}</h3>
				<span
					data-testid={`skill-family-${family}-count`}
					className="type-caption text-text-subtle tabular-nums"
				>
					{attachedCount(roles, on)}
				</span>
			</header>
			{firm ? (
				<p
					data-testid="skill-family-Firm-note"
					className="type-caption text-text-subtle"
				>
					Firm roles work between missions, never on a mission roster. A firm
					agent still carries the role skills attached here.
				</p>
			) : null}
			<ul className="flex flex-col gap-1">
				{roles.map((role) => {
					const id = `skill-role-${role}`;
					const attached = on.includes(role);
					return (
						<li key={role} className="flex items-center gap-2">
							<label
								htmlFor={id}
								className="type-mono-small min-w-0 flex-1 text-foreground"
							>
								{role}
							</label>
							{firm ? (
								<Badge
									variant="outline"
									data-testid={`${id}-firm`}
									className="type-caption"
								>
									firm
								</Badge>
							) : null}
							{/* A disabled switch is dimmed, so "on" barely shows: say it. */}
							{attached ? (
								<span
									data-testid={`${id}-attached`}
									aria-hidden="true"
									className="type-caption font-medium text-accent-text"
								>
									attached
								</span>
							) : null}
							<Switch
								id={id}
								size="sm"
								data-testid={id}
								checked={attached}
								disabledReason={SKILL_WRITE_REASON.attach}
							/>
						</li>
					);
				})}
			</ul>
		</section>
	);
}

function CarriedBy({ skill }: { skill: Skill }) {
	// Through the roles that carry it: a role skill's attachments, or a stack
	// or domain skill's recommendedFor.
	const roles = carryingRoles(skill);
	const agents = agentsOfSkill(skill);
	return (
		<SectionPanel
			title="Carried by"
			description={
				skill.layer === "role"
					? "Agents covering a role this skill is attached to."
					: "Agents covering a role this skill is recommended for."
			}
			data-testid="skill-carried-by"
		>
			<SampleRegion
				// A role skill's carriers wait on module 5's attachments.
				missing={
					skill.layer === "role"
						? CATALOG_MISSING.roleAttachments
						: CATALOG_MISSING.templates
				}
				title="Carried by"
				what="The agent templates that carry this skill through their roles."
				data-testid="skill-carried-by-sample"
			>
				{agents.length === 0 ? (
					<p className="type-small text-text-subtle">
						{skill.layer === "role"
							? "No agent covers a role this skill is attached to."
							: "No agent covers a role this skill is recommended for."}
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
									{ROLES.filter(
										(role) =>
											agent.roles.includes(role) && roles.includes(role),
									).join(", ")}
								</span>
							</li>
						))}
					</ul>
				)}
			</SampleRegion>
		</SectionPanel>
	);
}

function Markdown({ skill }: { skill: Skill }) {
	const text = skillMarkdown(skill);
	// The closing fence of the frontmatter: the second "---".
	const fenceEnd = text.split("\n").indexOf("---", 1);
	return (
		<SectionPanel title="SKILL.md" data-testid="skill-markdown">
			<SampleRegion
				missing={CATALOG_MISSING.skill}
				title="SKILL.md"
				what="The skill as an agent reads it, then AVEL's additions, kept apart."
				data-testid="skill-markdown-sample"
			>
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
			</SampleRegion>
		</SectionPanel>
	);
}
