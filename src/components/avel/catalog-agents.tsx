import { Link } from "@tanstack/react-router";
import type { AgentTemplate, SkillListItem } from "avel-server/contract";
import { Bot, MousePointerClick } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
	CATALOG_MISSING,
	familiesOf,
	IDENTITY_TOKEN_CAP,
	SAMPLE_AGENTS,
	SAMPLE_FAMILY_TABLE,
	type SampleAgentHistory,
	type SampleDiscipline,
	type SampleFamilyRow,
	type SampleOrigin,
	type SampleOutcome,
	sampleAgent,
	sampleHistory,
	skillsOfAgent,
} from "./catalog-placeholders";
import {
	CatalogBack,
	CatalogField,
	CatalogListSkeleton,
	type CatalogQuery,
	inCatalogOrder,
	inWaveOrder,
	RoleTag,
	SampleHash,
	SampleRegion,
	SkillKind,
	SkillLink,
	SkillStatusPill,
	sampleQuery,
	Wrap,
} from "./catalog-sample";
import { type DataColumn, DataTable } from "./data-table";
import { EmptyState } from "./empty-state";
import { SectionPanel } from "./section-panel";
import { StatusPill } from "./status-pill";
import { ErrorState, Surface } from "./surface";

/*
 * Agent templates, /catalog/agents (ROUTES.md). Read-only, with no identity
 * editor: an identity is generated from the roles an agent covers, so it
 * changes only when a role does. Until module 4's routes land, every value
 * here is a labelled sample from catalog-placeholders.ts (AVEL-DESIGN.md
 * ruling 32), in the layout the real data will use.
 */

/** The list on the left, the selected template on the right. */
export function CatalogAgents({
	selected,
	query = sampleQuery(SAMPLE_AGENTS),
}: {
	selected: string | undefined;
	query?: CatalogQuery<AgentTemplate>;
}) {
	const agent = selected ? sampleAgent(selected) : undefined;
	return (
		<div data-testid="catalog-agents" className="flex min-h-0 flex-1 gap-6">
			<div
				data-testid="catalog-agents-list-pane"
				className={cn(
					"flex w-full flex-col gap-3 lg:w-72 lg:shrink-0",
					// Below lg a selection replaces the list: two panes need the width.
					agent && "max-lg:hidden",
				)}
			>
				<AgentList selected={agent?.slug} query={query} />
				<p
					data-testid="catalog-agents-read-only"
					className="px-1 type-caption text-text-subtle"
				>
					Identities are generated from roles, so nothing here is edited by
					hand. To change an agent, change a role it covers.
				</p>
			</div>
			<div
				data-testid="catalog-agents-detail-pane"
				className={cn(
					"flex min-w-0 flex-1 flex-col gap-4 lg:border-l lg:border-border lg:pl-6",
					!agent && "max-lg:hidden",
				)}
			>
				{agent ? (
					<>
						<CatalogBack
							to="/catalog/agents"
							label="Back to agent templates"
							data-testid="catalog-agents-back"
						/>
						<AgentDetail key={agent.slug} agent={agent} />
					</>
				) : (
					<EmptyState
						data-testid="catalog-agents-choose"
						icon={MousePointerClick}
						title="Choose an agent template"
						description="Choose one to see its roles, its generated identity with every earlier version, the skills it carries and how it has measured."
					/>
				)}
			</div>
		</div>
	);
}

function AgentList({
	selected,
	query,
}: {
	selected: string | undefined;
	query: CatalogQuery<AgentTemplate>;
}) {
	return (
		<SampleRegion
			missing={CATALOG_MISSING.templates}
			title="Agent templates"
			what="Every agent template, with its kind and the roles it covers."
			data-testid="catalog-agents-list"
		>
			<Surface
				data-testid="catalog-agents-surface"
				query={query}
				loading={<CatalogListSkeleton data-testid="catalog-agents-skeleton" />}
				empty={
					<EmptyState
						data-testid="catalog-agents-empty"
						compact
						icon={Bot}
						title="No agent templates yet"
						description="A template is an agent as data: the roles it covers, its generated identity and its default waves. Each one is listed here."
					/>
				}
				error={ErrorState}
			>
				{(agents) => (
					<ul aria-label="Agent templates" className="flex flex-col gap-0.5">
						{agents.map((agent) => {
							const isSelected = agent.slug === selected;
							return (
								<li key={agent.id}>
									<Link
										to="/catalog/agents"
										search={{ agent: agent.slug }}
										data-testid={`catalog-agent-row-${agent.slug}`}
										data-selected={isSelected || undefined}
										className={cn(
											"focus-inset relative flex flex-col gap-1 rounded-sm px-3 py-2 transition-colors duration-(--duration-micro) ease-avel hover:bg-state-hover",
											isSelected &&
												"bg-state-selected before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-accent hover:bg-state-selected",
										)}
									>
										<span className="flex items-center gap-2">
											<span className="type-body min-w-0 flex-1 truncate font-medium text-foreground">
												{agent.name}
											</span>
											<Badge variant="tag">{agent.kind}</Badge>
										</span>
										<span
											data-testid="catalog-agent-row-roles"
											title={inCatalogOrder(agent.roles).join(", ")}
											className="type-mono-small truncate text-text-muted"
										>
											{inCatalogOrder(agent.roles).join(", ")}
										</span>
									</Link>
								</li>
							);
						})}
					</ul>
				)}
			</Surface>
		</SampleRegion>
	);
}

/** One template: roles, identity, versions, skills, families, measures. */
/** A template and its sample history, which has no contract shape yet. */
type Detail = { agent: AgentTemplate; history: SampleAgentHistory };

export function AgentDetail({ agent }: { agent: AgentTemplate }) {
	const history = sampleHistory(agent);
	return (
		<div
			data-testid="catalog-agent-detail"
			data-agent={agent.slug}
			className="flex flex-col gap-4 pb-6"
		>
			<Roles agent={agent} />
			<Identity agent={agent} history={history} />
			<Versions history={history} />
			<Skills agent={agent} />
			<Families agent={agent} />
			<Measures history={history} />
		</div>
	);
}

function Roles({ agent }: { agent: AgentTemplate }) {
	return (
		<SectionPanel title="Roles" data-testid="catalog-agent-roles">
			<SampleRegion
				missing={CATALOG_MISSING.templates}
				title="Roles"
				what="The template's name, kind, default waves and the roles it covers."
				data-testid="catalog-agent-roles-sample"
			>
				<p className="type-h2 text-foreground">{agent.name}</p>
				<dl className="flex flex-wrap gap-x-6 gap-y-2">
					<CatalogField label="Kind">
						<span className="type-mono-small">{agent.kind}</span>
					</CatalogField>
					<CatalogField label="Default waves">
						<span className="type-mono-small">
							{inWaveOrder(agent.waveDefaults).join(", ")}
						</span>
					</CatalogField>
					<CatalogField label="Families">
						{familiesOf(agent.roles).join(", ")}
					</CatalogField>
				</dl>
				<ul aria-label="Roles" className="flex flex-wrap gap-1.5">
					{inCatalogOrder(agent.roles).map((role) => (
						<li key={role}>
							<RoleTag role={role} />
						</li>
					))}
				</ul>
			</SampleRegion>
		</SectionPanel>
	);
}

function Identity({ agent, history }: Detail) {
	const current = history.versions[0];
	return (
		<SectionPanel
			title="Generated identity"
			description="Read-only. Generated from the roles above."
			data-testid="catalog-agent-identity"
		>
			<SampleRegion
				missing={CATALOG_MISSING.versions}
				title="Generated identity"
				what="The identity file generated for the current version, its hash and its size against the 800-token cap."
				data-testid="catalog-agent-identity-sample"
			>
				<dl className="flex flex-wrap gap-x-6 gap-y-2">
					{current ? (
						<>
							<CatalogField label="Version">
								<span className="type-mono-small">{`v${current.version}`}</span>
							</CatalogField>
							<CatalogField label="Hash">
								<SampleHash
									value={current.sha256}
									label="the current identity hash"
									data-testid="catalog-agent-identity-hash"
								/>
							</CatalogField>
						</>
					) : null}
					<CatalogField label="Size">
						<span className="type-mono-small">
							{`${history.identityTokens} of ${IDENTITY_TOKEN_CAP} tokens`}
						</span>
					</CatalogField>
				</dl>
				<pre
					data-testid="catalog-agent-identity-text"
					className="app-scroll max-h-72 overflow-auto rounded-xs border border-border bg-app-recessed p-3 type-mono-small whitespace-pre-wrap text-text-muted"
				>
					{agent.identityMd}
				</pre>
			</SampleRegion>
		</SectionPanel>
	);
}

function Versions({ history }: Pick<Detail, "history">) {
	return (
		<SectionPanel
			title="Version history"
			description="A new version is generated whenever a role it covers changes. Every version is kept."
			data-testid="catalog-agent-versions"
		>
			<SampleRegion
				missing={CATALOG_MISSING.versions}
				title="Version history"
				what="Every generated version, newest first, with its hash and the role change that produced it."
				data-testid="catalog-agent-versions-sample"
			>
				<ol
					aria-label="Versions"
					className="flex flex-col divide-y divide-border"
				>
					{history.versions.map((version, i) => (
						<li
							key={version.version}
							data-testid="catalog-agent-version"
							className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
						>
							<span className="type-mono-small w-8 text-foreground">{`v${version.version}`}</span>
							<SampleHash
								value={version.sha256}
								label={`the hash of version ${version.version}`}
								data-testid={`catalog-agent-version-hash-${version.version}`}
							/>
							<span className="type-small min-w-0 flex-1 text-text-muted">
								{version.change}
							</span>
							<span className="type-mono-small text-text-subtle">
								{version.createdAt.slice(0, 10)}
							</span>
							{i === 0 ? (
								<Badge
									variant="tag"
									data-testid="catalog-agent-version-current"
								>
									current
								</Badge>
							) : null}
						</li>
					))}
				</ol>
			</SampleRegion>
		</SectionPanel>
	);
}

function SkillRows({
	skills,
	label,
	none,
}: {
	skills: SkillListItem[];
	label: string;
	none: string;
}) {
	if (skills.length === 0) {
		return <p className="type-small text-text-subtle">{none}</p>;
	}
	return (
		<ul aria-label={label} className="flex flex-col gap-1.5">
			{skills.map((skill) => (
				<li key={skill.id} className="flex flex-wrap items-center gap-2">
					<SkillLink skill={skill} />
					<SkillKind skill={skill} />
					<SkillStatusPill status={skill.status} />
				</li>
			))}
		</ul>
	);
}

function Skills({ agent }: { agent: AgentTemplate }) {
	const { role, dispatch } = skillsOfAgent(agent);
	return (
		<SectionPanel title="Skills" data-testid="catalog-agent-skills">
			<SampleRegion
				missing={CATALOG_MISSING.skills}
				title="Skills"
				what="The skills this agent carries through its roles: role skills in its identity, and stack and domain skills given at dispatch."
				data-testid="catalog-agent-skills-sample"
			>
				<div className="flex flex-col gap-4 md:flex-row">
					<div
						data-testid="catalog-agent-role-skills"
						className="flex min-w-0 flex-1 flex-col gap-2"
					>
						<h3 className="type-caption text-text-subtle">
							Role skills, part of its identity
						</h3>
						<SkillRows
							skills={role}
							label="Role skills"
							none="No role skills for these roles."
						/>
					</div>
					<div
						data-testid="catalog-agent-dispatch-skills"
						className="flex min-w-0 flex-1 flex-col gap-2"
					>
						<h3 className="type-caption text-text-subtle">
							Stack and domain skills, given at dispatch
						</h3>
						<SkillRows
							skills={dispatch}
							label="Stack and domain skills"
							none="No stack or domain skills are recommended for these roles."
						/>
					</div>
				</div>
			</SampleRegion>
		</SectionPanel>
	);
}

function Families({ agent }: { agent: AgentTemplate }) {
	const covered = new Set(familiesOf(agent.roles));
	const columns: DataColumn<SampleFamilyRow>[] = [
		{
			id: "family",
			header: "Family",
			width: "9rem",
			cell: (row) => (
				<span className="flex flex-wrap items-center gap-1.5">
					<span className="font-medium text-foreground">{row.family}</span>
					{covered.has(row.family) ? (
						<Badge
							variant="tag"
							data-testid={`catalog-family-covered-${row.family}`}
						>
							this agent
						</Badge>
					) : null}
				</span>
			),
		},
		{ id: "read", header: "Read", cell: (row) => <Wrap>{row.read}</Wrap> },
		{ id: "act", header: "Act", cell: (row) => <Wrap>{row.act}</Wrap> },
		{
			id: "propose",
			header: "Propose",
			cell: (row) => <Wrap>{row.propose}</Wrap>,
		},
	];
	return (
		<SectionPanel
			title="What its families may do"
			description="Through AVEL's API, by family: read, act, propose."
			data-testid="catalog-agent-families"
		>
			<SampleRegion
				missing={CATALOG_MISSING.families}
				title="What each family may do"
				what="The server's per-family table of what an agent may read, act on and propose, with this agent's families marked."
				data-testid="catalog-agent-families-sample"
			>
				<DataTable
					label="What each family may do through the API"
					data-testid="catalog-families-table"
					columns={columns}
					rows={[...SAMPLE_FAMILY_TABLE]}
					getRowId={(row) => row.family}
					density="compact"
					stickyHeader={false}
				/>
			</SampleRegion>
		</SectionPanel>
	);
}

// ---------------------------------------------------------------------------
// Measures. Discipline and outcome are kept apart, and so are client and
// internal runs: nothing on this panel adds one to the other.

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

function Discipline({ history }: Pick<Detail, "history">) {
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
				width: "7rem",
				cell: (row) => byOrigin(origin)?.[row.id] ?? "—",
			}),
		),
	];
	return (
		<div
			data-testid="catalog-agent-discipline"
			className="flex min-w-0 flex-1 flex-col gap-2"
		>
			<h3 className="type-panel-title text-foreground">Discipline</h3>
			<p className="type-caption text-text-subtle">
				How the agent behaves. Combines across every territory and engagement
				under its name, with client and internal runs kept in separate columns.
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
		// The engagement rides under the territory, so the numbers keep their room.
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
		cell: (row) => row.missionTemplate,
	},
	{
		id: "runs",
		header: "Runs",
		align: "end",
		mono: true,
		cell: (row) => row.runs,
	},
	{
		id: "tokens",
		header: <Wrap>Tokens per run</Wrap>,
		align: "end",
		mono: true,
		cell: (row) => row.tokensPerRun.toLocaleString("en-US"),
	},
	{
		id: "cost",
		header: <Wrap>Cost per run</Wrap>,
		align: "end",
		mono: true,
		cell: (row) => usd(row.costPerRunUsd),
	},
	{
		id: "gate",
		header: <Wrap>First-pass gate rate</Wrap>,
		align: "end",
		mono: true,
		cell: (row) => percent(row.firstPassGateRate),
	},
];

function Outcome({ history }: Pick<Detail, "history">) {
	return (
		<div
			data-testid="catalog-agent-outcome"
			className="flex min-w-0 flex-col gap-2"
		>
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

function Reconstructed({ history }: Pick<Detail, "history">) {
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

function Measures({ history }: Pick<Detail, "history">) {
	return (
		<SectionPanel
			title="Measures"
			description="Discipline and outcome are measured differently and never combined."
			data-testid="catalog-agent-measures"
		>
			<SampleRegion
				missing={CATALOG_MISSING.measures}
				title="Measures"
				what="Discipline across all of the agent's work, outcome within one territory and template, client and internal runs apart, and reconstructed runs set aside."
				data-testid="catalog-agent-measures-sample"
			>
				<div className="flex flex-col gap-6">
					<Discipline history={history} />
					<Outcome history={history} />
					<Reconstructed history={history} />
				</div>
			</SampleRegion>
		</SectionPanel>
	);
}
