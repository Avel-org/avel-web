import { useNavigate } from "@tanstack/react-router";
import {
	type AgentRosterEntry,
	type AgentTemplate,
	WAVES,
} from "avel-server/contract";
import {
	Bot,
	Building2,
	FlaskConical,
	Hammer,
	type LucideIcon,
	MessageSquare,
	Package,
	Pause,
	Scale,
	SearchX,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
	useShownAccess,
	useTemplateAccess,
	useTemplateRosterEntries,
} from "@/lib/api/access";
import {
	isNotFound,
	loadedRows,
	useAgentTemplate,
	useAgentTemplates,
} from "@/lib/api/catalog";
import type { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { AgentTools } from "./agent-access";
import { AgentActivity } from "./agent-activity";
import {
	IdentityTab,
	ManifestTab,
	OverviewTab,
	VersionsTab,
} from "./catalog-agent-inspector";
import {
	type AgentSide,
	isFirmAgent,
	sideOf,
} from "./catalog-agent-placeholders";
import { familiesOf, sampleHistory } from "./catalog-placeholders";
import { EmptyState } from "./empty-state";
import {
	BANNER_BUTTON,
	BannerStat,
	BannerStatus,
	type BannerTab,
	BannerTile,
	EntityBanner,
	PinnedBanner,
} from "./entity-banner";
import { SectionPanel } from "./section-panel";
import { ErrorState, type ErrorStateProps, Surface } from "./surface";

/*
 * One agent template's page (ruling 38): the entity banner, then one tab at a
 * time. The agent's own fields and the banner's numbers are live. Its
 * measures and versions are labelled samples (ruling 32) until their routes
 * exist; memory is not built, and says which module builds it.
 */

/** Four tabs, related things together: activity sits on Overview, versions beside the measures that compare them. */
export const AGENT_TABS = [
	"overview",
	"tools",
	"performance",
	"memory",
] as const;

export type AgentTabId = (typeof AGENT_TABS)[number];

const TAB_LABEL: Record<AgentTabId, string> = {
	overview: "Overview",
	tools: "Tools and access",
	performance: "Performance",
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

/** "A and B", "A, B and C". */
function andList(items: readonly string[]): string {
	if (items.length <= 1) return items.join("");
	return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/**
 * When it works: "wave A", "waves B and C", in wave order. A firm agent never
 * joins a mission's waves (ruling 34); it works between missions.
 */
export function wavesLabel(
	agent: Pick<AgentTemplate, "roles" | "waveDefaults">,
): string | null {
	if (isFirmAgent(agent)) return "between missions";
	const waves = WAVES.filter((w) => agent.waveDefaults.includes(w));
	if (waves.length === 0) return null;
	return `${waves.length === 1 ? "wave" : "waves"} ${andList(waves)}`;
}

/** "Foundation agent · wave A · since September 2026 · v1". */
export function agentFacts(agent: AgentTemplate): string {
	const families = familiesOf(agent.roles);
	const kind = families.length > 0 ? families.join(" and ") : "Code";
	const waves = wavesLabel(agent);
	return [
		`${kind} agent`,
		...(waves ? [waves] : []),
		`since ${sinceLabel(agent.createdAt)}`,
		`v${agent.version}`,
	].join(" · ");
}

/** The tile's icon: what the agent does, by its side, or the firm's building. */
const SIDE_ICON: Record<AgentSide | "firm" | "mixed", LucideIcon> = {
	author: Hammer,
	tester: FlaskConical,
	judge: Scale,
	fixture: Package,
	firm: Building2,
	mixed: Bot,
};

export function agentIcon(agent: Pick<AgentTemplate, "roles">): LucideIcon {
	if (isFirmAgent(agent)) return SIDE_ICON.firm;
	return SIDE_ICON[sideOf(agent) ?? "mixed"];
}

/**
 * The page's keys: 1 to 4 open a tab, Escape goes back to All agents. Only
 * a bare key counts, and never while typing in a field or inside an open
 * dialog, menu or list, where those keys already mean something.
 */
export function agentPageKey(
	event: Pick<
		KeyboardEvent,
		"key" | "metaKey" | "ctrlKey" | "altKey" | "defaultPrevented"
	>,
	target: { tagName?: string; isContentEditable?: boolean } | null,
	layerOpen: boolean,
): AgentTabId | "back" | null {
	if (event.defaultPrevented || layerOpen) return null;
	if (event.metaKey || event.ctrlKey || event.altKey) return null;
	if (target?.isContentEditable) return null;
	if (/^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? "")) return null;
	if (event.key === "Escape") return "back";
	const n = Number(event.key);
	return Number.isInteger(n) ? (AGENT_TABS[n - 1] ?? null) : null;
}

/** An open dialog, menu, listbox or popover: Escape and digits are theirs. */
const OPEN_LAYER =
	'[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]';

function usePageKeys(onTab: (tab: AgentTabId) => void) {
	const navigate = useNavigate();
	// The latest handler, so the listener is added once, not on every render.
	const latest = useRef(onTab);
	latest.current = onTab;
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const target = event.target instanceof HTMLElement ? event.target : null;
			const action = agentPageKey(
				event,
				target,
				document.querySelector(OPEN_LAYER) !== null,
			);
			if (action === null) return;
			event.preventDefault();
			if (action === "back") navigate({ to: "/catalog/agents" });
			else latest.current(action);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [navigate]);
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
				description={`No agent is called “${slug}”. It may have been renamed or removed; choose one from All agents.`}
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

/**
 * Counts on the tabs, only where a live read supplies one: Tools and access
 * counts the rows of the access the tab shows. Overview, Performance (its
 * measures are samples) and Memory (not built) have none.
 */
function useTabs(
	agent: AgentTemplate,
	mission: string | undefined,
): BannerTab[] {
	const entries = useTemplateRosterEntries(agent.id);
	const entry =
		mission === undefined
			? undefined
			: entries.data?.find((e) => e.missionId === mission);
	const access = useShownAccess(agent.id, entry);
	const counts: Partial<Record<AgentTabId, number>> = {
		tools: access.status === "success" ? access.data.rows.length : undefined,
	};
	return AGENT_TABS.map((id, i) => ({
		id,
		label: TAB_LABEL[id],
		count: counts[id],
		shortcut: String(i + 1),
	}));
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
	const tabs = useTabs(agent, mission);
	const icon = agentIcon(agent);
	const banner = useRef<HTMLElement>(null);
	usePageKeys(onTab);
	return (
		<Tabs
			value={tab}
			onValueChange={(next) => onTab(next as AgentTabId)}
			data-testid="agent-detail"
			data-agent={agent.slug}
			// Tab panels shrink to the canvas; a wide table scrolls inside its own frame.
			className="min-w-0 gap-6 [&>*]:min-w-0"
		>
			{/* Zero height, so its -mb-6 takes back the gap the column gives it. */}
			<PinnedBanner
				data-testid="agent-pinned"
				className="-mb-6"
				watch={banner}
				icon={icon}
				name={agent.name}
				tabs={tabs}
				value={tab}
				onSelect={(next) => onTab(next as AgentTabId)}
			/>
			<EntityBanner
				ref={banner}
				data-testid="agent-banner"
				back={{ label: "All agents", to: "/catalog/agents" }}
				tile={<BannerTile icon={icon} data-testid="agent-banner-tile" />}
				status={<AgentStatus agent={agent} />}
				name={agent.name}
				facts={agentFacts(agent)}
				stats={<AgentStats agent={agent} />}
				actions={<AgentActions agent={agent} />}
				tabs={tabs}
				tabsLabel={`${agent.name}'s page`}
			/>
			<TabsContent value="overview">
				{/* Panels take their own height: a short manifest never stretches
				    beside a long identity. */}
				<div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
					<div className="flex min-w-0 flex-col gap-6">
						<SectionPanel
							title="Identity"
							description="Generated from its roles. Change a role to change it."
							data-testid="agent-identity-panel"
						>
							<IdentityTab agent={agent} history={history} />
						</SectionPanel>
						<AgentActivity agent={agent} />
					</div>
					<SectionPanel
						title="Manifest"
						description="The agent's own fields."
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
				<div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
					<SectionPanel
						title="Performance"
						description="Client runs of the current version, against the previous one."
						data-testid="agent-performance-panel"
					>
						<PerformanceBody agent={agent} />
					</SectionPanel>
					<SectionPanel
						title="Versions"
						description="Every identity this agent has had. None is ever deleted."
						data-testid="agent-versions-panel"
					>
						<VersionsTab history={history} />
					</SectionPanel>
				</div>
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
	const navigate = useNavigate();
	const agents = all.data ? loadedRows(all.data) : [];
	return (
		<OverviewTab
			agent={agent}
			agents={agents}
			history={sampleHistory(agent)}
			onOpen={(slug) =>
				navigate({ to: "/catalog/agents/$slug", params: { slug } })
			}
		/>
	);
}

/**
 * The banner's numbers, all live: the missions the agent is on and how many
 * are running, from its roster entries; its tools, from its own access; and
 * its roles. Nothing shows until both reads answer, so no number is a guess.
 * Missions opens the missions list (it has no filter by agent yet); tools
 * opens the Tools and access tab.
 */
function AgentStats({ agent }: { agent: AgentTemplate }) {
	const entries = useTemplateRosterEntries(agent.id);
	const access = useTemplateAccess(agent.id);
	if (entries.status !== "success" || access.status !== "success") return null;
	const missions = new Map(
		entries.data.map((e) => [e.missionId, e.mission.status] as const),
	);
	const running = [...missions.values()].filter((s) => s === "active").length;
	const tools = access.data.rows.filter((r) => r.kind === "grant").length;
	return (
		<>
			<BannerStat
				data-testid="agent-stat-missions"
				value={String(missions.size)}
				label={missions.size === 1 ? "mission" : "missions"}
				link={{ to: "/missions" }}
			/>
			<BannerStat
				data-testid="agent-stat-running"
				value={String(running)}
				label="running now"
			/>
			<BannerStat
				data-testid="agent-stat-tools"
				value={String(tools)}
				label={tools === 1 ? "tool" : "tools"}
				link={{
					to: "/catalog/agents/$slug",
					params: { slug: agent.slug },
					search: { tab: "tools" },
				}}
			/>
			<BannerStat
				data-testid="agent-stat-roles"
				value={String(agent.roles.length)}
				label={agent.roles.length === 1 ? "role" : "roles"}
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
 * Where the agent stands, as a state word: Working while any mission it is
 * on is active, Idle while it is on missions but none is running, and not on
 * a mission otherwise. The counts are the banner's numbers, not the pill's.
 */
export function agentStanding(
	statuses: readonly AgentRosterEntry["mission"]["status"][],
): { label: string; live: boolean } {
	if (statuses.some((s) => s === "active"))
		return { label: "Working", live: true };
	if (statuses.length === 0) return { label: "Not on a mission", live: false };
	return { label: "Idle", live: false };
}

/** Nothing shows until the read answers, so the pill never claims a state it hasn't been told. */
function AgentStatus({ agent }: { agent: AgentTemplate }) {
	const entries = useTemplateRosterEntries(agent.id);
	if (entries.status !== "success") return null;
	const standing = agentStanding(entries.data.map((e) => e.mission.status));
	return (
		<BannerStatus
			data-testid="agent-banner-status"
			label={standing.label}
			live={standing.live}
		/>
	);
}
