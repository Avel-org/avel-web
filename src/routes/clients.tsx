import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { Client, Engagement } from "avel-server/contract";
import { MousePointerClick, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import {
	type ClientActions,
	ClientDetail,
} from "@/components/avel/client-detail";
import { ClientFormSheet } from "@/components/avel/client-form";
import { ClientListPane, loadedClients } from "@/components/avel/client-list";
import { ClientStatusDialog } from "@/components/avel/client-status-dialog";
import { EmptyState } from "@/components/avel/empty-state";
import { EngagementCloseDialog } from "@/components/avel/engagement-close";
import { EngagementFormSheet } from "@/components/avel/engagement-form";
import { Button } from "@/components/ui/button";
import {
	clientCountLabel,
	clientSearchText,
	listTotal,
	useClients,
} from "@/lib/api/clients";
import { cn } from "@/lib/utils";
import { linkFor } from "../shell/nav";
import { Page, pageHead } from "../shell/page";

/**
 * The page's state in the URL.
 * - `q` searches the list (name or primary contact), trimmed and cut to the
 *   contract's 200 characters; empty means no search.
 * - `client` is the selected client. It stays in the URL: a selected client
 *   is a link, and Back walks the selections.
 * - `new` opens the New client sheet, so the command menu or any link can
 *   start one. It is read once and removed, so Back does not reopen it.
 */
export const clientsSearch = z.object({
	q: z
		.string()
		.transform((value) => clientSearchText(value))
		.optional()
		.catch(undefined),
	new: z.boolean().optional().catch(undefined),
	client: z.string().uuid().optional().catch(undefined),
});

export const Route = createFileRoute("/clients")({
	staticData: { device: "construction" },
	validateSearch: clientsSearch,
	head: pageHead("/clients"),
	component: ClientsPage,
});

/** Which overlay is open, if any. One at a time. */
type Overlay =
	| { kind: "none" }
	| { kind: "new-client" }
	| { kind: "edit-client"; client: Client }
	| { kind: "client-status"; client: Client; to: "closed" | "active" }
	| { kind: "new-engagement"; client: Client }
	| { kind: "close-engagement"; engagement: Pick<Engagement, "id" | "name"> };

/**
 * Clients as a list and a detail (AVEL-DESIGN.md section 12). At md and up
 * the list sits left and the selected client right; below md the list is
 * the page and a selection replaces it, with a way back. The top bar counts
 * from meta.total, never from the rows loaded.
 */
function ClientsPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: "/clients" });
	const clients = useClients(search.q);
	const [overlay, setOverlay] = useState<Overlay>({ kind: "none" });
	// The id whose engagements show active only. Tied to the selection, so
	// choosing another client starts from all of its engagements.
	const [activeOnlyFor, setActiveOnlyFor] = useState<string | null>(null);
	// Fixed at mount, so relative times render once and do not churn.
	const [now] = useState(() => Date.now());
	const close = () => setOverlay({ kind: "none" });
	const onOpenChange = (open: boolean) => {
		if (!open) close();
	};

	useEffect(() => {
		if (!search.new) return;
		setOverlay({ kind: "new-client" });
		navigate({
			search: (prev) => ({ ...prev, new: undefined }),
			replace: true,
		});
	}, [search.new, navigate]);

	const setQuery = (text: string) =>
		navigate({
			search: (prev) => ({ ...prev, q: clientSearchText(text) }),
			replace: true,
		});

	const total = listTotal(clients.data);
	const searching = search.q !== undefined;
	const subtitle =
		total === undefined ? undefined : clientCountLabel(total, searching);
	const selected = search.client;
	// First run: no clients at all, not a search that matched none.
	const firstRun =
		clients.status === "success" &&
		!searching &&
		loadedClients(clients.data).length === 0;

	const actions: ClientActions = {
		onEdit: (client) => setOverlay({ kind: "edit-client", client }),
		onNewEngagement: (client) => setOverlay({ kind: "new-engagement", client }),
		onClose: (client) =>
			setOverlay({ kind: "client-status", client, to: "closed" }),
		onReopen: (client) =>
			setOverlay({ kind: "client-status", client, to: "active" }),
		onCloseEngagement: (_client, engagement) =>
			setOverlay({ kind: "close-engagement", engagement }),
	};

	return (
		<Page
			to="/clients"
			subtitle={subtitle}
			actions={
				<Button
					size="sm"
					data-testid="clients-new"
					onClick={() => setOverlay({ kind: "new-client" })}
				>
					<Plus aria-hidden="true" />
					New client
				</Button>
			}
		>
			{firstRun ? (
				<EmptyState
					data-testid="clients-empty"
					icon={linkFor("/clients").icon}
					title="Add your first client"
					description="A client holds the engagements, connections and missions for one company. Add one to begin."
					action={
						<Button
							size="sm"
							data-testid="clients-empty-new"
							onClick={() => setOverlay({ kind: "new-client" })}
						>
							<Plus aria-hidden="true" />
							New client
						</Button>
					}
				/>
			) : (
				<div data-testid="clients-panes" className="flex min-h-0 flex-1 gap-6">
					<div
						data-testid="clients-list-pane"
						className={cn(
							"flex min-h-0 w-full flex-col md:w-80 md:shrink-0",
							// Below md a selection replaces the list.
							selected && "max-md:hidden",
						)}
					>
						<ClientListPane
							query={clients}
							search={search.q}
							onSearch={setQuery}
							selectedId={selected}
							onClearSearch={() => setQuery("")}
						/>
					</div>
					<div
						data-testid="clients-detail-pane"
						className={cn(
							"flex min-w-0 flex-1 flex-col md:border-l md:border-border md:pl-6",
							!selected && "max-md:hidden",
						)}
					>
						{selected ? (
							<ClientDetail
								key={selected}
								clientId={selected}
								actions={actions}
								activeOnly={activeOnlyFor === selected}
								onActiveOnlyChange={(on) =>
									setActiveOnlyFor(on ? selected : null)
								}
								now={now}
							/>
						) : (
							<EmptyState
								data-testid="clients-choose"
								icon={MousePointerClick}
								title="Choose a client"
								description={
									subtitle
										? `${subtitle}. Choose one to see its engagements and notes.`
										: "Choose one to see its engagements and notes."
								}
							/>
						)}
					</div>
				</div>
			)}
			<ClientFormSheet
				open={overlay.kind === "new-client" || overlay.kind === "edit-client"}
				onOpenChange={onOpenChange}
				client={overlay.kind === "edit-client" ? overlay.client : undefined}
			/>
			<EngagementFormSheet
				open={overlay.kind === "new-engagement"}
				onOpenChange={onOpenChange}
				client={overlay.kind === "new-engagement" ? overlay.client : null}
				today={new Date(now).toLocaleDateString("en-CA")}
			/>
			<ClientStatusDialog
				client={
					overlay.kind === "client-status"
						? { value: overlay.client, to: overlay.to }
						: null
				}
				onOpenChange={onOpenChange}
				// The refused client is the selected one: show its active
				// engagements in place.
				onShowEngagements={(id) => setActiveOnlyFor(id)}
			/>
			<EngagementCloseDialog
				engagement={
					overlay.kind === "close-engagement" ? overlay.engagement : null
				}
				onOpenChange={onOpenChange}
			/>
		</Page>
	);
}
