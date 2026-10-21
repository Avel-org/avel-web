import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ConnectionDetails } from "@/components/avel/connection-details";
import {
	CONNECTION_FILTERS,
	CONNECTION_VIEWS,
	ConnectionFilterControl,
	ConnectionList,
	ExpiredBanner,
	NewConnectionButton,
	useConnectionsFor,
} from "@/components/avel/connection-list";
import { DataPanel } from "@/components/avel/data-panel";
import { Paging, PanelFooter } from "@/components/avel/panel-footer";
import { ViewToggle } from "@/components/avel/view-toggle";
import {
	connectionCountLabel,
	connectionsTotal,
	loadedConnections,
	useConnections,
} from "@/lib/api/connections";
import { useNow } from "@/lib/use-now";
import { Page, pageHead } from "../shell/page";

/**
 * The page's state in the URL. `view` is Board (cards, the default) or Table
 * (ruling 36); `status` is Connected, Revoked, or All (the default);
 * `connection` is the one whose details are open. Each survives a reload
 * and is a link.
 */
export const connectionsSearch = z.object({
	view: z.enum(["board", "table"]).optional().catch(undefined),
	status: z.enum(CONNECTION_FILTERS).optional().catch(undefined),
	connection: z.string().uuid().optional().catch(undefined),
});

export const Route = createFileRoute("/settings/connections")({
	staticData: { device: "construction" },
	validateSearch: connectionsSearch,
	head: pageHead("/settings/connections"),
	component: SettingsConnectionsPage,
});

/** The route owns the list; the top bar counts from meta.total, never the rows loaded. */
function SettingsConnectionsPage() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const view = search.view ?? "board";
	const filter = search.status ?? "all";
	const connections = useConnectionsFor(filter);
	// Every connection, whatever the filter: the unfiltered list's meta.total.
	const total = connectionsTotal(useConnections().data);
	const now = useNow();
	return (
		<Page
			to="/settings/connections"
			subtitle={total === undefined ? undefined : connectionCountLabel(total)}
			actions={<NewConnectionButton />}
		>
			<div data-testid="connections-page" className="flex flex-col gap-4">
				<ExpiredBanner />
				{/* The list page anatomy: the status and the view in the toolbar,
				    when the list was read (a revoked connection must never read as
				    live, audit F1, F2) and its paging in the footer band. */}
				<DataPanel
					data-testid="connections-panel"
					title="Connections"
					count={connectionsTotal(connections.data)}
					toolbar={
						<div className="flex w-full min-w-0 flex-wrap items-center gap-2">
							<ConnectionFilterControl
								value={filter}
								onChange={(next) =>
									navigate({
										search: (prev) => ({
											...prev,
											status: next === "all" ? undefined : next,
										}),
										replace: true,
									})
								}
							/>
							<ViewToggle
								options={CONNECTION_VIEWS}
								view={view}
								testIdPrefix="connections-view"
								className="ml-auto"
								onChange={(next) =>
									navigate({
										search: (prev) => ({
											...prev,
											view: next === "board" ? undefined : next,
										}),
										replace: true,
									})
								}
							/>
						</div>
					}
					footer={
						<PanelFooter
							data-testid="connections-read-age"
							queries={[connections]}
						>
							{connections.data ? (
								<Paging
									loaded={loadedConnections(connections.data).length}
									total={
										connectionsTotal(connections.data) ??
										loadedConnections(connections.data).length
									}
									hasMore={connections.hasNextPage}
									loadingMore={connections.isFetchingNextPage}
									onLoadMore={() => connections.fetchNextPage()}
									testIdPrefix="connections"
								/>
							) : null}
						</PanelFooter>
					}
				>
					<ConnectionList
						query={connections}
						view={view}
						filter={filter}
						now={now}
						onOpen={(connection) =>
							navigate({
								search: (prev) => ({ ...prev, connection: connection.id }),
							})
						}
					/>
				</DataPanel>
			</div>
			{search.connection ? (
				<ConnectionDetails
					id={search.connection}
					onClose={() =>
						navigate({
							search: (prev) => ({ ...prev, connection: undefined }),
							replace: true,
						})
					}
				/>
			) : null}
		</Page>
	);
}
