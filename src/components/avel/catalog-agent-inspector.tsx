import {
	type AgentTemplate,
	IDENTITY_TOKEN_CAP,
	type IdentityInputField,
	type IdentityVersion,
	KIND_LABELS,
	TEAM_LABELS,
} from "avel-server/contract";
import { ArrowRight, CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useIdentityVersion } from "@/lib/api/catalog";
import { cn } from "@/lib/utils";
import {
	AGENT_MISSING,
	artifactLabel,
	edgesOf,
	type SampleEdge,
} from "./catalog-agent-placeholders";
import { CATALOG_MISSING, SAMPLE_TEAM_TABLE } from "./catalog-placeholders";
import { inWaveOrder, SampleRegion, teamsOf } from "./catalog-sample";
import { CodeView } from "./code-view";
import { ROW_LINK_GROUP, RowChevron } from "./row-link";
import { ShortHash } from "./short-hash";
import { ErrorState, Surface } from "./surface";

/*
 * The parts of an agent's page that read one template: its
 * overview, identity, manifest and versions. Read-only throughout: an
 * identity is generated from roles, so the only way to change one is to
 * change a role it covers. The template's own fields are live; its measures,
 * edges, versions and allowed actions are labelled samples
 * (catalog-placeholders.ts) until their routes exist.
 */

// ---------------------------------------------------------------------------
// Overview.

/** One edge as a row that opens the agent at its other end. */
function EdgeRow({
	edge,
	direction,
	other,
	onOpen,
}: {
	edge: SampleEdge;
	direction: "in" | "out";
	other: AgentTemplate | undefined;
	onOpen: (slug: string) => void;
}) {
	const slug = direction === "in" ? edge.from : edge.to;
	const name = other?.name ?? slug;
	const artifacts = edge.artifacts.map(artifactLabel).join(", ");
	return (
		<li>
			<button
				type="button"
				data-testid={`catalog-agent-edge-row-${edge.from}-${edge.to}`}
				onClick={() => onOpen(slug)}
				className={`${ROW_LINK_GROUP} focus-inset flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left transition-colors duration-(--duration-micro) ease-avel hover:bg-app-raised`}
			>
				{direction === "in" ? (
					<>
						<span className="type-small text-foreground">{name}</span>
						<ArrowRight
							aria-hidden="true"
							className="size-3.5 text-text-subtle"
						/>
						<span className="type-mono min-w-0 truncate text-text-muted">
							{artifacts}
						</span>
					</>
				) : (
					<>
						<span className="type-mono min-w-0 truncate text-text-muted">
							{artifacts}
						</span>
						<ArrowRight
							aria-hidden="true"
							className="size-3.5 text-text-subtle"
						/>
						<span className="type-small text-foreground">{name}</span>
					</>
				)}
				<span className="sr-only">{`, open ${name}`}</span>
				<RowChevron className="ml-auto" />
			</button>
		</li>
	);
}

function Handoffs({
	agent,
	agents,
	onOpen,
}: {
	agent: AgentTemplate;
	agents: readonly AgentTemplate[];
	onOpen: (slug: string) => void;
}) {
	const { incoming, outgoing } = edgesOf(agent, agents);
	const named = (slug: string) => agents.find((a) => a.slug === slug);
	return (
		<SampleRegion
			missing={AGENT_MISSING.edges}
			title="Handoffs"
			what="Which agents hand this one files, and which agents it hands files to, each file with its hash."
			data-testid="catalog-agent-edges"
		>
			<h3 className="type-title text-foreground">Handoffs</h3>
			<p className="type-caption text-text-subtle">
				The files this agent reads from other agents, and the files it writes
				for them.
			</p>
			{incoming.length === 0 && outgoing.length === 0 ? (
				<p className="type-small text-text-subtle">
					No other agent here hands it a file or reads a file it writes.
				</p>
			) : (
				<div className="flex flex-col gap-2">
					{incoming.length > 0 ? (
						<ul
							aria-label="Reads from"
							data-testid="catalog-agent-reads"
							className="flex flex-col"
						>
							{incoming.map((edge) => (
								<EdgeRow
									key={edge.from}
									edge={edge}
									direction="in"
									other={named(edge.from)}
									onOpen={onOpen}
								/>
							))}
						</ul>
					) : null}
					{outgoing.length > 0 ? (
						<ul
							aria-label="Writes to"
							data-testid="catalog-agent-writes"
							className="flex flex-col"
						>
							{outgoing.map((edge) => (
								<EdgeRow
									key={edge.to}
									edge={edge}
									direction="out"
									other={named(edge.to)}
									onOpen={onOpen}
								/>
							))}
						</ul>
					) : null}
				</div>
			)}
		</SampleRegion>
	);
}

/**
 * Who hands this agent files and who it hands them to: still sample data,
 * since no route reads handoff edges yet. Its measures are live (module 12,
 * agent-metrics.tsx).
 */
export function AgentHandoffs({
	agent,
	agents,
	onOpen,
}: {
	agent: AgentTemplate;
	agents: readonly AgentTemplate[];
	onOpen: (slug: string) => void;
}) {
	return <Handoffs agent={agent} agents={agents} onOpen={onOpen} />;
}

// ---------------------------------------------------------------------------
// Identity, manifest, versions.

/**
 * A stub: the generator has written no more than headings, such as
 * "# Atlas". Anything past a heading is a written identity.
 */
export function isIdentityStub(identityMd: string): boolean {
	return identityMd
		.split("\n")
		.map((line) => line.trim())
		.every((line) => line === "" || line.startsWith("#"));
}

/** Each identity input in plain words, for the stale banner. */
export const INPUT_WORDS = {
	generatorVersion: "the generator",
	slug: "its slug",
	name: "its name",
	kind: "its kind",
	roles: "its roles",
	writablePaths: "the files it may change",
	definitionsSha256: "the role definitions",
	skills: "its skills",
} as const satisfies Record<IdentityInputField, string>;

/** "a, b and c". */
const andList = (items: readonly string[]) =>
	items.length <= 1
		? (items[0] ?? "")
		: `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/** "Inputs changed since atlas@v3: its roles and its skills." */
export function staleLine(ref: string, inputs: readonly IdentityInputField[]) {
	return `Inputs changed since ${ref}: ${andList(inputs.map((i) => INPUT_WORDS[i]))}.`;
}

/**
 * The identity version in force, read by number with its text: identity.md
 * and depth.md, the server's token counts, and its hash and ref. A template
 * with no version says so and asks for nothing.
 */
export function IdentityTab({ agent }: { agent: AgentTemplate }) {
	if (agent.identityVersion === null)
		return (
			<p
				data-testid="catalog-agent-identity-none"
				className="type-small text-text-muted"
			>
				This agent's identity hasn't been generated yet. Generate identity,
				above, writes it from its roles.
			</p>
		);
	return <IdentityRead agent={agent} number={agent.identityVersion} />;
}

/** The version read; only mounted when there is a version to read. */
function IdentityRead({
	agent,
	number,
}: {
	agent: AgentTemplate;
	number: number;
}) {
	const query = useIdentityVersion(agent.id, number);
	return (
		<Surface
			data-testid="catalog-agent-identity-surface"
			query={query}
			isEmpty={() => false}
			loading={
				<div
					data-testid="catalog-agent-identity-skeleton"
					className="flex flex-col gap-2"
				>
					<Skeleton className="h-4 w-1/3" />
					<Skeleton className="h-40 w-full rounded-control" />
				</div>
			}
			empty={null}
			error={ErrorState}
		>
			{(version) => <IdentityText agent={agent} version={version} />}
		</Surface>
	);
}

export function IdentityText({
	agent,
	version,
}: {
	agent: Pick<AgentTemplate, "name" | "identityStale" | "staleInputs">;
	version: IdentityVersion;
}) {
	const stub = isIdentityStub(version.identityMd);
	const over = version.identityTokens > IDENTITY_TOKEN_CAP;
	return (
		<div data-testid="catalog-agent-identity" className="flex flex-col gap-3">
			{agent.identityStale ? (
				<p
					data-testid="catalog-agent-identity-stale"
					className="flex items-start gap-2 rounded-control border border-gate-warn-line bg-gate-warn-banner px-3 py-2 type-small text-foreground"
				>
					<CircleAlert
						aria-hidden="true"
						className="mt-0.5 size-4 shrink-0 text-gate-warn"
					/>
					{staleLine(version.ref, agent.staleInputs)}
				</p>
			) : null}
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 type-mono text-text-muted">
				<span
					data-testid="catalog-agent-identity-ref"
					className="text-foreground"
				>
					{version.ref}
				</span>
				<ShortHash
					value={version.sha256}
					label="the identity's SHA-256"
					data-testid="catalog-agent-identity-sha"
				/>
			</div>
			{stub ? (
				<p
					data-testid="catalog-agent-identity-stub"
					className="type-small text-text-muted"
				>
					{`${agent.name}'s identity is still a stub: it has only a heading so far. The identity generator will write the rest from its roles (module 5).`}
				</p>
			) : null}
			<CodeView
				text={version.identityMd}
				label={`${agent.name}'s identity.md`}
				className={stub ? "w-fit max-w-full min-w-48" : undefined}
				data-testid="catalog-agent-identity-code"
			/>
			<p
				data-testid="catalog-agent-identity-tokens"
				data-over={over || undefined}
				className={cn(
					"type-mono tabular-nums",
					over ? "text-gate-block" : "text-text-muted",
				)}
			>
				{`identity.md: ${version.identityTokens} / ${IDENTITY_TOKEN_CAP} tokens`}
			</p>
			{version.depthMd.trim() === "" ? null : (
				<>
					<CodeView
						text={version.depthMd}
						label={`${agent.name}'s depth.md`}
						data-testid="catalog-agent-depth-code"
					/>
					<p
						data-testid="catalog-agent-depth-tokens"
						className="type-mono text-text-muted tabular-nums"
					>
						{`depth.md: ${version.depthTokens} / ${IDENTITY_TOKEN_CAP} tokens`}
					</p>
				</>
			)}
		</div>
	);
}

/** A manifest line: `key: value`, the key muted, the value machine text. */
function Line({ k, children }: { k: string; children: ReactNode }) {
	return (
		<div className="flex gap-2">
			<span className="text-text-subtle">{`${k}:`}</span>
			<span className="min-w-0 text-foreground">{children}</span>
		</div>
	);
}

/** The longer reading of KIND_LABELS, on hover. */
const KIND_MEANING = {
	horizontal: "Owns one layer of the app, across every feature.",
	feature: "Owns one feature, from data to screen.",
} as const satisfies Record<AgentTemplate["kind"], string>;

/**
 * The template's fields the editors above it do not cover, live, then the
 * sample allowed actions. The panel around it carries the "Manifest" title,
 * so this has none of its own.
 */
export function ManifestTab({ agent }: { agent: AgentTemplate }) {
	return (
		<div className="flex flex-col gap-4">
			<div data-testid="catalog-agent-manifest" className="flex flex-col gap-2">
				<div
					data-testid="catalog-agent-manifest-text"
					className="flex flex-col gap-0.5 rounded-xs border border-border bg-app-well p-3 type-mono"
				>
					<Line k="kind">
						{agent.kind}
						<span
							data-testid="catalog-agent-kind-words"
							title={KIND_MEANING[agent.kind]}
							className="text-text-muted"
						>{` # ${KIND_LABELS[agent.kind]}`}</span>
					</Line>
					<Line k="waveDefaults">{`[${inWaveOrder(agent.waveDefaults).join(", ")}]`}</Line>
					<Line k="engagementId">
						{agent.engagementId ?? (
							<span className="text-text-muted"># used for every client</span>
						)}
					</Line>
					<Line k="version">{agent.version}</Line>
				</div>
			</div>
			<ActionsRegion agent={agent} />
		</div>
	);
}

const ACTION_TERMS = [
	["read", "Read"],
	["act", "Act"],
	["propose", "Propose"],
] as const;

/**
 * The allowed actions as a term and description list, one group per
 * family: the Manifest column is narrow, and a four-column table there wraps
 * a word to a line.
 */
function ActionsRegion({ agent }: { agent: AgentTemplate }) {
	const covered = new Set(teamsOf(agent.roles));
	const rows = SAMPLE_TEAM_TABLE.filter((row) => covered.has(row.team));
	return (
		<SampleRegion
			missing={CATALOG_MISSING.teams}
			title="Allowed actions"
			what="What this agent may read, do and suggest through AVEL's API, set by the family each of its roles belongs to."
			data-testid="catalog-agent-actions"
		>
			<h3 className="type-title text-foreground">Allowed actions</h3>
			{rows.length === 0 ? (
				<p className="type-small text-text-subtle">
					Its roles are run by code, not by a model, so it has no API access.
				</p>
			) : (
				<dl
					aria-label="What this agent's teams may do through the API"
					data-testid="catalog-agent-actions-table"
					className="flex flex-col divide-y divide-border"
				>
					{rows.map((row) => (
						<div
							key={row.team}
							data-testid={`catalog-agent-actions-table-row-${row.team}`}
							className="flex flex-col gap-1.5 py-2 first:pt-0 last:pb-0"
						>
							<dt className="type-small font-medium text-foreground">
								{TEAM_LABELS[row.team].label}
							</dt>
							<dd>
								<dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1">
									{ACTION_TERMS.map(([key, term]) => (
										<div key={key} className="contents">
											<dt className="type-caption text-text-subtle">{term}</dt>
											<dd className="type-small text-text-muted">{row[key]}</dd>
										</div>
									))}
								</dl>
							</dd>
						</div>
					))}
				</dl>
			)}
		</SampleRegion>
	);
}
