import { Link } from "@tanstack/react-router";
import type { Client, ClientStatus, Engagement } from "avel-server/contract";
import { ArrowRight, History, MoreHorizontal, Plus } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
	byStatus,
	engagementMeter,
	engagementSummary,
	isoDate,
	listTotal,
	relativeTime,
	statusTone,
	useClientEngagements,
	type useClients,
} from "@/lib/api/clients";
import { cn } from "@/lib/utils";
import {
	ClientListFooter,
	ClientsNoMatch,
	ClientTile,
	loadedClients,
} from "./client-list";
import type { ClientActions } from "./client-overlays";
import { StatusPill } from "./status-pill";
import { ErrorState, type ErrorStateProps, Surface } from "./surface";

/*
 * The client board (ruling 45): the portfolio at a glance. Clients sit in
 * two sections, Active then Closed, each a grid of cards. A card shows the
 * client's shape before it is opened: its tile, name, contact and status, a
 * meter of its engagements from the row's own counts, its latest engagements
 * as a short stack, and when it last changed. The card is a link to the
 * client's page; its menu edits, adds an engagement, and closes or reopens.
 */

/** How many engagements a card stacks before it says how many more. */
export const CARD_ENGAGEMENTS = 3;

const SECTION_LABEL: Record<ClientStatus, string> = {
	active: "Active",
	closed: "Closed",
};

export function ClientBoard({
	query,
	search,
	status,
	onClearSearch,
	actions,
	now,
}: {
	query: ReturnType<typeof useClients>;
	search: string | undefined;
	/** The status filter; undefined shows both sections. */
	status: ClientStatus | undefined;
	onClearSearch: () => void;
	actions: ClientActions;
	now: number;
}) {
	return (
		<Surface
			data-testid="client-board"
			query={query}
			isEmpty={(data) => loadedClients(data).length === 0}
			loading={<ClientBoardSkeleton />}
			empty={<ClientsNoMatch search={search} onClearSearch={onClearSearch} />}
			error={ErrorState}
		>
			{(data) => {
				const clients = loadedClients(data);
				const groups = byStatus(clients);
				const more = query.hasNextPage;
				const shown: ClientStatus[] = status
					? [status]
					: // An empty Closed section says nothing worth a heading.
						groups.closed.length > 0
						? ["active", "closed"]
						: ["active"];
				return (
					<div className="flex flex-col gap-8">
						{shown.map((s) => (
							<BoardSection
								key={s}
								status={s}
								clients={groups[s]}
								more={more}
								actions={actions}
								now={now}
							/>
						))}
						<ClientListFooter
							loaded={clients.length}
							total={listTotal(data)}
							hasMore={more}
							loadingMore={query.isFetchingNextPage}
							onLoadMore={() => query.fetchNextPage()}
						/>
					</div>
				);
			}}
		</Surface>
	);
}

/** One status's clients, under a ruled heading with their count. */
function BoardSection({
	status,
	clients,
	more,
	actions,
	now,
}: {
	status: ClientStatus;
	clients: Client[];
	/** More clients remain unloaded, so "none" means none loaded. */
	more: boolean;
	actions: ClientActions;
	now: number;
}) {
	const headingId = useId();
	const label = SECTION_LABEL[status];
	return (
		<section
			aria-labelledby={headingId}
			data-testid={`client-section-${status}`}
			className="flex flex-col gap-3"
		>
			<header className="flex items-center gap-3">
				<span
					aria-hidden="true"
					className={cn(
						"size-2 rounded-full",
						status === "active" ? "bg-gate-pass" : "bg-text-subtle",
					)}
				/>
				<h2 id={headingId} className="type-panel-title text-foreground">
					{label}
				</h2>
				<span
					data-testid={`client-section-${status}-count`}
					className="type-mono-small text-text-subtle tabular-nums"
				>
					{clients.length}
				</span>
				<span aria-hidden="true" className="h-px flex-1 bg-border" />
			</header>
			{clients.length === 0 && status === "closed" ? (
				<p
					data-testid="client-section-closed-none"
					className="type-small text-text-muted"
				>
					{more
						? "No closed clients among those loaded. Load more to look further."
						: "No closed clients."}
				</p>
			) : (
				<ul
					aria-label={`${label} clients`}
					data-testid={`client-cards-${status}`}
					className="stagger-in grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-4"
				>
					{clients.map((client) => (
						<li key={client.id} className="min-w-0">
							<ClientCard client={client} actions={actions} now={now} />
						</li>
					))}
					{status === "active" ? (
						<li className="min-w-0">
							<NewClientCard onClick={actions.onNewClient} />
						</li>
					) : null}
				</ul>
			)}
		</section>
	);
}

/** One client as a card. The name is the link; the whole card answers it. */
export function ClientCard({
	client,
	actions,
	now,
}: {
	client: Client;
	actions: ClientActions;
	now: number;
}) {
	const titleId = useId();
	const closed = client.status === "closed";
	return (
		<article
			aria-labelledby={titleId}
			data-testid={`client-card-${client.id}`}
			data-status={client.status}
			className="plate plate-interactive group relative flex h-full flex-col overflow-hidden rounded-md border"
		>
			<header className="surface-steel groove-b flex items-start gap-3 bg-app-band px-4 py-3">
				<ClientTile name={client.name} closed={closed} />
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<h3 id={titleId} className="type-panel-title truncate">
						{/* The link's box covers the card, so a click anywhere opens
						    the client; the menu and buttons sit above it. */}
						<Link
							to="/clients/$id"
							params={{ id: client.id }}
							data-testid={`client-card-open-${client.id}`}
							className="rounded-xs text-foreground after:absolute after:inset-0 after:content-['']"
						>
							{client.name}
						</Link>
					</h3>
					<p
						data-testid={`client-card-contact-${client.id}`}
						className="type-caption truncate text-text-muted"
					>
						{client.primaryContact ?? "No primary contact"}
					</p>
				</div>
				<StatusPill
					size="sm"
					tone={statusTone(client.status)}
					label={closed ? "Closed" : "Active"}
					data-testid={`client-status-${client.id}`}
				/>
				<div className="relative z-10 -mr-1.5 -mt-0.5">
					<ClientCardMenu client={client} actions={actions} />
				</div>
			</header>
			<div className="flex flex-1 flex-col gap-3 px-4 py-3">
				<EngagementMeter client={client} />
				{client.engagementCount > 0 ? (
					<EngagementStack client={client} />
				) : (
					<div className="flex items-center justify-between gap-2">
						<p
							data-testid={`client-card-no-engagements-${client.id}`}
							className="type-small text-text-subtle"
						>
							No engagements yet.
						</p>
						{closed ? null : (
							<Button
								variant="ghost"
								size="sm"
								data-testid={`client-card-new-engagement-${client.id}`}
								className="relative z-10"
								onClick={() => actions.onNewEngagement(client)}
							>
								<Plus aria-hidden="true" />
								Add one
							</Button>
						)}
					</div>
				)}
			</div>
			<footer className="flex items-center gap-1.5 border-t border-border px-4 py-2 type-caption text-text-subtle">
				<History aria-hidden="true" className="size-3.5" />
				<span data-testid={`client-card-updated-${client.id}`}>
					Updated{" "}
					<time
						dateTime={client.updatedAt}
						title={client.updatedAt}
						suppressHydrationWarning
					>
						{relativeTime(client.updatedAt, now)}
					</time>
				</span>
				<span
					aria-hidden="true"
					className="ml-auto inline-flex items-center gap-1 text-text-muted transition-colors duration-(--duration-micro) ease-avel group-hover:text-accent-text"
				>
					Open
					<ArrowRight className="size-3.5" />
				</span>
			</footer>
		</article>
	);
}

/**
 * The client's engagements as a row of segments, active first, from the
 * row's own counts: no request, and the same numbers the list summary uses.
 */
export function EngagementMeter({ client }: { client: Client }) {
	const { active, closed, more } = engagementMeter(client);
	return (
		<div
			data-testid={`client-meter-${client.id}`}
			data-active={client.activeEngagementCount}
			data-total={client.engagementCount}
			className="flex flex-col gap-1.5"
		>
			<div className="flex items-baseline justify-between gap-2">
				<span className="type-caption text-text-subtle">Engagements</span>
				<span
					data-testid={`client-meter-label-${client.id}`}
					className="type-mono-small text-text-muted tabular-nums"
				>
					{engagementSummary(client)}
				</span>
			</div>
			<div aria-hidden="true" className="flex h-1.5 items-stretch gap-0.5">
				{active + closed === 0 ? (
					<span className="flex-1 rounded-full border border-dashed border-border-strong" />
				) : (
					<>
						{Array.from({ length: active }, (_, i) => (
							<span
								// biome-ignore lint/suspicious/noArrayIndexKey: segments are positions, not items
								key={`a${i}`}
								data-segment="active"
								className="grow-x flex-1 rounded-full bg-gate-pass"
							/>
						))}
						{Array.from({ length: closed }, (_, i) => (
							<span
								// biome-ignore lint/suspicious/noArrayIndexKey: segments are positions, not items
								key={`c${i}`}
								data-segment="closed"
								className="grow-x flex-1 rounded-full bg-border-strong"
							/>
						))}
					</>
				)}
				{more > 0 ? (
					<span className="type-mono-small -mt-1 pl-1 leading-none text-text-subtle">{`+${more}`}</span>
				) : null}
			</div>
		</div>
	);
}

/**
 * The client's latest engagements, active first, as a short stack. Read from
 * contract.engagements.list for this client: the same cache entry its page
 * uses, so opening the client shows them at once.
 */
function EngagementStack({ client }: { client: Client }) {
	const query = useClientEngagements(client.id);
	return (
		<Surface
			data-testid={`client-card-engagements-${client.id}`}
			query={query}
			isEmpty={(data) => data.pages.every((page) => page.data.length === 0)}
			loading={
				<div className="flex flex-col gap-1">
					<Skeleton className="h-7 w-full rounded-sm" />
					<Skeleton className="h-7 w-4/5 rounded-sm" />
				</div>
			}
			empty={<p className="type-small text-text-subtle">No engagements yet.</p>}
			error={CardError}
		>
			{(data) => {
				const all = data.pages.flatMap((page) => page.data);
				const ordered = [
					...all.filter((e) => e.status === "active"),
					...all.filter((e) => e.status === "closed"),
				];
				const rest = client.engagementCount - CARD_ENGAGEMENTS;
				return (
					<ul aria-label="Latest engagements" className="flex flex-col gap-1">
						{ordered.slice(0, CARD_ENGAGEMENTS).map((e) => (
							<EngagementLine key={e.id} engagement={e} />
						))}
						{rest > 0 ? (
							<li
								data-testid={`client-card-more-${client.id}`}
								className="type-caption px-2 text-text-subtle"
							>
								{rest === 1 ? "and 1 more" : `and ${rest} more`}
							</li>
						) : null}
					</ul>
				);
			}}
		</Surface>
	);
}

function EngagementLine({ engagement }: { engagement: Engagement }) {
	const active = engagement.status === "active";
	return (
		<li
			data-testid={`client-card-engagement-${engagement.id}`}
			data-status={engagement.status}
			className="flex min-w-0 items-center gap-2 rounded-sm bg-app-recessed px-2 py-1.5"
		>
			<span
				aria-hidden="true"
				className={cn(
					"size-1.5 shrink-0 rounded-full",
					active ? "bg-gate-pass" : "bg-text-subtle",
				)}
			/>
			<span
				className={cn(
					"type-small min-w-0 flex-1 truncate",
					active ? "text-foreground" : "text-text-muted",
				)}
			>
				{engagement.name}
				<span className="sr-only">{active ? ", active" : ", closed"}</span>
			</span>
			<span className="type-mono-small shrink-0 text-text-subtle">
				<span className="sr-only">Started </span>
				<time dateTime={engagement.startedAt}>
					{isoDate(engagement.startedAt)}
				</time>
			</span>
		</li>
	);
}

/** A card is small: its error is one line with a retry, not the full card. */
function CardError({ retry, retrying }: ErrorStateProps<unknown>) {
	return (
		<div className="flex items-center gap-2">
			<p className="type-small text-text-muted">Could not load engagements.</p>
			<Button
				variant="link"
				size="sm"
				className="relative z-10 h-auto px-0"
				disabled={retrying}
				onClick={retry}
			>
				Try again
			</Button>
		</div>
	);
}

/** Open, edit, add an engagement, and close or reopen. */
function ClientCardMenu({
	client,
	actions,
}: {
	client: Client;
	actions: ClientActions;
}) {
	const closed = client.status === "closed";
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={`Actions for ${client.name}`}
					data-testid={`client-card-menu-${client.id}`}
				>
					<MoreHorizontal aria-hidden="true" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuItem
					data-testid={`client-card-edit-${client.id}`}
					onSelect={() => actions.onEdit(client)}
				>
					Edit client
				</DropdownMenuItem>
				<DropdownMenuItem
					disabled={closed}
					data-testid={`client-card-add-engagement-${client.id}`}
					onSelect={() => actions.onNewEngagement(client)}
				>
					{closed ? (
						<span className="flex flex-col">
							New engagement
							<span className="type-caption">Reopen the client first</span>
						</span>
					) : (
						"New engagement"
					)}
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				{closed ? (
					<DropdownMenuItem
						data-testid={`client-card-reopen-${client.id}`}
						onSelect={() => actions.onReopen(client)}
					>
						Reopen client
					</DropdownMenuItem>
				) : (
					<DropdownMenuItem
						variant="destructive"
						data-testid={`client-card-close-${client.id}`}
						onSelect={() => actions.onClose(client)}
					>
						Close client
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/** The last slot of the Active section: a dashed place for the next client. */
function NewClientCard({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			data-testid="client-card-new"
			onClick={onClick}
			className="flex h-full min-h-48 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-strong p-4 text-text-muted transition-colors duration-(--duration-micro) ease-avel hover:bg-state-hover hover:text-foreground"
		>
			<span className="inline-flex size-10 items-center justify-center rounded-sm border border-border bg-app-recessed">
				<Plus aria-hidden="true" className="size-4" />
			</span>
			<span className="type-body font-medium">New client</span>
			<span className="type-caption max-w-56 text-center text-text-subtle">
				A company to hold its engagements, connections and missions.
			</span>
		</button>
	);
}

/** The board's shape while it loads: a section heading and three cards. */
export function ClientBoardSkeleton() {
	return (
		<div data-testid="client-board-skeleton" className="flex flex-col gap-3">
			<div className="flex items-center gap-3">
				<Skeleton className="h-4 w-20" />
				<span aria-hidden="true" className="h-px flex-1 bg-border" />
			</div>
			<div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-4">
				{[0, 1, 2].map((i) => (
					<div
						key={i}
						data-testid="client-board-skeleton-card"
						className="plate flex flex-col overflow-hidden rounded-md border"
					>
						<div className="flex items-center gap-3 border-b border-border bg-app-band px-4 py-3">
							<Skeleton className="size-10 rounded-sm" />
							<span className="flex flex-1 flex-col gap-1.5">
								<Skeleton className="h-4 w-32" />
								<Skeleton className="h-3 w-24" />
							</span>
							<Skeleton className="h-5 w-14 rounded-full" />
						</div>
						<div className="flex flex-col gap-2 px-4 py-3">
							<Skeleton className="h-1.5 w-full rounded-full" />
							<Skeleton className="h-7 w-full rounded-sm" />
							<Skeleton className="h-7 w-4/5 rounded-sm" />
						</div>
						<div className="border-t border-border px-4 py-2">
							<Skeleton className="h-3 w-28" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
