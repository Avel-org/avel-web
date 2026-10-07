import type { AgentTemplate } from "avel-server/contract";
import {
	ArrowRight,
	CircleAlert,
	CircleCheck,
	Copy,
	Network,
	X,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
	territoriesOf,
} from "./catalog-agent-placeholders";
import { AgentTile } from "./catalog-agent-table";
import {
	CATALOG_MISSING,
	familiesOf,
	IDENTITY_TOKEN_CAP,
	SAMPLE_FAMILY_TABLE,
	type SampleAgentHistory,
	type SampleDiscipline,
	type SampleOrigin,
	type SampleOutcome,
	sampleHistory,
} from "./catalog-placeholders";
import {
	inCatalogOrder,
	inWaveOrder,
	SampleRegion,
	Wrap,
} from "./catalog-sample";
import { CodeView } from "./code-view";
import { type DataColumn, DataTable } from "./data-table";
import { StatusPill } from "./status-pill";

/*
 * The agent panel: one template, in a slide-over from the right at every
 * width, so the table or graph keeps the whole content width. Read-only
 * throughout: an identity is generated from roles, so the only way to change
 * one is to change a role it covers.
 */

export const PANEL_TABS = [
	{ id: "overview", label: "Overview" },
	{ id: "identity", label: "Identity" },
	{ id: "manifest", label: "Manifest" },
	{ id: "versions", label: "Versions" },
] as const;

type PanelProps = {
	agent: AgentTemplate;
	/** Every template, so edges can name the agent at the other end. */
	agents: readonly AgentTemplate[];
	onOpen: (slug: string) => void;
	onViewInGraph: (slug: string) => void;
	onClose: () => void;
};

/** "scheduling, billing, domain, api-surface": territory, then roles. */
export function panelSubtitle(agent: AgentTemplate): string {
	const territories = territoriesOf(agent);
	return [
		...(territories.length > 0 ? territories : ["whole project"]),
		...inCatalogOrder(agent.roles),
	].join(", ");
}

/**
 * The slide-over's width: the whole width on a phone, 32rem from sm up. The
 * Sheet primitive's own w-3/4 and sm:max-w-sm give way to these.
 */
export const PANEL_WIDTH = "w-full sm:w-[32rem] sm:max-w-[32rem]";

/**
 * Where focus goes when the panel closes: the row or node that opened it.
 * Opened from a link (?agent=slug), nothing opened it, and focus is left to
 * the dialog's default.
 */
export function panelOpener(slug: string): HTMLElement | SVGElement | null {
	return document.querySelector<HTMLElement | SVGElement>(
		`[data-testid="catalog-agents-table-row-${slug}"], [data-testid="catalog-agent-node-${slug}"]`,
	);
}

/**
 * The panel, sliding in from the right over the page. It closes by its X,
 * Escape or a click outside, each through onOpenChange.
 */
export function AgentPanelSheet({
	open,
	...props
}: PanelProps & { open: boolean }) {
	return (
		<Sheet
			open={open}
			onOpenChange={(next) => {
				if (!next) props.onClose();
			}}
		>
			<SheetContent
				side="right"
				showCloseButton={false}
				data-testid="catalog-agent-panel-sheet"
				className={cn("gap-0", PANEL_WIDTH)}
				onCloseAutoFocus={(event) => {
					const opener = panelOpener(props.agent.slug);
					if (!opener) return;
					event.preventDefault();
					opener.focus();
				}}
			>
				<PanelBody {...props} inSheet />
			</SheetContent>
		</Sheet>
	);
}

/** The panel's contents. */
export function PanelBody({
	agent,
	agents,
	onOpen,
	onViewInGraph,
	onClose,
	inSheet = false,
}: PanelProps & { inSheet?: boolean }) {
	const history = sampleHistory(agent);
	// The sheet needs its title and description from the Dialog parts.
	const Title = inSheet ? SheetTitle : "h2";
	const Description = inSheet ? SheetDescription : "p";
	return (
		<div
			data-testid="catalog-agent-panel"
			data-agent={agent.slug}
			className="flex min-h-0 flex-1 flex-col"
		>
			<header className="flex items-start gap-3 border-b border-border p-4">
				<AgentTile agent={agent} size="lg" />
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<div className="flex items-center gap-2">
						<Title className="type-h2 truncate text-foreground">
							{agent.name}
						</Title>
						<Badge
							variant="tag"
							data-testid="catalog-agent-panel-version"
						>{`v${agent.version}`}</Badge>
					</div>
					<Description
						data-testid="catalog-agent-panel-subtitle"
						className="type-small text-text-muted"
					>
						{panelSubtitle(agent)}
					</Description>
				</div>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Close panel"
					data-testid="catalog-agent-panel-close"
					onClick={onClose}
				>
					<X aria-hidden="true" />
				</Button>
			</header>
			<Tabs
				defaultValue="overview"
				className="flex min-h-0 flex-1 flex-col gap-0"
			>
				<div className="border-b border-border px-4">
					<TabsList aria-label="Agent template">
						{PANEL_TABS.map((tab) => (
							<TabsTrigger
								key={tab.id}
								value={tab.id}
								data-testid={`catalog-agent-tab-${tab.id}`}
							>
								{tab.label}
							</TabsTrigger>
						))}
					</TabsList>
				</div>
				<div className="app-scroll min-h-0 flex-1 overflow-y-auto p-4">
					<TabsContent value="overview">
						<OverviewTab
							agent={agent}
							agents={agents}
							history={history}
							onOpen={onOpen}
						/>
					</TabsContent>
					<TabsContent value="identity">
						<IdentityTab agent={agent} history={history} />
					</TabsContent>
					<TabsContent value="manifest">
						<ManifestTab agent={agent} />
					</TabsContent>
					<TabsContent value="versions">
						<VersionsTab history={history} />
					</TabsContent>
				</div>
			</Tabs>
			<footer className="border-t border-border p-4">
				<Button
					variant="outline"
					className="w-full"
					data-testid="catalog-agent-view-in-graph"
					onClick={() => onViewInGraph(agent.slug)}
				>
					<Network aria-hidden="true" />
					View in graph
				</Button>
			</footer>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Overview.

type Tone = "better" | "worse" | "same";

const TONE_CLASS: Record<Tone, string> = {
	better: "text-gate-pass",
	worse: "text-gate-block",
	same: "text-text-subtle",
};

/** One metric card: its value and its change since the previous version. */
function Metric({
	label,
	value,
	change,
	"data-testid": testId,
}: {
	label: string;
	value: string;
	change: { text: string; tone: Tone } | null;
	"data-testid": string;
}) {
	return (
		<div
			data-testid={testId}
			className="flex flex-col gap-1 rounded-sm border border-border bg-app-raised p-3"
		>
			<span className="type-caption text-text-subtle">{label}</span>
			<span className="type-h2 text-foreground tabular-nums">{value}</span>
			<span
				data-testid={`${testId}-change`}
				className={cn(
					"type-mono-small tabular-nums",
					change ? TONE_CLASS[change.tone] : "text-text-subtle",
				)}
			>
				{change?.text ?? "first version"}
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
			what="Four measures on client runs of the current version, each against the previous version."
			data-testid="catalog-agent-metrics"
		>
			<p className="type-caption text-text-subtle">{`Client runs on v${version}`}</p>
			<div className="grid grid-cols-2 gap-2">
				<Metric
					label="First-pass gate rate"
					value={`${pct(current.firstPassGateRate)}%`}
					change={was((o) => pct(o.firstPassGateRate), false, " pts")}
					data-testid="catalog-agent-metric-gate"
				/>
				<Metric
					label="Tokens, actual of estimate"
					value={`${kTokens(current.tokensActual)} of ${kTokens(current.tokensEstimate)}`}
					change={was((o) => Math.round(o.tokensActual / 1000), true, "k")}
					data-testid="catalog-agent-metric-tokens"
				/>
				<Metric
					label="Boundary violations"
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
						? "No boundary violations and no runs halted at a ceiling."
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

function Edges({
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
			title="Edges"
			what="What this agent reads, from whom, and what it writes, to whom, each artifact with its hash."
			data-testid="catalog-agent-edges"
		>
			<h3 className="type-panel-title text-foreground">Edges</h3>
			{incoming.length === 0 && outgoing.length === 0 ? (
				<p className="type-small text-text-subtle">
					No other agent here writes what it reads, or reads what it writes.
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
			<Edges agent={agent} agents={agents} onOpen={onOpen} />
			<MeasuresRegion history={history} />
		</div>
	);
}

// ---------------------------------------------------------------------------
// Identity, manifest, versions.

type WithHistory = { agent: AgentTemplate; history: SampleAgentHistory };

export function IdentityTab({ agent, history }: WithHistory) {
	return (
		<SampleRegion
			missing={CATALOG_MISSING.versions}
			title="identity.md"
			what="The identity generated for the current version, read-only, and its size against the 800-token cap."
			data-testid="catalog-agent-identity"
		>
			<CodeView
				text={agent.identityMd}
				label={`${agent.name}'s identity.md`}
				data-testid="catalog-agent-identity-code"
				footer={`${history.identityTokens} / ${IDENTITY_TOKEN_CAP} tokens`}
			/>
		</SampleRegion>
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

export function ManifestTab({ agent }: { agent: AgentTemplate }) {
	return (
		<div className="flex flex-col gap-4">
			<SampleRegion
				missing={CATALOG_MISSING.templates}
				title="Manifest"
				what="The template's own fields: kind, roles, default waves, engagement scope, writable paths and version."
				data-testid="catalog-agent-manifest"
			>
				<div
					data-testid="catalog-agent-manifest-text"
					className="flex flex-col gap-0.5 rounded-xs border border-border bg-app-recessed p-3 type-mono-small"
				>
					<Line k="kind">{agent.kind}</Line>
					<Line k="roles">{`[${inCatalogOrder(agent.roles).join(", ")}]`}</Line>
					<Line k="waveDefaults">{`[${inWaveOrder(agent.waveDefaults).join(", ")}]`}</Line>
					<Line k="engagementId">
						{agent.engagementId ?? (
							<span className="text-text-muted"># shared identity</span>
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
			</SampleRegion>
			<ActionsRegion agent={agent} />
		</div>
	);
}

/** A hash's first eight characters, the full value on hover, and Copy. */
function ShortHash({
	value,
	label,
	"data-testid": testId,
}: {
	value: string;
	label: string;
	"data-testid": string;
}) {
	return (
		<span data-testid={testId} className="inline-flex items-center gap-1">
			<code
				title={value}
				data-full={value}
				className="type-mono-small text-accent-text"
			>
				<span aria-hidden="true">{value.slice(0, 8)}</span>
				<span className="sr-only">{value}</span>
			</code>
			<Button
				variant="ghost"
				size="icon-xs"
				aria-label={`Copy ${label}`}
				data-testid={`${testId}-copy`}
				onClick={() => navigator.clipboard?.writeText(value)}
			>
				<Copy aria-hidden="true" />
			</Button>
		</span>
	);
}

export function VersionsTab({ history }: { history: SampleAgentHistory }) {
	return (
		<SampleRegion
			missing={CATALOG_MISSING.versions}
			title="Versions"
			what="Every generated version, newest first, as a log: hash, version, date and the role change behind it."
			data-testid="catalog-agent-versions"
		>
			<ol aria-label="Versions" className="flex flex-col type-mono-small">
				{history.versions.map((version, i) => (
					<li
						key={version.version}
						data-testid="catalog-agent-version"
						className="flex flex-wrap items-center gap-x-3 py-1"
					>
						<ShortHash
							value={version.sha256}
							label={`the hash of version ${version.version}`}
							data-testid={`catalog-agent-version-hash-${version.version}`}
						/>
						<span className="text-foreground">{`v${version.version}`}</span>
						<span className="text-text-subtle">
							{version.createdAt.slice(0, 10)}
						</span>
						{i === 0 ? (
							<span
								data-testid="catalog-agent-version-current"
								className="text-accent-text"
							>
								(HEAD)
							</span>
						) : null}
						<span className="basis-full font-sans type-small text-text-muted">
							{version.change}
						</span>
					</li>
				))}
			</ol>
		</SampleRegion>
	);
}

function ActionsRegion({ agent }: { agent: AgentTemplate }) {
	const covered = new Set(familiesOf(agent.roles));
	const rows = SAMPLE_FAMILY_TABLE.filter((row) => covered.has(row.family));
	const columns: DataColumn<(typeof rows)[number]>[] = [
		{ id: "family", header: "Family", width: "6rem", cell: (r) => r.family },
		{ id: "read", header: "Read", cell: (r) => <Wrap>{r.read}</Wrap> },
		{ id: "act", header: "Act", cell: (r) => <Wrap>{r.act}</Wrap> },
		{ id: "propose", header: "Propose", cell: (r) => <Wrap>{r.propose}</Wrap> },
	];
	return (
		<SampleRegion
			missing={CATALOG_MISSING.families}
			title="Allowed actions"
			what="The rows of the per-family table for this agent's families: what it may read, act on and propose through AVEL's API."
			data-testid="catalog-agent-actions"
		>
			<h3 className="type-panel-title text-foreground">Allowed actions</h3>
			{rows.length === 0 ? (
				<p className="type-small text-text-subtle">
					Its roles are code, with no agent and no token.
				</p>
			) : (
				<DataTable
					label="What this agent's families may do through the API"
					data-testid="catalog-agent-actions-table"
					columns={columns}
					rows={rows}
					getRowId={(r) => r.family}
					density="compact"
					stickyHeader={false}
				/>
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

const DISCIPLINE_ROWS: DisciplineRow[] = [
	{ id: "runs", label: "Runs" },
	{ id: "boundaryViolations", label: "Boundary violations" },
	{ id: "blockersFiled", label: "Blockers filed" },
	{ id: "blockersAbsorbed", label: "Blockers absorbed" },
	{ id: "edgeHashMismatches", label: "Edge hash mismatches" },
	{ id: "testWritesCaught", label: "Test-file writes caught" },
];

function Discipline({ history }: { history: SampleAgentHistory }) {
	const byOrigin = (origin: SampleOrigin) =>
		history.discipline.find((row) => row.origin === origin);
	const columns: DataColumn<DisciplineRow>[] = [
		{ id: "measure", header: "Measure", cell: (row) => row.label },
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
				How the agent behaves, across every territory and engagement under its
				name, with client and internal runs in separate columns.
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
				How hard the work was. Each row is its own comparison: one territory on
				one template. Rows are never added together.
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
				Their version was backfilled from git history, not recorded at dispatch.
				Their findings stand; they are left out of every measure above.
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

export function MeasuresRegion({ history }: { history: SampleAgentHistory }) {
	return (
		<SampleRegion
			missing={CATALOG_MISSING.measures}
			title="Measures"
			what="Discipline across all of the agent's work, outcome within one territory and template, client and internal runs apart, and reconstructed runs set aside."
			data-testid="catalog-agent-measures"
		>
			<div className="flex flex-col gap-6">
				<Discipline history={history} />
				<Outcome history={history} />
				<Reconstructed history={history} />
			</div>
		</SampleRegion>
	);
}
