import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import type { MissionListItem } from "avel-server/contract";
import { Plus, Target } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/avel/empty-state";
import {
	countsOf,
	type MissionListParams,
	useMissionList,
} from "@/components/avel/mission-data";
import { MissionDetails } from "@/components/avel/mission-details";
import {
	MissionFilterBar,
	MissionStatusStrip,
} from "@/components/avel/mission-filters";
import { MissionPanels } from "@/components/avel/mission-panels";
import {
	includesArchived,
	MISSION_SEARCH_DEFAULTS,
	missionSearch,
	VIEWS,
	type View,
} from "@/components/avel/mission-search";
import { MissionTree } from "@/components/avel/mission-tree";
import { GoingQuiet, InFlight } from "@/components/avel/mission-watch";
import { Button } from "@/components/ui/button";
import { useStoredState } from "@/lib/stored";
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

/** md and up, where the details panel sits beside the list. */
function useIsDesktop(): boolean {
	const [desktop, setDesktop] = useState(true);
	useEffect(() => {
		const query = window.matchMedia("(min-width: 48rem)");
		const update = () => setDesktop(query.matches);
		update();
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	}, []);
	return desktop;
}

/** The time relative times are measured from, moved on each minute. */
function useNow(): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 60_000);
		return () => window.clearInterval(timer);
	}, []);
	return now;
}

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
 * Missions, by where they stand (ROUTES.md, /missions): the status strip and
 * filters, then the missions grouped into panels or as one table, and the
 * details of the one chosen, beside the list or, on a phone, over it.
 * Everything filtering or choosing lives in the URL.
 */
function MissionsPage() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const desktop = useIsDesktop();
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

	// Every status in scope: its meta.counts drive the strip, the panel
	// badges and the top bar's total (counts ignore the status filter).
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
					disabledReason="Needs mission.create in the contract"
				>
					<Plus aria-hidden="true" />
					New mission
				</Button>
			}
		>
			<div data-testid="missions-page" className="flex flex-col gap-4 pt-2">
				<MissionStatusStrip counts={counts} />
				<MissionFilterBar onViewChange={changeView} />
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
					<div
						data-testid="missions-layout"
						className={
							search.mission && desktop
								? "grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_24rem]"
								: "flex flex-col"
						}
					>
						{/* biome-ignore lint/a11y/noStaticElementInteractions: J and K
						    move between the rows inside; the rows are the controls. */}
						<div
							data-testid="missions-views"
							className="flex flex-col gap-4"
							onKeyDown={moveBetweenRows}
						>
							{/* What to keep an eye on, above both views. A status filter
							    narrows the page to one status, so they step aside.
							    Stacked full width, never side by side: their rows then
							    share the tree's and panels' edges and columns, and a
							    collapsed strip shrinks to its header. Side by side, a
							    grid row stretched a collapsed strip to its sibling's
							    height, so collapsing looked like the rows vanishing. */}
							{search.status === "all" ? (
								<div
									data-testid="missions-watch"
									className="flex flex-col gap-4"
								>
									<GoingQuiet params={base} now={now} onOpen={open} />
									<InFlight params={base} now={now} onOpen={open} />
								</div>
							) : null}
							{search.view === "tree" ? (
								<MissionTree
									params={tableParams}
									now={now}
									selectedId={search.mission}
									onOpen={open}
								/>
							) : (
								<MissionPanels
									params={base}
									counts={counts}
									now={now}
									onOpen={open}
								/>
							)}
						</div>
						{search.mission ? (
							<MissionDetails
								key={search.mission}
								id={search.mission}
								desktop={desktop}
								now={now}
								onClose={close}
							/>
						) : null}
					</div>
				)}
			</div>
		</Page>
	);
}
