import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { type ClientStatus, clientStatus } from "avel-server/contract";
import { LayoutGrid, Plus, Rows3 } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import {
	type BoardSectionQuery,
	ClientBoard,
} from "@/components/avel/client-board";
import { ClientTable, loadedClients } from "@/components/avel/client-list";
import { useClientOverlays } from "@/components/avel/client-overlays";
import { ClientSearch } from "@/components/avel/client-search";
import { DataPanel } from "@/components/avel/data-panel";
import { EmptyState } from "@/components/avel/empty-state";
import { Paging, PanelFooter } from "@/components/avel/panel-footer";
import { Segmented, type SegmentOption } from "@/components/avel/segmented";
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
	const view: View = search.view === "table" ? "table" : "board";
	const board = view === "board";
	// The board reads one list per section, each filtered on the server, so
	// every section's count is its meta.total. The table reads one list,
	// filtered by `status` when one is set. A list the view does not show is
	// not read; Active in the table and the board's Active section are the
	// same cache entry.
	const active = useClients(search.q, "active", {
		enabled: board && search.status !== "closed",
	});
	const closed = useClients(search.q, "closed", {
		enabled: board && search.status !== "active",
	});
	const table = useClients(search.q, search.status, { enabled: !board });
	const sections: BoardSectionQuery[] = [
		{ status: "active" as const, query: active },
		{ status: "closed" as const, query: closed },
	].filter((s) => search.status === undefined || s.status === search.status);
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

	const total = board
		? sumOf(sections.map((s) => listTotal(s.query.data)))
		: listTotal(table.data);
	const narrowed = search.q !== undefined || search.status !== undefined;
	const subtitle =
		total === undefined
			? undefined
			: clientCountLabel(total, search.q !== undefined, search.status);
	// First run: no clients at all, not a search or a status that kept none.
	const firstRun = !narrowed && total === 0;

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
				// One panel, as every list page: its search, status and view in
				// the header's toolbar, the clients in the body, and when they
				// were read (with the table's paging) in the footer band.
				<div data-testid="clients-page" className="flex min-w-0 flex-col">
					<DataPanel
						data-testid="clients-panel"
						title="Clients"
						count={total}
						toolbar={
							<div
								data-testid="clients-toolbar"
								className="flex w-full flex-wrap items-center gap-2"
							>
								<div className="w-full sm:w-72">
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
						}
						footer={
							<PanelFooter
								data-testid="clients-read-age"
								queries={board ? sections.map((s) => s.query) : [table]}
							>
								{board || !table.data ? null : (
									<Paging
										testIdPrefix="clients"
										loaded={loadedClients(table.data).length}
										total={listTotal(table.data)}
										hasMore={table.hasNextPage}
										loadingMore={table.isFetchingNextPage}
										onLoadMore={() => table.fetchNextPage()}
									/>
								)}
							</PanelFooter>
						}
					>
						{view === "table" ? (
							<ClientTable
								query={table}
								search={search.q}
								status={search.status}
								onClearSearch={() => setQuery("")}
								onClearStatus={() => setSearch({ status: undefined })}
								now={now}
							/>
						) : (
							<div className="p-4">
								<ClientBoard
									sections={sections}
									search={search.q}
									filtered={search.status !== undefined}
									onClearSearch={() => setQuery("")}
									actions={actions}
									now={now}
								/>
							</div>
						)}
					</DataPanel>
				</div>
			)}
			{modals}
		</Page>
	);
}

const STATUS_OPTIONS: SegmentOption<ClientStatus>[] = [
	{ value: undefined, label: "All" },
	{ value: "active", label: "Active" },
	{ value: "closed", label: "Closed" },
];

/** The sum of the lists' totals, or undefined until every one is known. */
function sumOf(totals: (number | undefined)[]): number | undefined {
	let sum = 0;
	for (const total of totals) {
		if (total === undefined) return undefined;
		sum += total;
	}
	return sum;
}

/**
 * All, Active or Closed, as a v3 segmented control. The choice is sent as
 * the list's `status`, so the server filters and counts.
 */
function StatusFilter({
	value,
	onChange,
}: {
	value: ClientStatus | undefined;
	onChange: (value: ClientStatus | undefined) => void;
}) {
	// No counts: a status the view does not show is not read (see above).
	return (
		<Segmented
			data-testid="clients-status"
			legend="Status"
			options={STATUS_OPTIONS}
			value={value}
			onChange={onChange}
		/>
	);
}
