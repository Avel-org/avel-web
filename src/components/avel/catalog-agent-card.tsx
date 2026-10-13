import { Link } from "@tanstack/react-router";
import { type AgentTemplate, WAVES } from "avel-server/contract";
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
	territoriesOf,
} from "./catalog-agent-placeholders";
import { AgentTile, KIND_LABEL } from "./catalog-agent-table";
import { familiesOf } from "./catalog-placeholders";
import { inCatalogOrder, inWaveOrder, SampleRegion } from "./catalog-sample";

/*
 * All agents as cards (ruling 44): one notched plate per agent, built from
 * sections of related facts, so an agent's shape reads before it is opened.
 * The identity band, then its description, roles, where it works, its
 * territory (a sample, labelled), what it may write, and Open. The whole
 * card opens the agent's page: one link, stretched over the card, so the
 * Sample data pill inside stays a button of its own (a button inside a link
 * is invalid) and the keyboard meets one link per card.
 */

/** What a firm agent's waves section says, and why. */
export const FIRM_WAVES = {
	text: "Between missions",
	title: "Firm agents work between missions. The firm roster has no waves.",
} as const;

/** How many globs and roles a card lists before it counts the rest. */
export const CARD_PATHS = 3;
export const CARD_ROLES = 4;

// ---------------------------------------------------------------------------
// The description. The agent's own written description first; when it has
// none (null), the first paragraph of its identity; when that has no prose,
// what its roles do, from the client copy of ROLES.md. Only that last one is
// not the server's words, so only it says where it came from.

/** How long a description runs before it is cut at a word. */
export const DESCRIPTION_MAX = 220;

/** The generator's own notice in an identity: not a description. */
const GENERATOR_NOTICE = /^generated from roles\b/i;

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

/**
 * The first prose paragraph of an identity: headings, list items, quotes,
 * rules, fences and the generator's notice are skipped. Null when there is
 * no prose, as in a stub identity ("# Atlas").
 */
export function identityProse(identityMd: string): string | null {
	const paragraphs: string[][] = [[]];
	let fenced = false;
	for (const raw of identityMd.split("\n")) {
		const line = raw.trim();
		if (line.startsWith("```")) {
			fenced = !fenced;
			paragraphs.push([]);
			continue;
		}
		const skip =
			fenced ||
			line === "" ||
			/^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|---|\*\*\*|<)/.test(line);
		if (skip) paragraphs.push([]);
		else paragraphs.at(-1)?.push(plain(line));
	}
	const prose = paragraphs
		.map((lines) => lines.join(" ").trim())
		.find((text) => text !== "" && !GENERATOR_NOTICE.test(text));
	return prose === undefined ? null : cap(prose);
}

/** "a, b and c". */
const listOf = (items: readonly string[]) =>
	items.length <= 1
		? (items[0] ?? "")
		: `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/** At most this many inputs are named; the rest are counted. */
const READS_NAMED = 3;

/**
 * One plain account of an agent from its roles: its family, what it
 * writes and from what, and where it works.
 */
export function rolesSentence(agent: AgentTemplate): string {
	const families = familiesOf(agent.roles);
	const family = listOf(families);
	const article = /^[AEIOU]/.test(family) ? "An" : "A";
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
		families.length > 0 ? `${article} ${family} agent.` : "",
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
	/**
	 * Where the words came from: the agent's written description, the first
	 * paragraph of its identity, or its roles.
	 */
	source: "written" | "identity" | "roles";
};

/** What a card says the agent is, from the first source that has words. */
export function agentDescription(agent: AgentTemplate): AgentDescription {
	// The contract never sends "": null means not written. Trimmed anyway, so
	// blank text never wins over the identity.
	const written = plain(agent.description ?? "");
	if (written !== "") return { text: cap(written), source: "written" };
	const prose = identityProse(agent.identityMd);
	return prose === null
		? { text: cap(rolesSentence(agent)), source: "roles" }
		: { text: prose, source: "identity" };
}

/** The first section: what the agent is, in prose, with the most room. */
function DescriptionSection({ agent }: { agent: AgentTemplate }) {
	const { text, source } = agentDescription(agent);
	return (
		<div
			data-testid={`catalog-agent-card-description-${agent.slug}`}
			data-section="description"
			data-source={source}
			className="flex min-w-0 flex-col gap-1.5 px-4 pt-3.5 pb-3"
		>
			<p
				data-testid={`catalog-agent-description-${agent.slug}`}
				title={text}
				className="line-clamp-3 min-h-[3lh] type-body leading-relaxed font-[450] text-foreground"
			>
				{text}
			</p>
			{source === "roles" ? (
				<span
					data-testid={`catalog-agent-description-source-${agent.slug}`}
					title="Said from a client copy of ROLES.md, because its identity has no prose yet."
					className="type-caption text-text-subtle"
				>
					From its roles
				</span>
			) : null}
		</div>
	);
}

// ---------------------------------------------------------------------------

/** A section's label, engraved, with an optional count in mono. */
function SectionLabel({
	children,
	count,
}: {
	children: ReactNode;
	count?: number;
}) {
	return (
		<span className="flex items-baseline justify-between gap-2">
			<span className="engraved type-caption font-medium tracking-wide text-text-subtle uppercase">
				{children}
			</span>
			{count === undefined ? null : (
				<span className="type-mono-small text-text-subtle tabular-nums">
					{count}
				</span>
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
			className="flex min-w-0 flex-col gap-2 border-t border-border px-4 py-3"
		>
			<SectionLabel count={count}>{label}</SectionLabel>
			{children}
		</div>
	);
}

/** Waves A to E: the ones it runs filled, the rest dashed. */
function WaveStrip({ agent }: { agent: AgentTemplate }) {
	if (isFirmAgent(agent)) {
		return (
			<span
				data-testid={`catalog-agent-waves-${agent.slug}`}
				data-firm="true"
				title={FIRM_WAVES.title}
				className="relative flex h-6 items-center justify-center rounded-xs border border-dashed border-border-strong type-caption text-text-muted"
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
			className="flex gap-1"
		>
			{WAVES.map((wave) => (
				<span
					key={wave}
					aria-hidden="true"
					data-wave={wave}
					data-runs={runs.has(wave)}
					className={cn(
						"flex h-6 flex-1 items-center justify-center rounded-xs border type-mono-small",
						runs.has(wave)
							? "border-accent bg-accent-soft text-foreground"
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

/**
 * Territory and side: samples from the roster, in a region of their own
 * whose pill names the territories. The side is a second sample, so it
 * carries its own dashed underline and its reason in words.
 */
function TerritorySection({ agent }: { agent: AgentTemplate }) {
	const territories = territoriesOf(agent);
	const side = sideOf(agent);
	const sideWords = `Sample data until avel-server has ${AGENT_MISSING.sides}.`;
	return (
		<div className="border-t border-border px-4 py-3">
			<SampleRegion
				missing={AGENT_MISSING.territories}
				title="Territory"
				what="The part of the project this agent works in, and its side."
				data-testid={`catalog-agent-card-territory-${agent.slug}`}
				// Above the stretched link, so the pill's tooltip can be reached.
				className="relative z-10 gap-1.5"
			>
				<dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1">
					<dt className="type-caption text-text-subtle">Territory</dt>
					<dd
						data-testid={`catalog-agent-territory-${agent.slug}`}
						className="truncate type-small text-foreground"
						title={territories.join(", ") || "whole project"}
					>
						{territories.length > 0 ? territories.join(", ") : "whole project"}
					</dd>
					<dt className="type-caption text-text-subtle">Side</dt>
					<dd
						data-testid={`catalog-agent-side-${agent.slug}`}
						data-missing={AGENT_MISSING.sides}
						title={sideWords}
						className="relative justify-self-start border-b border-dashed border-border-strong type-mono-small text-text-muted"
					>
						{side ?? "firm"}
						<span className="sr-only">{`, ${sideWords}`}</span>
					</dd>
				</dl>
			</SampleRegion>
		</div>
	);
}

export function AgentCard({ agent }: { agent: AgentTemplate }) {
	const roles = inCatalogOrder(agent.roles);
	const paths = agent.writablePaths;
	const nameId = `catalog-agent-card-name-${agent.slug}`;
	return (
		<li
			data-testid={`catalog-agent-card-${agent.slug}`}
			className="plate-notched-lift min-w-0"
		>
			<article
				aria-labelledby={nameId}
				data-side={sideOf(agent) ?? "firm"}
				className="plate plate-interactive plate-notched flex h-full min-w-0 flex-col rounded-md border has-[a:focus-visible]:-translate-y-px has-[a:focus-visible]:border-border-strong"
			>
				{/* Identity: the band at the top of the plate. */}
				<div
					data-testid={`catalog-agent-card-identity-${agent.slug}`}
					data-section="identity"
					className="groove-b flex min-w-0 items-start gap-3 bg-app-band py-3.5 pr-7 pl-4"
				>
					<AgentTile agent={agent} size="lg" />
					<span className="flex min-w-0 flex-1 flex-col gap-0.5">
						<h2
							id={nameId}
							className="engraved truncate type-body font-medium text-foreground"
						>
							{agent.name}
						</h2>
						<span className="truncate type-mono-small text-text-subtle">
							{agent.slug}
						</span>
					</span>
					<span className="flex shrink-0 flex-col items-end gap-1">
						<Badge
							variant="outline"
							data-testid={`catalog-agent-kind-${agent.slug}`}
							data-kind={agent.kind}
						>
							{KIND_LABEL[agent.kind]}
						</Badge>
						<span
							data-testid={`catalog-agent-version-${agent.slug}`}
							className="type-mono-small text-text-subtle"
						>
							{`v${agent.version}`}
						</span>
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
						className="flex flex-wrap gap-1"
					>
						{roles.slice(0, CARD_ROLES).map((role) => (
							<Badge key={role} variant="tag" data-testid="catalog-role">
								{role}
							</Badge>
						))}
						{roles.length > CARD_ROLES ? (
							<span className="self-center type-caption text-text-subtle">
								{`+${roles.length - CARD_ROLES} more`}
							</span>
						) : null}
					</span>
				</CardSection>

				<CardSection label="Where it works" section="waves" slug={agent.slug}>
					<WaveStrip agent={agent} />
				</CardSection>

				<TerritorySection agent={agent} />

				<CardSection
					label="Writable paths"
					count={paths.length}
					section="paths"
					slug={agent.slug}
				>
					{paths.length === 0 ? (
						<span className="type-caption text-text-subtle">
							Writes no files.
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
									className="truncate type-mono-small text-text-muted"
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

				<div className="mt-auto flex items-center justify-end border-t border-border px-4 py-2.5">
					<Link
						to="/catalog/agents/$slug"
						params={{ slug: agent.slug }}
						data-testid={`catalog-agent-card-open-${agent.slug}`}
						aria-label={`Open ${agent.name}`}
						// Stretched over the card: the whole plate is this one link.
						className="inline-flex items-center gap-1 rounded-xs type-small font-medium text-accent-text after:absolute after:inset-0 after:content-['']"
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

export function AgentCardGrid({
	agents,
}: {
	agents: readonly AgentTemplate[];
}) {
	return (
		<ul
			aria-label="All agents"
			data-testid="catalog-agents-cards"
			className={GRID}
		>
			{agents.map((agent) => (
				<AgentCard key={agent.slug} agent={agent} />
			))}
		</ul>
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
				<li key={i} className="plate-notched-lift min-w-0">
					<div className="plate plate-notched flex flex-col rounded-md border">
						<div className="groove-b flex items-center gap-3 bg-app-band py-3.5 pr-7 pl-4">
							<Skeleton className="size-11 rounded-sm" />
							<span className="flex flex-1 flex-col gap-1.5">
								<Skeleton className="h-4 w-24" />
								<Skeleton className="h-3 w-16" />
							</span>
							<Skeleton className="h-5 w-14 rounded-full" />
						</div>
						<div className="flex flex-col gap-1.5 px-4 pt-3.5 pb-3">
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
						<div className="flex justify-end border-t border-border px-4 py-2.5">
							<Skeleton className="h-4 w-12" />
						</div>
					</div>
				</li>
			))}
		</ul>
	);
}
