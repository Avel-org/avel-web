import type { AgentRosterEntry, AgentTemplate } from "avel-server/contract";
import { History, MessageSquare, Pause, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useTemplateRosterEntries } from "@/lib/api/access";
import {
	isNotFound,
	loadedRows,
	useAgentTemplate,
	useAgentTemplates,
} from "@/lib/api/catalog";
import type { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { AgentTools } from "./agent-access";
import {
	IdentityTab,
	ManifestTab,
	OverviewTab,
	VersionsTab,
} from "./catalog-agent-inspector";
import { kTokens, sampleOverview } from "./catalog-agent-placeholders";
import { initialsOf } from "./catalog-agent-table";
import {
	CATALOG_MISSING,
	familiesOf,
	sampleHistory,
} from "./catalog-placeholders";
import { EmptyState } from "./empty-state";
import {
	BANNER_BUTTON,
	BannerStat,
	BannerStatus,
	type BannerTab,
	BannerTile,
	EntityBanner,
} from "./entity-banner";
import { SampleData } from "./sample-data";
import { SectionPanel } from "./section-panel";
import { ErrorState, type ErrorStateProps, Surface } from "./surface";

/*
 * One agent template's page (ruling 38): the entity banner, then one tab at a
 * time. The template's own fields are live. Its numbers, measures and
 * versions are the catalog's labelled samples (ruling 32) until their routes
 * exist; activity and memory are not built, and say which module builds them.
 */

export const AGENT_TABS = [
	"overview",
	"tools",
	"performance",
	"versions",
	"activity",
	"memory",
] as const;

export type AgentTabId = (typeof AGENT_TABS)[number];

const TAB_LABEL: Record<AgentTabId, string> = {
	overview: "Overview",
	tools: "Tools and access",
	performance: "Performance",
	versions: "Versions",
	activity: "Activity",
	memory: "Memory",
};

/** "March 2026", in the operator's locale-free month names. */
const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
] as const;

export function sinceLabel(iso: string): string {
	const date = new Date(iso);
	return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "Schema and Contract agent · since March 2026 · v3". */
export function agentFacts(agent: AgentTemplate): string {
	const families = familiesOf(agent.roles);
	const kind = families.length > 0 ? families.join(" and ") : "Code";
	return [
		`${kind} agent`,
		`since ${sinceLabel(agent.createdAt)}`,
		`v${agent.version}`,
	].join(" · ");
}

export function AgentDetail({
	slug,
	tab,
	mission,
	onTab,
	onMission,
}: {
	slug: string;
	tab: AgentTabId;
	/** The mission the Tools tab reads access on, from the URL. */
	mission: string | undefined;
	onTab: (tab: AgentTabId) => void;
	onMission: (mission: string | undefined) => void;
}) {
	const query = useAgentTemplate(slug);
	const failed = ({ error, retry, retrying }: ErrorStateProps<ApiError>) =>
		isNotFound(error) ? (
			<EmptyState
				data-testid="agent-detail-not-found"
				icon={SearchX}
				title="No agent with this name"
				description={`No live template is called “${slug}”. It may have been renamed or removed; choose one from All agents.`}
			/>
		) : (
			<ErrorState error={error} retry={retry} retrying={retrying} />
		);
	return (
		<Surface
			data-testid="agent-detail-surface"
			query={query}
			// One template is never empty: a missing one answers NOT_FOUND.
			isEmpty={() => false}
			loading={
				<div
					data-testid="agent-detail-skeleton"
					className="flex flex-col gap-6"
				>
					<Skeleton className="h-48 w-full rounded-md" />
					<Skeleton className="h-64 w-full rounded-md" />
				</div>
			}
			empty={null}
			error={failed}
		>
			{(agent) => (
				<AgentPage
					agent={agent}
					tab={tab}
					mission={mission}
					onTab={onTab}
					onMission={onMission}
				/>
			)}
		</Surface>
	);
}

function AgentPage({
	agent,
	tab,
	mission,
	onTab,
	onMission,
}: {
	agent: AgentTemplate;
	tab: AgentTabId;
	mission: string | undefined;
	onTab: (tab: AgentTabId) => void;
	onMission: (mission: string | undefined) => void;
}) {
	const history = sampleHistory(agent);
	// No counts yet: a count shows only where a route supplies it, and the
	// versions behind this tab are samples.
	const tabs: BannerTab[] = AGENT_TABS.map((id) => ({
		id,
		label: TAB_LABEL[id],
	}));
	return (
		<Tabs
			value={tab}
			onValueChange={(next) => onTab(next as AgentTabId)}
			data-testid="agent-detail"
			data-agent={agent.slug}
			// Tab panels shrink to the canvas; a wide table scrolls inside its own frame.
			className="min-w-0 gap-6 [&>*]:min-w-0"
		>
			<EntityBanner
				data-testid="agent-banner"
				back={{ label: "All agents", to: "/catalog/agents" }}
				tile={
					<BannerTile
						initials={initialsOf(agent.name)}
						data-testid="agent-banner-tile"
					/>
				}
				status={<AgentStatus agent={agent} />}
				name={agent.name}
				facts={agentFacts(agent)}
				stats={<AgentStats agent={agent} />}
				actions={<AgentActions agent={agent} />}
				tabs={tabs}
				tabsLabel={`${agent.name}'s page`}
			/>
			<TabsContent value="overview">
				<div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
					<SectionPanel
						title="Identity"
						description="Generated from its roles. Change a role to change it."
						data-testid="agent-identity-panel"
					>
						<IdentityTab agent={agent} history={history} />
					</SectionPanel>
					<SectionPanel
						title="Manifest"
						description="The template's own fields."
						data-testid="agent-manifest-panel"
					>
						<ManifestTab agent={agent} />
					</SectionPanel>
				</div>
			</TabsContent>
			<TabsContent value="tools">
				<AgentTools agent={agent} mission={mission} onMission={onMission} />
			</TabsContent>
			<TabsContent value="performance">
				<SectionPanel
					title="Performance"
					description="Client runs of the current version, against the previous one."
					data-testid="agent-performance-panel"
				>
					<PerformanceBody agent={agent} />
				</SectionPanel>
			</TabsContent>
			<TabsContent value="versions">
				<SectionPanel
					title="Versions"
					description="Every identity this template has had. None is ever deleted."
					data-testid="agent-versions-panel"
				>
					<VersionsTab history={history} />
				</SectionPanel>
			</TabsContent>
			<TabsContent value="activity">
				<Surface
					data-testid="agent-activity"
					notBuilt={{
						title: `What ${agent.name} did`,
						what: "Agents write activity once dispatch runs them. The log then filters by the roster entries made from this template.",
						needs: ["GET /api/activity by actor (module 6)"],
						icon: History,
					}}
				/>
			</TabsContent>
			<TabsContent value="memory">
				<Surface
					data-testid="agent-memory"
					notBuilt={{
						title: `What ${agent.name} remembers`,
						what: "Knowledge this agent keeps between missions. Write-back waits until about ten missions have run.",
						needs: ["knowledge entries by agent (module 12)"],
					}}
				/>
			</TabsContent>
		</Tabs>
	);
}

/** The edges name agents at the other end, so this tab reads every template. */
function PerformanceBody({ agent }: { agent: AgentTemplate }) {
	const all = useAgentTemplates();
	const agents = all.data ? loadedRows(all.data) : [];
	return (
		<OverviewTab
			agent={agent}
			agents={agents}
			history={sampleHistory(agent)}
			onOpen={() => {}}
		/>
	);
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** The banner's numbers: the catalog's samples, behind their pill. */
function AgentStats({ agent }: { agent: AgentTemplate }) {
	const { current } = sampleOverview(agent);
	return (
		<>
			<BannerStat
				data-testid="agent-stat-gate"
				value={pct(current.firstPassGateRate)}
				label="first-pass gates"
			/>
			<BannerStat
				data-testid="agent-stat-tokens"
				value={`${kTokens(current.tokensActual)} / ${kTokens(current.tokensEstimate)}`}
				label="tokens of estimate"
			/>
			<BannerStat
				data-testid="agent-stat-blockers"
				value={String(current.blockersFiled)}
				label="blockers filed"
			/>
			<BannerStat
				data-testid="agent-stat-violations"
				value={String(current.boundaryViolations)}
				label="boundary violations"
			/>
			<SampleData
				missing={CATALOG_MISSING.measures}
				className="border-banner-line text-banner-muted"
			/>
		</>
	);
}

/** Ask and Pause, real controls with their reasons until their modules land. */
function AgentActions({ agent }: { agent: AgentTemplate }) {
	return (
		<>
			<Button
				size="sm"
				className={cn(BANNER_BUTTON)}
				data-testid="agent-ask"
				disabledReason="Talking to an agent comes with Canon's chat, module 14."
			>
				<MessageSquare aria-hidden="true" />
				{`Ask ${agent.name}`}
			</Button>
			<Button
				size="sm"
				className={cn(BANNER_BUTTON)}
				data-testid="agent-pause"
				disabledReason="An agent pauses when its dispatch halts, which comes with the runner in module 6."
			>
				<Pause aria-hidden="true" />
				Pause
			</Button>
		</>
	);
}

/**
 * Where the agent stands, from its live roster entries: working while any
 * mission it is on is active. Nothing shows until the read answers, so the
 * pill never claims a state it hasn't been told.
 */
export function agentStanding(
	statuses: readonly AgentRosterEntry["mission"]["status"][],
): { label: string; live: boolean } {
	const missions = statuses.length;
	const active = statuses.filter((s) => s === "active").length;
	if (active > 0)
		return {
			label:
				active === 1 ? "Active on 1 mission" : `Active on ${active} missions`,
			live: true,
		};
	if (missions === 0) return { label: "Not on a mission", live: false };
	return {
		label: missions === 1 ? "On 1 mission" : `On ${missions} missions`,
		live: false,
	};
}

function AgentStatus({ agent }: { agent: AgentTemplate }) {
	const entries = useTemplateRosterEntries(agent.id);
	if (entries.status !== "success") return null;
	// One mission can hold several entries, one per territory.
	const byMission = new Map(
		entries.data.map((e) => [e.missionId, e.mission.status] as const),
	);
	const standing = agentStanding([...byMission.values()]);
	return (
		<BannerStatus
			data-testid="agent-banner-status"
			label={standing.label}
			live={standing.live}
		/>
	);
}
