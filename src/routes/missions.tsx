import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import type { MissionListItem } from "avel-server/contract";
import { Plus, Target } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect } from "react";
import { DataPanel } from "@/components/avel/data-panel";
import { EmptyState } from "@/components/avel/empty-state";
import {
	countsOf,
	type MissionListParams,
	useMissionList,
} from "@/components/avel/mission-data";
import { MissionDetails } from "@/components/avel/mission-details";
import { MissionFilterBar } from "@/components/avel/mission-filters";
import { MissionPanels } from "@/components/avel/mission-panels";
import {
	includesArchived,
	MISSION_SEARCH_DEFAULTS,
	missionSearch,
	VIEWS,
	type View,
} from "@/components/avel/mission-search";
import { MissionTree } from "@/components/avel/mission-tree";
import { MissionsDashboard } from "@/components/avel/missions-dashboard";
import { ReadAge } from "@/components/avel/read-age";
import { Button } from "@/components/ui/button";
import { QUERY_STALE_MS } from "@/lib/api/provider";
import { NOT_YET } from "@/lib/capabilities";
import { useStoredState } from "@/lib/stored";
import { useNow } from "@/lib/use-now";
import { Page, pageHead } from "../shell/page";

export const Route = createFileRoute("/missions")({
	staticData: { device: "capture" },
	head: pageHead("/missions"),
	// The page's filters live in the URL. Defaults are stripped from it, so
	// the plain page is plain /missions and a link carries only what differs.
	validateSearch: missionSearch,
	search: { middlewares: [stripSearchParams(MISSION_SEARCH_DEFAULTS)] },
	component: MissionsPage,
});

/**
 * J and K move between mission rows, wherever focus is in a list: a panel's
 * table rows, or the tree's mission leaves. Enter opens the focused one (the
 * table's own, or the tree's). Rows across every panel are one list.
 */
function moveBetweenRows(event: KeyboardEvent<HTMLElement>) {
	if (event.key !== "j" && event.key !== "k") return;
	if (event.metaKey || event.ctrlKey || event.altKey) return;
	const ROWS = 'tbody tr[tabindex="0"], [role="treeitem"][data-mission-leaf]';
	const row = (event.target as HTMLElement).closest(ROWS);
	if (!row) return;
	const rows = [
		...event.currentTarget.querySelectorAll<HTMLElement>(ROWS),
	].filter((candidate) => candidate.offsetParent !== null);
	const next =
		rows[rows.indexOf(row as HTMLElement) + (event.key === "j" ? 1 : -1)];
	if (next) {
		event.preventDefault();
		next.focus();
	}
}

/**
 * Missions, by where they stand (ROUTES.md, /missions; MISSIONS-DASHBOARD.md):
 * the dashboard (status cards, what is running now, what needs you, what is
 * going quiet, recent activity), then the filters and the missions grouped
 * into panels or as a tree, and the details of the one chosen, beside the
 * list or, on a phone, over it. Everything filtering or choosing lives in
 * the URL; the status cards set its status.
 */
function MissionsPage() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const now = useNow();

	// The view is remembered per viewer. A link carries it only when it is
	// Table (Grouped is the stripped default), so a plain link opens the
	// viewer's own choice.
	const [storedView, setStoredView] = useStoredState<View>(
		"avel.missions.view",
		"grouped",
		VIEWS,
	);
	useEffect(() => {
		if (search.view === "grouped" && storedView === "tree") {
			navigate({
				search: (prev) => ({ ...prev, view: "tree" }),
				replace: true,
			});
		}
	}, [search.view, storedView, navigate]);
	const changeView = (view: View) => {
		setStoredView(view);
		navigate({ search: (prev) => ({ ...prev, view }) });
	};

	// Every status in scope: its meta.counts drive the status cards, the
	// panel badges and the top bar's total (counts ignore the status filter).
	const base: MissionListParams = {
		origin: search.origin,
		q: search.q,
		sort: search.sort,
		includeArchived: includesArchived(search),
		// Only when the URL overrides the sort's own direction, so the default
		// keeps one key and one cache entry.
		...(search.direction ? { direction: search.direction } : {}),
	};
	const scope = useMissionList(base);
	const counts = countsOf(scope);
	const total = counts
		? Object.values(counts.byStatus).reduce((sum, n) => sum + n, 0)
		: undefined;
	const firstRun = total === 0 && search.q === "";

	const open = useCallback(
		(mission: MissionListItem) =>
			navigate({ search: (prev) => ({ ...prev, mission: mission.id }) }),
		[navigate],
	);
	const close = useCallback(
		() => navigate({ search: (prev) => ({ ...prev, mission: undefined }) }),
		[navigate],
	);

	// The table's own scope: one status, the needs-you lens, or everything.
	// Built to equal the panels' and the scope's keys, so the same list is
	// never fetched twice under two spellings.
	const tableParams: MissionListParams =
		search.status === "all"
			? base
			: search.status === "needs-you"
				? { ...base, needsYou: true }
				: { ...base, status: [search.status] };

	return (
		<Page
			to="/missions"
			subtitle={
				total === undefined
					? undefined
					: total === 1
						? "1 mission"
						: `${total} missions`
			}
			actions={
				<Button
					size="sm"
					data-testid="missions-new"
					disabledReason={NOT_YET["mission.create"]}
				>
					<Plus aria-hidden="true" />
					New mission
				</Button>
			}
		>
			<div data-testid="missions-page" className="pt-2">
				<MissionsDashboard
					base={base}
					counts={counts}
					status={search.status}
					includeArchived={includesArchived(search)}
					now={now}
					onStatus={(status) =>
						navigate({ search: (prev) => ({ ...prev, status }) })
					}
					onOpen={open}
					missions={
						// The full list is a panel of the page's grid: its header
						// carries the count and the list's toolbar; the status groups
						// sit inside it as sub-sections.
						<DataPanel
							data-testid="missions-list"
							title="Missions"
							count={total}
							toolbar={<MissionFilterBar onViewChange={changeView} />}
							footer={
								scope.status === "success" ? (
									<ReadAge
										data-testid="missions-list-read-age"
										readAt={scope.dataUpdatedAt}
										staleAfterMs={QUERY_STALE_MS}
										onRefresh={() => scope.refetch()}
										refreshing={scope.isFetching}
									/>
								) : undefined
							}
						>
							{firstRun ? (
								<EmptyState
									data-testid="missions-first-run"
									icon={Target}
									title={
										search.origin === "client"
											? "No client missions yet"
											: "No internal missions yet"
									}
									description="Missions appear here as they are created, grouped by where each one stands."
								/>
							) : (
								// biome-ignore lint/a11y/noStaticElementInteractions: J and K move between the rows inside; the rows are the controls.
								<div
									data-testid="missions-views"
									className="flex flex-col"
									onKeyDown={moveBetweenRows}
								>
									{search.view === "tree" ? (
										<MissionTree
											params={tableParams}
											now={now}
											selectedId={search.mission}
											onOpen={open}
											nested
										/>
									) : (
										<MissionPanels
											params={base}
											counts={counts}
											now={now}
											onOpen={open}
											nested
										/>
									)}
								</div>
							)}
						</DataPanel>
					}
				/>
				{/* A drawer over the page, never a column that reflows the grid.
				    ?mission opens it; Esc and the close button clear it. */}
				{search.mission ? (
					<MissionDetails
						key={search.mission}
						id={search.mission}
						now={now}
						onClose={close}
					/>
				) : null}
			</div>
		</Page>
	);
}
