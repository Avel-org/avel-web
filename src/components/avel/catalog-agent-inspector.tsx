import {
	type AgentTemplate,
	IDENTITY_TOKEN_CAP,
	type IdentityInputField,
	type IdentityVersion,
	KIND_LABELS,
	TEAM_LABELS,
} from "avel-server/contract";
import { ArrowRight, CircleAlert, CircleCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useIdentityVersion } from "@/lib/api/catalog";
import { cn } from "@/lib/utils";
import {
	AGENT_MISSING,
	agentStatus,
	artifactLabel,
	edgesOf,
	kTokens,
	type SampleEdge,
	type SampleOverview,
	sampleOverview,
} from "./catalog-agent-placeholders";
import {
	CATALOG_MISSING,
	SAMPLE_TEAM_TABLE,
	type SampleAgentHistory,
	type SampleDiscipline,
	type SampleOrigin,
	type SampleOutcome,
} from "./catalog-placeholders";
import {
	inCatalogOrder,
	inWaveOrder,
	SampleRegion,
	teamsOf,
	Wrap,
} from "./catalog-sample";
import { CodeView } from "./code-view";
import { type DataColumn, DataTable } from "./data-table";
import { InlineExpand } from "./inline-expand";
import { ShortHash } from "./short-hash";
import { StatusPill } from "./status-pill";
import { ErrorState, Surface } from "./surface";

/*
 * The parts of an agent's page (ruling 38) that read one template: its
 * overview, identity, manifest and versions. Read-only throughout: an
 * identity is generated from roles, so the only way to change one is to
 * change a role it covers. The template's own fields are live; its measures,
 * edges, versions and allowed actions are labelled samples
 * (catalog-placeholders.ts) until their routes exist.
 */

// ---------------------------------------------------------------------------
// Overview.

type Tone = "better" | "worse" | "same";

const TONE_CLASS: Record<Tone, string> = {
	better: "text-gate-pass",
	worse: "text-gate-block",
	same: "text-text-subtle",
};

/**
 * AVEL's names for its measures are kept; these plain readings go beside
 * them on hover, for anyone the names mean nothing to.
 */
export const MEASURE_MEANING = {
	boundaryViolations: "Times it changed a file it wasn't allowed to",
	blockersAbsorbed: "Problems it worked around instead of reporting",
	edgeHashMismatches:
		"Times it read an out-of-date version of another agent's file",
} as const;

/** One metric card: its value and its change since the previous version. */
function Metric({
	label,
	meaning,
	value,
	change,
	"data-testid": testId,
}: {
	label: string;
	/** The plain reading of the label, on hover. */
	meaning?: string;
	value: string;
	change: { text: string; tone: Tone } | null;
	"data-testid": string;
}) {
	return (
		<div
			data-testid={testId}
			className="flex flex-col gap-1 rounded-sm border border-border bg-app-raised p-3"
		>
			<span title={meaning} className="type-caption text-text-subtle">
				{label}
			</span>
			<span className="type-h2 text-foreground tabular-nums">{value}</span>
			<span
				data-testid={`${testId}-change`}
				className={cn(
					"type-mono-small tabular-nums",
					change ? TONE_CLASS[change.tone] : "text-text-subtle",
				)}
			>
				{change?.text ?? "no earlier version"}
			</span>
		</div>
	);
}

/** A signed change: "+4", "-2", "no change". `lowerIsBetter` sets its tone. */
export function changeOf(
	now: number,
	before: number,
	{ lowerIsBetter, unit = "" }: { lowerIsBetter: boolean; unit?: string },
): { text: string; tone: Tone } {
	const d = now - before;
	if (d === 0) return { text: "no change", tone: "same" };
	const better = lowerIsBetter ? d < 0 : d > 0;
	return {
		text: `${d > 0 ? "+" : "-"}${Math.abs(d)}${unit} since last version`,
		tone: better ? "better" : "worse",
	};
}

const pct = (n: number) => Math.round(n * 100);

function Metrics({
	current,
	previous,
	version,
}: {
	current: SampleOverview;
	previous: SampleOverview | null;
	version: number;
}) {
	const was = (
		pick: (o: SampleOverview) => number,
		lowerIsBetter: boolean,
		unit?: string,
	) =>
		previous
			? changeOf(pick(current), pick(previous), { lowerIsBetter, unit })
			: null;
	return (
		<SampleRegion
			missing={CATALOG_MISSING.measures}
			title="Overview measures"
			what="Four numbers from client work on this version, each compared with the version before it."
			data-testid="catalog-agent-metrics"
		>
			<p className="type-caption text-text-subtle">{`Client runs on v${version}`}</p>
			<div className="grid grid-cols-2 gap-2">
				<Metric
					label="Passed the gate first time"
					value={`${pct(current.firstPassGateRate)}%`}
					change={was((o) => pct(o.firstPassGateRate), false, " pts")}
					data-testid="catalog-agent-metric-gate"
				/>
				<Metric
					label="Tokens used of estimate"
					value={`${kTokens(current.tokensActual)} of ${kTokens(current.tokensEstimate)}`}
					change={was((o) => Math.round(o.tokensActual / 1000), true, "k")}
					data-testid="catalog-agent-metric-tokens"
				/>
				<Metric
					label="Boundary violations"
					meaning={MEASURE_MEANING.boundaryViolations}
					value={String(current.boundaryViolations)}
					change={was((o) => o.boundaryViolations, true)}
					data-testid="catalog-agent-metric-violations"
				/>
				<Metric
					label="Blockers filed"
					value={String(current.blockersFiled)}
					change={was((o) => o.blockersFiled, true)}
					data-testid="catalog-agent-metric-blockers"
				/>
			</div>
			<StatusBox overview={current} />
		</SampleRegion>
	);
}

/** Good, or what is wrong, by rule: violations and halts, nothing inferred. */
function StatusBox({ overview }: { overview: SampleOverview }) {
	const status = agentStatus(overview);
	return (
		<div
			data-testid="catalog-agent-status"
			data-ok={status.ok}
			className={cn(
				"flex items-start gap-2 rounded-sm border p-3",
				status.ok
					? "border-gate-pass-line bg-gate-pass-soft"
					: "border-gate-warn-line bg-gate-warn-soft",
			)}
		>
			{status.ok ? (
				<CircleCheck
					aria-hidden="true"
					className="mt-0.5 size-4 text-gate-pass"
				/>
			) : (
				<CircleAlert
					aria-hidden="true"
					className="mt-0.5 size-4 text-gate-warn"
				/>
			)}
			<div className="flex flex-col gap-0.5">
				<p className="type-small font-medium text-foreground">
					{status.ok ? "Everything looks good" : "Needs a look"}
				</p>
				<p className="type-caption text-text-muted">
					{status.ok
						? "It wrote only where it may, and no run stopped at its token limit."
						: `${status.problems.join(" and ")}.`}
				</p>
			</div>
		</div>
	);
}

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
				className="focus-inset flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left transition-colors duration-(--duration-micro) ease-avel hover:bg-state-hover"
			>
				{direction === "in" ? (
					<>
						<span className="type-small text-foreground">{name}</span>
						<ArrowRight
							aria-hidden="true"
							className="size-3.5 text-text-subtle"
						/>
						<span className="type-mono-small min-w-0 truncate text-text-muted">
							{artifacts}
						</span>
					</>
				) : (
					<>
						<span className="type-mono-small min-w-0 truncate text-text-muted">
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
			<h3 className="type-panel-title text-foreground">Handoffs</h3>
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

export function OverviewTab({
	agent,
	agents,
	history,
	onOpen,
}: {
	agent: AgentTemplate;
	agents: readonly AgentTemplate[];
	history: SampleAgentHistory;
	onOpen: (slug: string) => void;
}) {
	const { current, previous } = sampleOverview(agent);
	return (
		<div data-testid="catalog-agent-overview" className="flex flex-col gap-4">
			<Metrics current={current} previous={previous} version={agent.version} />
			<Handoffs agent={agent} agents={agents} onOpen={onOpen} />
			<MeasuresRegion history={history} />
		</div>
	);
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
				This agent's identity hasn't been generated yet. It's written from its
				roles when the operator regenerates it.
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
					<Skeleton className="h-40 w-full rounded-sm" />
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
					className="flex items-start gap-2 rounded-sm border border-gate-warn-line bg-gate-warn-soft px-3 py-2 type-small text-foreground"
				>
					<CircleAlert
						aria-hidden="true"
						className="mt-0.5 size-4 shrink-0 text-gate-warn"
					/>
					{staleLine(version.ref, agent.staleInputs)}
				</p>
			) : null}
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 type-mono-small text-text-muted">
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
					"type-mono-small tabular-nums",
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
						className="type-mono-small text-text-muted tabular-nums"
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
 * The template's own fields, live, then the sample allowed actions. The
 * panel around it carries the "Manifest" title, so this has none of its own.
 */
export function ManifestTab({ agent }: { agent: AgentTemplate }) {
	return (
		<div className="flex flex-col gap-4">
			<div data-testid="catalog-agent-manifest" className="flex flex-col gap-2">
				<div
					data-testid="catalog-agent-manifest-text"
					className="flex flex-col gap-0.5 rounded-xs border border-border bg-app-recessed p-3 type-mono-small"
				>
					<Line k="kind">
						{agent.kind}
						<span
							data-testid="catalog-agent-kind-words"
							title={KIND_MEANING[agent.kind]}
							className="text-text-muted"
						>{` # ${KIND_LABELS[agent.kind]}`}</span>
					</Line>
					<Line k="roles">{`[${inCatalogOrder(agent.roles).join(", ")}]`}</Line>
					<Line k="waveDefaults">{`[${inWaveOrder(agent.waveDefaults).join(", ")}]`}</Line>
					<Line k="engagementId">
						{agent.engagementId ?? (
							<span className="text-text-muted"># used for every client</span>
						)}
					</Line>
					<span className="text-text-subtle">writablePaths:</span>
					{agent.writablePaths.length === 0 ? (
						<span className="pl-4 text-text-muted">[] # writes nothing</span>
					) : (
						<ul aria-label="Writable paths" className="flex flex-col">
							{agent.writablePaths.map((glob) => (
								<li
									key={glob}
									data-testid="catalog-agent-writable-path"
									className="pl-4 text-foreground"
								>
									{`- ${glob}`}
								</li>
							))}
						</ul>
					)}
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
			<h3 className="type-panel-title text-foreground">Allowed actions</h3>
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

// ---------------------------------------------------------------------------
// Measures. Discipline and outcome are kept apart, and so are client and
// internal runs: nothing here adds one to the other.

const ORIGIN_LABEL: Record<SampleOrigin, string> = {
	client: "Client",
	internal: "Internal",
};

type DisciplineRow = {
	id: keyof Omit<SampleDiscipline, "origin">;
	label: string;
};

const meaningOf = (id: DisciplineRow["id"]): string | undefined =>
	id in MEASURE_MEANING
		? MEASURE_MEANING[id as keyof typeof MEASURE_MEANING]
		: undefined;

const DISCIPLINE_ROWS: DisciplineRow[] = [
	{ id: "runs", label: "Runs" },
	{ id: "boundaryViolations", label: "Boundary violations" },
	{ id: "blockersFiled", label: "Blockers filed" },
	{ id: "blockersAbsorbed", label: "Blockers absorbed" },
	{ id: "edgeHashMismatches", label: "Handoff hash mismatches" },
	{ id: "testWritesCaught", label: "Test-file writes caught" },
];

function Discipline({ history }: { history: SampleAgentHistory }) {
	const byOrigin = (origin: SampleOrigin) =>
		history.discipline.find((row) => row.origin === origin);
	const columns: DataColumn<DisciplineRow>[] = [
		{
			id: "measure",
			header: "Measure",
			cell: (row) => <span title={meaningOf(row.id)}>{row.label}</span>,
		},
		...(["client", "internal"] as const).map(
			(origin): DataColumn<DisciplineRow> => ({
				id: origin,
				header: ORIGIN_LABEL[origin],
				align: "end",
				mono: true,
				width: "5rem",
				cell: (row) => byOrigin(origin)?.[row.id] ?? "—",
			}),
		),
	];
	return (
		<div data-testid="catalog-agent-discipline" className="flex flex-col gap-2">
			<h3 className="type-panel-title text-foreground">Discipline</h3>
			<p className="type-caption text-text-subtle">
				How well the agent keeps to its rules, across all of its work. Client
				and internal runs are counted separately.
			</p>
			<DataTable
				label="Discipline measures, client and internal"
				data-testid="catalog-discipline-table"
				columns={columns}
				rows={DISCIPLINE_ROWS}
				getRowId={(row) => row.id}
				density="compact"
				stickyHeader={false}
			/>
		</div>
	);
}

const usd = (value: number) => `$${value.toFixed(2)}`;
const percent = (value: number) => `${Math.round(value * 100)}%`;

const OUTCOME_COLUMNS: DataColumn<SampleOutcome>[] = [
	{
		id: "territory",
		header: <Wrap>Territory and engagement</Wrap>,
		cell: (row) => (
			<span className="flex flex-col">
				{row.territory ?? (
					<span className="text-text-subtle">Whole project</span>
				)}
				<span
					data-testid="catalog-outcome-engagement"
					className="type-caption text-text-subtle"
				>
					{row.engagement}
				</span>
			</span>
		),
	},
	{
		id: "template",
		header: "Template",
		mono: true,
		cell: (r) => r.missionTemplate,
	},
	{ id: "runs", header: "Runs", align: "end", mono: true, cell: (r) => r.runs },
	{
		id: "tokens",
		header: <Wrap>Tokens per run</Wrap>,
		align: "end",
		mono: true,
		cell: (r) => r.tokensPerRun.toLocaleString("en-US"),
	},
	{
		id: "cost",
		header: <Wrap>Cost per run</Wrap>,
		align: "end",
		mono: true,
		cell: (r) => usd(r.costPerRunUsd),
	},
	{
		id: "gate",
		header: <Wrap>First-pass gate rate</Wrap>,
		align: "end",
		mono: true,
		cell: (r) => percent(r.firstPassGateRate),
	},
];

function Outcome({ history }: { history: SampleAgentHistory }) {
	return (
		<div data-testid="catalog-agent-outcome" className="flex flex-col gap-2">
			<h3 className="type-panel-title text-foreground">Outcome</h3>
			<p className="type-caption text-text-subtle">
				What the work cost and how it went, for one territory on one mission
				template per row. Each row stands alone; rows are never added up.
			</p>
			{(["client", "internal"] as const).map((origin) => {
				const rows = history.outcomes.filter((row) => row.origin === origin);
				return (
					<div
						key={origin}
						data-testid={`catalog-agent-outcome-${origin}`}
						className="flex flex-col gap-1"
					>
						<h4 className="type-caption text-text-muted">
							{`${ORIGIN_LABEL[origin]} runs`}
						</h4>
						{rows.length === 0 ? (
							<p className="type-small text-text-subtle">
								{`No recorded ${origin} runs.`}
							</p>
						) : (
							<DataTable
								label={`Outcome measures, ${origin} runs`}
								data-testid={`catalog-outcome-table-${origin}`}
								columns={OUTCOME_COLUMNS}
								rows={rows}
								getRowId={(row) => row.id}
								density="compact"
								stickyHeader={false}
							/>
						)}
					</div>
				);
			})}
		</div>
	);
}

function Reconstructed({ history }: { history: SampleAgentHistory }) {
	if (history.reconstructed.length === 0) return null;
	return (
		<div
			data-testid="catalog-agent-reconstructed"
			className="flex flex-col gap-2"
		>
			<h3 className="type-panel-title text-foreground">Reconstructed runs</h3>
			<p className="type-caption text-text-subtle">
				Their version was worked out later from git history, not recorded when
				they ran. Their findings still count, but they are left out of every
				measure above.
			</p>
			<ul className="flex flex-col divide-y divide-border">
				{history.reconstructed.map((run) => (
					<li
						key={run.id}
						data-testid="catalog-agent-reconstructed-run"
						className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
					>
						<StatusPill
							size="sm"
							tone="stale"
							label="Reconstructed"
							attested
							data-testid="catalog-reconstructed-pill"
						/>
						<span className="type-mono-small text-foreground">
							{run.mission}
						</span>
						<span className="type-mono-small text-text-subtle">
							{run.commit}
						</span>
						<span className="type-small text-text-muted">{run.findings}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

const MEASURE_SECTIONS = ["discipline", "outcome"] as const;

export function MeasuresRegion({ history }: { history: SampleAgentHistory }) {
	return (
		<SampleRegion
			missing={CATALOG_MISSING.measures}
			title="Measures"
			what="How well it keeps to its rules across all its work, and how each territory and mission template went. Client and internal runs are kept apart, and reconstructed runs are set aside."
			data-testid="catalog-agent-measures"
		>
			{/* Folded, so the tab stays short: the four measures and the edges
			    above say how it is doing; these say why, for whoever opens them. */}
			<div className="flex flex-col gap-6">
				<InlineExpand
					data-testid="catalog-agent-measures-more"
					items={MEASURE_SECTIONS}
					visible={0}
					noun="sections"
					getKey={(id) => id}
					className="gap-6"
					render={(id) =>
						id === "discipline" ? (
							<Discipline history={history} />
						) : (
							<Outcome history={history} />
						)
					}
				/>
				<Reconstructed history={history} />
			</div>
		</SampleRegion>
	);
}
