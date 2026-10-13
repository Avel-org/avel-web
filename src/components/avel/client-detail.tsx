import { Link } from "@tanstack/react-router";
import type { Client } from "avel-server/contract";
import {
	ArrowLeft,
	Building2,
	Pencil,
	Plus,
	Power,
	RotateCcw,
	SearchX,
} from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import type { ApiError } from "@/lib/api";
import { isNotFound } from "@/lib/api/catalog";
import {
	CLIENT_TABS,
	type ClientTabId,
	clientFacts,
	isoDate,
	relativeTime,
	useClient,
	useClientMissions,
} from "@/lib/api/clients";
import { cn } from "@/lib/utils";
import { ClientActivity } from "./client-activity";
import { ClientFilesDrive, ClientNotesDrive } from "./client-drive";
import { ClientMissions } from "./client-missions";
import type { ClientActions } from "./client-overlays";
import { EmptyState } from "./empty-state";
import { EngagementBoard } from "./engagement-board";
import { EngagementList } from "./engagement-list";
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
 * One client's page (ruling 45): the entity banner, then one tab at a time.
 * Everything on it is live from the contract: the client, its engagements,
 * its missions (missions.list by clientId) and the log. Its Drive tab is
 * ruling 33's samples until the Drive's routes exist.
 */

const TAB_LABEL: Record<ClientTabId, string> = {
	overview: "Overview",
	engagements: "Engagements",
	drive: "Drive",
	activity: "Activity",
};

export function ClientDetail({
	clientId,
	tab,
	activeOnly,
	onTab,
	onActiveOnlyChange,
	actions,
	now,
}: {
	clientId: string;
	tab: ClientTabId;
	activeOnly: boolean;
	onTab: (tab: ClientTabId) => void;
	onActiveOnlyChange: (activeOnly: boolean) => void;
	actions: ClientActions;
	now: number;
}) {
	const query = useClient(clientId);
	return (
		<Surface
			data-testid="client-detail-surface"
			query={query}
			// A client is one record: it is either there or an error.
			isEmpty={() => false}
			loading={<ClientPageSkeleton />}
			empty={null}
			error={DetailError}
		>
			{(client) => (
				<ClientPage
					client={client}
					tab={tab}
					activeOnly={activeOnly}
					onTab={onTab}
					onActiveOnlyChange={onActiveOnlyChange}
					actions={actions}
					now={now}
				/>
			)}
		</Surface>
	);
}

/** A client that is gone says so, with the way back; anything else is the error map's. */
function DetailError(props: ErrorStateProps<ApiError>) {
	return (
		<div data-testid="client-detail-error" className="flex flex-col gap-3">
			{isNotFound(props.error) ? (
				<EmptyState
					data-testid="client-not-found"
					icon={SearchX}
					title="No such client"
					description="This client could not be found. Choose one from All clients."
				/>
			) : (
				<ErrorState {...props} />
			)}
			<Button variant="outline" size="sm" className="self-start" asChild>
				<Link to="/clients" data-testid="client-back">
					<ArrowLeft aria-hidden="true" />
					All clients
				</Link>
			</Button>
		</div>
	);
}

function ClientPage({
	client,
	tab,
	activeOnly,
	onTab,
	onActiveOnlyChange,
	actions,
	now,
}: {
	client: Client;
	tab: ClientTabId;
	activeOnly: boolean;
	onTab: (tab: ClientTabId) => void;
	onActiveOnlyChange: (activeOnly: boolean) => void;
	actions: ClientActions;
	now: number;
}) {
	const closed = client.status === "closed";
	// Engagements carries the client's own count; the others have no route
	// that counts them, so they carry none.
	const tabs: BannerTab[] = CLIENT_TABS.map((id) => ({
		id,
		label: TAB_LABEL[id],
		...(id === "engagements" ? { count: client.engagementCount } : {}),
	}));
	const banner = useRef<HTMLElement>(null);
	// One read for the Missions panel, its status strip and the banner's count.
	const missions = useClientMissions(client.id);
	return (
		<Tabs
			value={tab}
			onValueChange={(next) => onTab(next as ClientTabId)}
			data-testid="client-detail"
			data-client={client.id}
			className="min-w-0 gap-6 [&>*]:min-w-0"
		>
			{/* Zero height, so its -mb-6 takes back the gap the column gives it. */}
			<PinnedBanner
				data-testid="client-pinned"
				className="-mb-6"
				watch={banner}
				icon={Building2}
				name={client.name}
				tabs={tabs}
				value={tab}
				onSelect={(next) => onTab(next as ClientTabId)}
			/>
			<EntityBanner
				ref={banner}
				data-testid="client-banner"
				back={{ label: "All clients", to: "/clients" }}
				tile={<BannerTile icon={Building2} data-testid="client-banner-tile" />}
				name={client.name}
				status={
					<BannerStatus
						data-testid="client-banner-status"
						label={closed ? "Closed" : "Active"}
						live={!closed}
					/>
				}
				facts={clientFacts(client, now)}
				stats={
					<ClientStats
						client={client}
						missions={missions.data?.pages[0]?.meta.total}
					/>
				}
				actions={<ClientBannerActions client={client} actions={actions} />}
				tabs={tabs}
				tabsLabel={`${client.name}'s page`}
			/>
			<TabsContent value="overview">
				<div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
					<SectionPanel
						title="Engagements"
						description="Each piece of work for this client. Closing one revokes its connections."
						data-testid="client-engagements-panel"
					>
						<EngagementBoard
							client={client}
							onNewEngagement={() => actions.onNewEngagement(client)}
							onCloseEngagement={actions.onCloseEngagement}
						/>
					</SectionPanel>
					<div className="flex min-w-0 flex-col gap-6">
						<SectionPanel
							title="Details"
							description="The client's own fields."
							data-testid="client-details-panel"
							actions={
								<Button
									variant="ghost"
									size="sm"
									data-testid="client-details-edit"
									onClick={() => actions.onEdit(client)}
								>
									<Pencil aria-hidden="true" />
									Edit
								</Button>
							}
						>
							<ClientDetails client={client} now={now} />
						</SectionPanel>
						<SectionPanel
							title="Missions"
							description="The work run under this client's engagements, most recent activity first."
							data-testid="client-missions-panel"
						>
							<ClientMissions query={missions} clientName={client.name} />
						</SectionPanel>
					</div>
				</div>
			</TabsContent>
			<TabsContent value="engagements">
				<ClientEngagements
					client={client}
					activeOnly={activeOnly}
					onActiveOnlyChange={onActiveOnlyChange}
					actions={actions}
				/>
			</TabsContent>
			<TabsContent value="drive">
				<div className="flex flex-col gap-6">
					<ClientNotesDrive clientId={client.id} />
					<ClientFilesDrive clientId={client.id} />
				</div>
			</TabsContent>
			<TabsContent value="activity">
				<ClientActivity client={client} />
			</TabsContent>
		</Tabs>
	);
}

/**
 * The banner's numbers: its missions (the missions read's meta.total, a dash
 * until it arrives) and the client's own engagement counts, all live.
 */
function ClientStats({
	client,
	missions,
}: {
	client: Client;
	missions: number | undefined;
}) {
	const closedCount = client.engagementCount - client.activeEngagementCount;
	return (
		<>
			<BannerStat
				data-testid="client-stat-missions"
				value={missions === undefined ? "—" : String(missions)}
				label={missions === 1 ? "mission" : "missions"}
			/>
			<BannerStat
				data-testid="client-stat-engagements"
				value={String(client.engagementCount)}
				label={client.engagementCount === 1 ? "engagement" : "engagements"}
			/>
			<BannerStat
				data-testid="client-stat-active"
				value={String(client.activeEngagementCount)}
				label="active"
			/>
			<BannerStat
				data-testid="client-stat-closed"
				value={String(closedCount)}
				label="closed"
			/>
		</>
	);
}

/** New engagement, Edit, and Close or Reopen: real buttons on the banner. */
function ClientBannerActions({
	client,
	actions,
}: {
	client: Client;
	actions: ClientActions;
}) {
	const closed = client.status === "closed";
	return (
		<>
			<Button
				size="sm"
				className={cn(BANNER_BUTTON)}
				data-testid="client-new-engagement"
				disabledReason={
					closed ? "Reopen the client to add an engagement." : undefined
				}
				onClick={() => actions.onNewEngagement(client)}
			>
				<Plus aria-hidden="true" />
				New engagement
			</Button>
			<Button
				size="sm"
				className={cn(BANNER_BUTTON)}
				data-testid="client-edit"
				onClick={() => actions.onEdit(client)}
			>
				<Pencil aria-hidden="true" />
				Edit
			</Button>
			{closed ? (
				<Button
					size="sm"
					className={cn(BANNER_BUTTON)}
					data-testid="client-reopen"
					onClick={() => actions.onReopen(client)}
				>
					<RotateCcw aria-hidden="true" />
					Reopen
				</Button>
			) : (
				<Button
					size="sm"
					className={cn(BANNER_BUTTON)}
					data-testid="client-close"
					onClick={() => actions.onClose(client)}
				>
					<Power aria-hidden="true" />
					Close client
				</Button>
			)}
		</>
	);
}

/** Contact, notes and dates, as a definition list. */
function ClientDetails({ client, now }: { client: Client; now: number }) {
	return (
		<dl className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<dt className="type-caption text-text-subtle">Primary contact</dt>
				<dd
					data-testid="client-detail-contact"
					className={cn(
						"type-body break-words",
						client.primaryContact ? "text-foreground" : "text-text-subtle",
					)}
				>
					{client.primaryContact ?? "None set"}
				</dd>
			</div>
			<div className="flex flex-col gap-1">
				<dt className="type-caption text-text-subtle">Notes</dt>
				{/* Plain text with its line breaks; markdown is not rendered yet. */}
				<dd
					data-testid="client-detail-notes"
					className={cn(
						"type-small whitespace-pre-line break-words",
						client.notesMd ? "text-text-muted" : "text-text-subtle",
					)}
				>
					{client.notesMd ?? "None set."}
				</dd>
			</div>
			<div className="grid grid-cols-2 gap-3">
				<div className="flex flex-col gap-1">
					<dt className="type-caption text-text-subtle">Added</dt>
					<dd className="type-mono-small text-text-muted">
						<time dateTime={client.createdAt}>{isoDate(client.createdAt)}</time>
					</dd>
				</div>
				<div className="flex flex-col gap-1">
					<dt className="type-caption text-text-subtle">Updated</dt>
					<dd
						data-testid="client-detail-updated"
						className="type-mono-small text-text-muted"
					>
						<time
							dateTime={client.updatedAt}
							title={client.updatedAt}
							suppressHydrationWarning
						>
							{relativeTime(client.updatedAt, now)}
						</time>
					</dd>
				</div>
			</div>
		</dl>
	);
}

/** The Engagements tab: every engagement as a row, with Active only. */
function ClientEngagements({
	client,
	activeOnly,
	onActiveOnlyChange,
	actions,
}: {
	client: Client;
	activeOnly: boolean;
	onActiveOnlyChange: (activeOnly: boolean) => void;
	actions: ClientActions;
}) {
	return (
		<SectionPanel
			title="Engagements"
			description="Newest first. Active only lists the ones that keep this client open."
			data-testid="client-engagements-tab"
			actions={
				<Button
					variant="ghost"
					size="sm"
					aria-pressed={activeOnly}
					data-testid="client-active-only"
					onClick={() => onActiveOnlyChange(!activeOnly)}
					className="aria-pressed:bg-state-selected"
				>
					Active only
				</Button>
			}
		>
			<EngagementList
				client={client}
				activeOnly={activeOnly}
				onShowAll={() => onActiveOnlyChange(false)}
				onNewEngagement={() => actions.onNewEngagement(client)}
				onCloseEngagement={actions.onCloseEngagement}
			/>
		</SectionPanel>
	);
}

/** The banner and the first panels' shape while the client loads. */
function ClientPageSkeleton() {
	return (
		<div data-testid="client-detail-skeleton" className="flex flex-col gap-6">
			<div className="flex flex-col gap-5 rounded-lg border border-border p-4 md:px-8 md:pt-6">
				<Skeleton className="h-3 w-20" />
				<div className="flex items-center gap-5">
					<Skeleton className="size-16 rounded-lg" />
					<div className="flex flex-col gap-2">
						<Skeleton className="h-7 w-56" />
						<Skeleton className="h-4 w-72 max-w-full" />
					</div>
				</div>
				<Skeleton className="h-9 w-full" />
			</div>
			<div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
				<Skeleton className="h-64 w-full rounded-md" />
				<Skeleton className="h-48 w-full rounded-md" />
			</div>
		</div>
	);
}
