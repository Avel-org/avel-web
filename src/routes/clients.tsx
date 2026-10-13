import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { type ClientStatus, clientStatus } from "avel-server/contract";
import { LayoutGrid, Plus, Rows3 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { z } from "zod";
import { ClientBoard } from "@/components/avel/client-board";
import { ClientTable, loadedClients } from "@/components/avel/client-list";
import { useClientOverlays } from "@/components/avel/client-overlays";
import { ClientSearch } from "@/components/avel/client-search";
import { EmptyState } from "@/components/avel/empty-state";
import { type ViewOption, ViewToggle } from "@/components/avel/view-toggle";
import { Button } from "@/components/ui/button";
import {
	clientCountLabel,
	clientSearchText,
	listTotal,
	useClients,
} from "@/lib/api/clients";
import { linkFor } from "../shell/nav";
import { Page, pageHead } from "../shell/page";

/**
 * The page's state in the URL.
 * - `q` searches the list (name or primary contact), trimmed and cut to the
 *   contract's 200 characters; empty means no search.
 * - `status` keeps one section of the board, or one status in the table.
 * - `view` is "table" for the table; absent is the board (ruling 36).
 * - `new` opens the New client modal, so the command menu or any link can
 *   start one. It is read once and removed, so Back does not reopen it.
 * - `client` is the old way to open a client, from before it had a page. It
 *   redirects there, so an old link or log entry still lands.
 */
export const clientsSearch = z.object({
	q: z
		.string()
		.transform((value) => clientSearchText(value))
		.optional()
		.catch(undefined),
	status: clientStatus.optional().catch(undefined),
	view: z.literal("table").optional().catch(undefined),
	new: z.boolean().optional().catch(undefined),
	client: z.string().uuid().optional().catch(undefined),
});

export const Route = createFileRoute("/clients")({
	staticData: { device: "construction" },
	validateSearch: clientsSearch,
	beforeLoad: ({ search }) => {
		if (search.client) {
			throw redirect({
				to: "/clients/$id",
				params: { id: search.client },
				replace: true,
			});
		}
	},
	head: pageHead("/clients"),
	component: ClientsPage,
});

type View = "board" | "table";

/** Board first: the portfolio is the page; Table is for reading across. */
const CLIENT_VIEWS: readonly ViewOption<View>[] = [
	{ id: "board", label: "Board", icon: LayoutGrid },
	{ id: "table", label: "Table", icon: Rows3 },
];

/**
 * Clients as a board of cards (ruling 45), with the table as its second
 * view. A card opens the client's own page. The top bar counts from
 * meta.total, never from the rows loaded.
 */
function ClientsPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: "/clients" });
	const clients = useClients(search.q);
	// Fixed at mount, so relative times render once and do not churn.
	const [now] = useState(() => Date.now());
	const { actions, modals } = useClientOverlays({
		// A refused close shows the client's active engagements on its page.
		onShowEngagements: (id) =>
			navigate({
				to: "/clients/$id",
				params: { id },
				search: { tab: "engagements", active: true },
			}),
	});
	const view: View = search.view === "table" ? "table" : "board";

	useEffect(() => {
		if (!search.new) return;
		actions.onNewClient();
		navigate({
			search: (prev) => ({ ...prev, new: undefined }),
			replace: true,
		});
	}, [search.new, navigate, actions.onNewClient]);

	const setSearch = (next: Partial<z.infer<typeof clientsSearch>>) =>
		navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });
	const setQuery = (text: string) => setSearch({ q: clientSearchText(text) });

	const total = listTotal(clients.data);
	const searching = search.q !== undefined;
	const subtitle =
		total === undefined ? undefined : clientCountLabel(total, searching);
	// First run: no clients at all, not a search that matched none.
	const firstRun =
		clients.status === "success" &&
		!searching &&
		loadedClients(clients.data).length === 0;

	return (
		<Page
			to="/clients"
			subtitle={subtitle}
			actions={
				<Button
					size="sm"
					data-testid="clients-new"
					onClick={actions.onNewClient}
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
							onClick={actions.onNewClient}
						>
							<Plus aria-hidden="true" />
							New client
						</Button>
					}
				/>
			) : (
				<div
					data-testid="clients-page"
					className="flex min-w-0 flex-1 flex-col gap-5"
				>
					<div
						data-testid="clients-toolbar"
						className="flex flex-wrap items-center gap-3"
					>
						<div className="w-full sm:w-80">
							<ClientSearch value={search.q ?? ""} onChange={setQuery} />
						</div>
						<StatusFilter
							value={search.status}
							onChange={(status) => setSearch({ status })}
						/>
						<ViewToggle
							options={CLIENT_VIEWS}
							view={view}
							onChange={(next) =>
								setSearch({ view: next === "table" ? "table" : undefined })
							}
							testIdPrefix="clients-view"
							className="sm:ml-auto"
						/>
					</div>
					{view === "table" ? (
						<ClientTable
							query={clients}
							search={search.q}
							status={search.status}
							onClearSearch={() => setQuery("")}
							now={now}
						/>
					) : (
						<ClientBoard
							query={clients}
							search={search.q}
							status={search.status}
							onClearSearch={() => setQuery("")}
							actions={actions}
							now={now}
						/>
					)}
				</div>
			)}
			{modals}
		</Page>
	);
}

const STATUS_OPTIONS: { id: ClientStatus | undefined; label: string }[] = [
	{ id: undefined, label: "All" },
	{ id: "active", label: "Active" },
	{ id: "closed", label: "Closed" },
];

/**
 * All, Active or Closed, as pressed-state buttons. The contract's list has
 * no status filter, so this narrows the clients loaded, not the request.
 */
function StatusFilter({
	value,
	onChange,
}: {
	value: ClientStatus | undefined;
	onChange: (value: ClientStatus | undefined) => void;
}) {
	const legendId = useId();
	return (
		<fieldset
			aria-labelledby={legendId}
			data-testid="clients-status"
			className="inline-flex items-center gap-0.5 rounded-sm border border-border p-0.5"
		>
			<legend id={legendId} className="sr-only">
				Status
			</legend>
			{STATUS_OPTIONS.map(({ id, label }) => (
				<Button
					key={label}
					size="sm"
					variant={value === id ? "secondary" : "ghost"}
					aria-pressed={value === id}
					data-testid={`clients-status-${id ?? "all"}`}
					onClick={() => onChange(id)}
				>
					{label}
				</Button>
			))}
		</fieldset>
	);
}
