import { Link } from "@tanstack/react-router";
import {
	type AgentTemplate,
	KIND_LABELS,
	SIDE_LABELS,
	TEAM_LABELS,
	TEAMS,
	type Team,
	WAVES,
} from "avel-server/contract";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
	AGENT_MISSING,
	artifactsOf,
	isFirmAgent,
	sideOf,
} from "./catalog-agent-placeholders";
import { AgentTile } from "./catalog-agent-table";
import {
	inCatalogOrder,
	inWaveOrder,
	RoleTag,
	teamOf,
	teamsOf,
} from "./catalog-sample";
import { SampleData } from "./sample-data";

/*
 * All agents as cards (ruling 44): one v3 card per agent, built from
 * sections of related facts, so an agent's shape reads before it is opened.
 * The identity band, then its description, roles, its waves and side, the
 * files it may change, and Open. The whole card opens the agent's page: one
 * link, stretched over the card, so the keyboard meets one link per card.
 */

/** What a firm agent's waves section says, and why. */
export const FIRM_WAVES = {
	text: "Between missions",
	title:
		"Firm agents work for the agency between missions, so they never join a mission's waves.",
} as const;

/**
 * A card's sections, top to bottom. Every card renders all of them, in this
 * order, an empty one saying so in words: each is a row of the grid's
 * subgrid, so a section's top lines up across every card in a grid row.
 * The span below is this list's length; Tailwind needs it as a literal.
 */
export const CARD_SECTIONS = [
	"identity",
	"description",
	"roles",
	"facts",
	"paths",
	"footer",
] as const;

const CARD_SPAN = "row-span-6";

/** How many globs and roles a card lists before it counts the rest. */
export const CARD_PATHS = 3;
/** Two role chips and the count of the rest fit two lines at the narrowest card. */
export const CARD_ROLES = 2;

// ---------------------------------------------------------------------------
// The description. The agent's own written description first; when it has
// none (null), what its roles do, from the client copy of ROLES.md. Only
// that one is not the server's words, so only it says where it came from,
// and carries the Sample data pill: what a role writes and reads is a sample
// (audit F8).

/** How long a description runs before it is cut at a word. */
export const DESCRIPTION_MAX = 220;

/** Inline markdown down to its words: links, code, emphasis. */
const plain = (line: string) =>
	line
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/[`*_~]+/g, "")
		.replace(/\s+/g, " ")
		.trim();

/** Cut at the last whole word under the limit, and say it was cut. */
function cap(text: string, max = DESCRIPTION_MAX): string {
	if (text.length <= max) return text;
	const cut = text.slice(0, max);
	const word = cut.lastIndexOf(" ");
	return `${(word > 0 ? cut.slice(0, word) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

/** "a, b and c". */
const listOf = (items: readonly string[]) =>
	items.length <= 1
		? (items[0] ?? "")
		: `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/** At most this many inputs are named; the rest are counted. */
const READS_NAMED = 3;

/**
 * One plain account of an agent from its roles: its team, what it writes
 * and from what, and where it works.
 */
export function rolesSentence(agent: AgentTemplate): string {
	const teams = teamsOf(agent.roles).map((team) => TEAM_LABELS[team].label);
	// In catalog order, so the sentence never follows the data's order.
	const { writes, reads } = artifactsOf({ roles: inCatalogOrder(agent.roles) });
	const named = reads.slice(0, READS_NAMED).map((r) => r.name);
	const more = reads.length - named.length;
	const from =
		named.length === 0
			? ""
			: ` from ${listOf(more > 0 ? [...named, `${more} more`] : named)}`;
	const waves = inWaveOrder(agent.waveDefaults);
	const where = isFirmAgent(agent)
		? "Works between missions."
		: waves.length === 0
			? "Joins no wave by default."
			: `Works in wave${waves.length > 1 ? "s" : ""} ${listOf(waves)}.`;
	return [
		teams.length > 0
			? `On the ${listOf(teams)} ${teams.length > 1 ? "teams" : "team"}.`
			: "",
		writes.length > 0
			? `Writes ${listOf(writes.map((w) => w.name))}${from}.`
			: "",
		where,
	]
		.filter((part) => part !== "")
		.join(" ");
}

export type AgentDescription = {
	text: string;
	/** Where the words came from: the agent's written description, or its roles. */
	source: "written" | "roles";
};

/** What a card says the agent is, from the first source that has words. */
export function agentDescription(agent: AgentTemplate): AgentDescription {
	// The contract never sends "": null means not written. Trimmed anyway, so
	// blank text never wins over the roles.
	const written = plain(agent.description ?? "");
	return written !== ""
		? { text: cap(written), source: "written" }
		: { text: cap(rolesSentence(agent)), source: "roles" };
}

/** The first section: what the agent is, in prose, with the most room. */
function DescriptionSection({ agent }: { agent: AgentTemplate }) {
	const { text, source } = agentDescription(agent);
	return (
		<div
			data-testid={`catalog-agent-card-description-${agent.slug}`}
			data-section="description"
			data-source={source}
			className="flex min-w-0 flex-col gap-1.5 px-4 py-2.5"
		>
			{/* In full: descriptions are short by rule, and the subgrid gives
			    every card in a row the tallest one's height. */}
			<p
				data-testid={`catalog-agent-description-${agent.slug}`}
				className="type-body leading-relaxed font-[450] text-foreground"
			>
				{text}
			</p>
			{source === "roles" ? (
				<span className="flex flex-wrap items-center gap-2">
					<span
						data-testid={`catalog-agent-description-source-${agent.slug}`}
						title="Summed up from its roles, because no description has been written yet."
						className="type-caption text-text-subtle"
					>
						From its roles
					</span>
					{/* Above the card's stretched link, so its tooltip opens. */}
					<SampleData
						missing={AGENT_MISSING.artifacts}
						className="relative z-10"
					/>
				</span>
			) : null}
		</div>
	);
}

// ---------------------------------------------------------------------------

/** A section's label, as an eyebrow, with an optional count in mono. */
function SectionLabel({
	children,
	count,
}: {
	children: ReactNode;
	count?: number;
}) {
	return (
		<span className="flex items-baseline justify-between gap-2">
			<span className="type-eyebrow">{children}</span>
			{count === undefined ? null : (
				<span className="type-mono text-text-subtle tabular-nums">{count}</span>
			)}
		</span>
	);
}

/** One section of a card: a hairline above it, its label, its content. */
function CardSection({
	label,
	count,
	section,
	slug,
	children,
}: {
	label: string;
	count?: number;
	section: string;
	slug: string;
	children: ReactNode;
}) {
	return (
		<div
			data-testid={`catalog-agent-card-${section}-${slug}`}
			data-section={section}
			className="flex min-w-0 flex-col justify-start gap-2 border-t border-border px-4 py-2.5"
		>
			<SectionLabel count={count}>{label}</SectionLabel>
			{children}
		</div>
	);
}

/**
 * Waves A to E: the ones it runs filled, the rest dashed. Neutral, not
 * accent: a wave is a fact about the agent, not something to act on.
 */
function WaveStrip({ agent }: { agent: AgentTemplate }) {
	if (isFirmAgent(agent)) {
		return (
			<span
				data-testid={`catalog-agent-waves-${agent.slug}`}
				data-firm="true"
				title={FIRM_WAVES.title}
				className="relative flex h-5 items-center justify-center rounded-sm border border-dashed border-border-strong px-2 type-caption text-text-muted"
			>
				{FIRM_WAVES.text}
				<span className="sr-only">{`. ${FIRM_WAVES.title}`}</span>
			</span>
		);
	}
	const runs = new Set<string>(agent.waveDefaults);
	return (
		<span
			data-testid={`catalog-agent-waves-${agent.slug}`}
			className="flex w-36 shrink-0 gap-0.5"
		>
			{WAVES.map((wave) => (
				<span
					key={wave}
					aria-hidden="true"
					data-wave={wave}
					data-runs={runs.has(wave)}
					className={cn(
						"flex h-5 flex-1 items-center justify-center rounded-sm border type-mono",
						runs.has(wave)
							? "border-border-strong bg-app-raised text-text"
							: "border-dashed border-border text-text-subtle",
					)}
				>
					{wave}
				</span>
			))}
			<span className="sr-only">
				{runs.size === 0
					? "Runs in no wave."
					: `Runs in waves ${inWaveOrder(agent.waveDefaults).join(", ")}.`}
			</span>
		</span>
	);
}

/** What an agent's side reads as; none for Firm and code agents. */
export const sideLabel = (agent: Pick<AgentTemplate, "roles">) => {
	const side = sideOf(agent);
	return side === null ? "No side" : SIDE_LABELS[side];
};

/** Waves and side on one row: when it works, and what kind of work. */
function FactsSection({ agent }: { agent: AgentTemplate }) {
	return (
		<CardSection label="Waves and side" section="facts" slug={agent.slug}>
			<span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
				<WaveStrip agent={agent} />
				<span
					data-testid={`catalog-agent-side-${agent.slug}`}
					data-side={sideOf(agent) ?? "none"}
					className="type-small text-foreground"
				>
					{sideLabel(agent)}
				</span>
			</span>
		</CardSection>
	);
}

/**
 * The identity in force as its ref, "atlas@v1", in a mono chip; out of date
 * beside it when its inputs moved; not generated when there is none. The
 * template's own version (an edit counter) is never shown on the card.
 */
function IdentityRef({ agent }: { agent: AgentTemplate }) {
	const ref =
		agent.identityVersion === null
			? null
			: `${agent.slug}@v${agent.identityVersion}`;
	return (
		<span
			data-testid={`catalog-agent-ref-${agent.slug}`}
			data-generated={ref !== null}
			data-stale={agent.identityStale || undefined}
			className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5"
		>
			<span className="truncate rounded-xs bg-gate-pending-soft px-1.5 type-mono text-text-muted">
				{ref ?? agent.slug}
			</span>
			{ref === null ? (
				<span className="type-caption text-text-subtle">not generated</span>
			) : agent.identityStale ? (
				<span className="type-caption font-medium text-gate-warn">
					out of date
				</span>
			) : null}
		</span>
	);
}

export function AgentCard({ agent }: { agent: AgentTemplate }) {
	const roles = inCatalogOrder(agent.roles);
	const paths = agent.writablePaths;
	const nameId = `catalog-agent-card-name-${agent.slug}`;
	return (
		// The li and the article both take the grid's rows as a subgrid, so
		// each section is one row shared with the cards beside it.
		<li
			data-testid={`catalog-agent-card-${agent.slug}`}
			className={cn("grid min-w-0 grid-rows-subgrid gap-y-0", CARD_SPAN)}
		>
			<article
				aria-labelledby={nameId}
				data-side={sideOf(agent) ?? "none"}
				className={cn(
					// v3's option card: a hairline that strengthens on hover, the
					// raised fill under the pointer, and no lift.
					"relative grid min-w-0 grid-rows-subgrid gap-y-0 rounded-card border border-border bg-app-panel shadow-card transition-colors duration-(--duration-micro) ease-avel hover:border-border-strong hover:bg-app-raised has-[a:focus-visible]:border-border-strong",
					CARD_SPAN,
				)}
			>
				{/* Identity: the card's head, set apart by a hairline. */}
				<div
					data-testid={`catalog-agent-card-identity-${agent.slug}`}
					data-section="identity"
					className="flex min-w-0 items-start gap-3 border-b border-border px-4 py-3"
				>
					<AgentTile agent={agent} size="lg" />
					<span className="flex min-w-0 flex-1 flex-col gap-0.5">
						{/* The name, then the kind on the same baseline. */}
						<span className="flex min-w-0 items-baseline justify-between gap-2">
							<h3 id={nameId} className="truncate type-title text-text">
								{agent.name}
							</h3>
							<Badge
								variant="outline"
								data-testid={`catalog-agent-kind-${agent.slug}`}
								data-kind={agent.kind}
								className="shrink-0"
							>
								{KIND_LABELS[agent.kind]}
							</Badge>
						</span>
						{agent.title === null ? null : (
							<span
								data-testid={`catalog-agent-title-${agent.slug}`}
								className="truncate type-small text-text-muted"
							>
								{agent.title}
							</span>
						)}
						<IdentityRef agent={agent} />
					</span>
				</div>

				<DescriptionSection agent={agent} />

				<CardSection
					label="Roles"
					count={roles.length}
					section="roles"
					slug={agent.slug}
				>
					<span
						data-testid={`catalog-agent-roles-${agent.slug}`}
						className="flex flex-wrap content-start items-start gap-1"
					>
						{roles.slice(0, CARD_ROLES).map((role) => (
							<RoleTag key={role} role={role} />
						))}
						{roles.length > CARD_ROLES ? (
							<span
								data-testid={`catalog-agent-roles-more-${agent.slug}`}
								className="self-center type-caption text-text-subtle"
							>
								{`+${roles.length - CARD_ROLES} more`}
							</span>
						) : null}
					</span>
				</CardSection>

				<FactsSection agent={agent} />

				<CardSection
					label="Files it may change"
					count={paths.length}
					section="paths"
					slug={agent.slug}
				>
					{paths.length === 0 ? (
						<span className="type-caption text-text-subtle">
							Changes no files.
						</span>
					) : (
						<ul
							data-testid={`catalog-agent-paths-${agent.slug}`}
							className="flex min-w-0 flex-col gap-0.5"
						>
							{paths.slice(0, CARD_PATHS).map((glob) => (
								<li
									key={glob}
									title={glob}
									className="truncate type-mono text-text-muted"
								>
									{glob}
								</li>
							))}
							{paths.length > CARD_PATHS ? (
								<li
									data-testid={`catalog-agent-paths-more-${agent.slug}`}
									className="type-caption text-text-subtle"
								>
									{`+${paths.length - CARD_PATHS} more`}
								</li>
							) : null}
						</ul>
					)}
				</CardSection>

				<div
					data-section="footer"
					className="flex items-end justify-end border-t border-border px-4 py-2"
				>
					<Link
						to="/catalog/agents/$slug"
						params={{ slug: agent.slug }}
						data-testid={`catalog-agent-card-open-${agent.slug}`}
						aria-label={`Open ${agent.name}`}
						// Stretched over the card: the whole card is this one link.
						className="py-1.5 -my-1.5 inline-flex items-center gap-1 rounded-xs type-small font-medium text-accent-text after:absolute after:inset-0 after:content-['']"
					>
						Open
						<ArrowRight aria-hidden="true" className="size-4" />
					</Link>
				</div>
			</article>
		</li>
	);
}

/** The grid: as many columns as fit, never narrower than a card reads. */
const GRID =
	"grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,17.5rem),1fr))]";

/** The agents in sections by team, in team order; empty teams are left out. */
export function byTeam(
	agents: readonly AgentTemplate[],
): { team: Team; agents: AgentTemplate[] }[] {
	return TEAMS.map((team) => ({
		team,
		agents: agents.filter((agent) => teamOf(agent) === team),
	})).filter((section) => section.agents.length > 0);
}

/** One section per team, named by its label, its meaning on hover and below. */
export function AgentCardGrid({
	agents,
}: {
	agents: readonly AgentTemplate[];
}) {
	return (
		<div data-testid="catalog-agents-cards" className="flex flex-col gap-4">
			{byTeam(agents).map(({ team, agents: members }) => {
				const headingId = `catalog-agents-team-${team}`;
				return (
					<section
						key={team}
						aria-labelledby={headingId}
						data-testid={`catalog-agents-team-${team}`}
						className="flex min-w-0 flex-col gap-3"
					>
						<div className="flex flex-wrap items-baseline gap-x-2">
							<h2
								id={headingId}
								title={TEAM_LABELS[team].meaning}
								className="type-title text-foreground"
							>
								{TEAM_LABELS[team].label}
							</h2>
							<p className="type-caption text-text-subtle">
								{TEAM_LABELS[team].meaning}
							</p>
						</div>
						<ul aria-labelledby={headingId} className={GRID}>
							{members.map((agent) => (
								<AgentCard key={agent.slug} agent={agent} />
							))}
						</ul>
					</section>
				);
			})}
		</div>
	);
}

/** Cards in their real shape while the list loads: band, then sections. */
export function AgentCardSkeleton({
	"data-testid": testId,
}: {
	"data-testid": string;
}) {
	return (
		<ul data-testid={testId} aria-hidden="true" className={GRID}>
			{[0, 1, 2].map((i) => (
				<li key={i} className="min-w-0">
					<div className="flex flex-col rounded-card border border-border bg-app-panel shadow-card">
						<div className="flex items-center gap-3 border-b border-border px-4 py-3">
							<Skeleton className="size-11 rounded-control" />
							<span className="flex flex-1 flex-col gap-1.5">
								<Skeleton className="h-4 w-24" />
								<Skeleton className="h-3 w-16" />
							</span>
							{/* Where the status pill sits (v3 .skel-pill). */}
							<Skeleton
								data-testid={`${testId}-pill`}
								className="h-[22px] w-16 rounded-sm"
							/>
						</div>
						<div className="flex flex-col gap-1.5 px-4 py-3">
							<Skeleton className="h-3.5 w-full" />
							<Skeleton className="h-3.5 w-11/12" />
							<Skeleton className="h-3.5 w-2/3" />
						</div>
						{["w-32", "w-full", "w-40"].map((width) => (
							<div
								key={width}
								className="flex flex-col gap-2 border-t border-border px-4 py-3"
							>
								<Skeleton className="h-3 w-16" />
								<Skeleton className={cn("h-5", width)} />
							</div>
						))}
						<div className="flex justify-end border-t border-border px-4 py-2">
							<Skeleton className="h-4 w-12" />
						</div>
					</div>
				</li>
			))}
		</ul>
	);
}
