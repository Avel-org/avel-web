import { Link } from "@tanstack/react-router";
import type { Client } from "avel-server/contract";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
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
import type { ApiError } from "@/lib/api";
import { relativeTime, statusTone, useClient } from "@/lib/api/clients";
import { EngagementList } from "./engagement-list";
import { StatusPill } from "./status-pill";
import { ErrorState, type ErrorStateProps, Surface } from "./surface";

/** What the operator can do to a client, from its detail. */
export type ClientActions = {
	onEdit: (client: Client) => void;
	onNewEngagement: (client: Client) => void;
	onClose: (client: Client) => void;
	onReopen: (client: Client) => void;
	onCloseEngagement: (
		client: Client,
		engagement: { id: string; name: string },
	) => void;
};

/**
 * The selected client, fetched by id (contract.clients.get), so a selected
 * client is a link that opens whatever the list's search or paging. A client
 * that is gone answers NOT_FOUND, shown by ErrorState with a way back.
 */
export function ClientDetail({
	clientId,
	actions,
	activeOnly,
	onActiveOnlyChange,
	now,
}: {
	clientId: string;
	actions: ClientActions;
	activeOnly: boolean;
	onActiveOnlyChange: (activeOnly: boolean) => void;
	now: number;
}) {
	const query = useClient(clientId);
	return (
		<Surface
			data-testid="client-detail-surface"
			query={query}
			// A client is one record: it is either there or an error.
			isEmpty={() => false}
			loading={<ClientDetailSkeleton />}
			empty={null}
			error={DetailError}
		>
			{(client) => (
				<ClientDetailBody
					client={client}
					actions={actions}
					activeOnly={activeOnly}
					onActiveOnlyChange={onActiveOnlyChange}
					now={now}
				/>
			)}
		</Surface>
	);
}

/** The error, with the way back to the list (the search is kept). */
function DetailError(props: ErrorStateProps<ApiError>) {
	return (
		<div data-testid="client-detail-error" className="flex flex-col gap-3">
			<ErrorState {...props} />
			<BackToClients />
		</div>
	);
}

function BackToClients({ className }: { className?: string }) {
	return (
		<Button variant="outline" size="sm" className={className} asChild>
			<Link
				to="/clients"
				search={(prev) => ({ q: prev.q })}
				data-testid="client-back"
				className="self-start"
			>
				<ArrowLeft aria-hidden="true" />
				Back to clients
			</Link>
		</Button>
	);
}

/** The client itself: header, engagements, notes, and when it last changed. */
export function ClientDetailBody({
	client,
	actions,
	activeOnly,
	onActiveOnlyChange,
	now,
}: {
	client: Client;
	actions: ClientActions;
	activeOnly: boolean;
	onActiveOnlyChange: (activeOnly: boolean) => void;
	now: number;
}) {
	const titleId = useId();
	const engagementsId = useId();
	const notesId = useId();
	const closed = client.status === "closed";

	return (
		<article
			aria-labelledby={titleId}
			data-testid="client-detail"
			className="flex flex-col gap-6"
		>
			{/* Below lg the detail is the page; this is the way back to the list. */}
			<BackToClients className="lg:hidden" />

			<header className="flex items-start gap-3">
				<div className="flex min-w-0 flex-1 flex-col gap-1.5">
					<h2 id={titleId} className="type-h2 truncate text-foreground">
						{client.name}
					</h2>
					<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
						<StatusPill
							size="sm"
							tone={statusTone(client.status)}
							label={closed ? "Closed" : "Active"}
							data-testid="client-detail-status"
						/>
						<span
							data-testid="client-detail-contact"
							className="type-small text-text-muted"
						>
							{client.primaryContact ?? (
								<span className="text-text-subtle">
									Primary contact: none set
								</span>
							)}
						</span>
					</div>
				</div>
				<ClientMenu client={client} actions={actions} />
			</header>

			<section aria-labelledby={engagementsId} className="flex flex-col gap-3">
				<div className="flex items-center justify-between gap-2">
					<h3 id={engagementsId} className="type-panel-title text-foreground">
						Engagements
					</h3>
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
				</div>
				<EngagementList
					client={client}
					activeOnly={activeOnly}
					onShowAll={() => onActiveOnlyChange(false)}
					onNewEngagement={() => actions.onNewEngagement(client)}
					onCloseEngagement={(e) => actions.onCloseEngagement(client, e)}
				/>
			</section>

			<section aria-labelledby={notesId} className="flex flex-col gap-2">
				<h3 id={notesId} className="type-panel-title text-foreground">
					Notes
				</h3>
				{client.notesMd ? (
					// Plain text with its line breaks; markdown is not rendered yet.
					<p
						data-testid="client-detail-notes"
						className="type-body whitespace-pre-line text-text-muted"
					>
						{client.notesMd}
					</p>
				) : (
					<p
						data-testid="client-detail-notes"
						className="type-small text-text-subtle"
					>
						None set.
					</p>
				)}
			</section>

			<p
				data-testid="client-detail-updated"
				className="type-caption text-text-subtle"
			>
				Updated{" "}
				<time
					dateTime={client.updatedAt}
					title={client.updatedAt}
					suppressHydrationWarning
				>
					{relativeTime(client.updatedAt, now)}
				</time>
			</p>
		</article>
	);
}

/** Edit, and close or reopen. New engagement sits with the engagements. */
function ClientMenu({
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
					data-testid="client-menu"
				>
					<MoreHorizontal aria-hidden="true" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuItem
					data-testid="client-edit"
					onSelect={() => actions.onEdit(client)}
				>
					Edit client
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				{closed ? (
					<DropdownMenuItem
						data-testid="client-reopen"
						onSelect={() => actions.onReopen(client)}
					>
						Reopen client
					</DropdownMenuItem>
				) : (
					<DropdownMenuItem
						variant="destructive"
						data-testid="client-close"
						onSelect={() => actions.onClose(client)}
					>
						Close client
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function ClientDetailSkeleton() {
	return (
		<div data-testid="client-detail-skeleton" className="flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				<Skeleton className="h-6 w-56" />
				<Skeleton className="h-5 w-40" />
			</div>
			<div className="flex flex-col gap-2">
				<Skeleton className="h-4 w-28" />
				<Skeleton className="h-9 w-full rounded-sm" />
				<Skeleton className="h-9 w-full rounded-sm" />
			</div>
		</div>
	);
}
