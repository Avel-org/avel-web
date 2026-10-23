import { getRouteApi } from "@tanstack/react-router";
import type { MissionListItem, MissionStatus } from "avel-server/contract";
import { ChevronRight } from "lucide-react";
import { type ReactNode, useId, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStoredState } from "@/lib/stored";
import { cn } from "@/lib/utils";
import { DataPanel, type DataPanelTone } from "./data-panel";
import { DataTable } from "./data-table";
import { MissionCard, missionColumns, needsYouColumn } from "./mission-columns";
import {
	asSurface,
	type MissionList,
	type MissionListParams,
	rowsOf,
	totalOf,
	useMissionList,
} from "./mission-data";
import type { MissionCounts } from "./mission-filters";
import {
	NEEDS_YOU,
	STATUS_PANEL,
	showsNeedsYou,
	visibleStatuses,
} from "./mission-search";
import { StatusGlyph, TONE_TEXT } from "./status-pill";
import { ErrorState, Surface } from "./surface";

const route = getRouteApi("/missions");

/** A panel on the Missions page: one status, or the needs-you lens. */
export type PanelId = "needs-you" | MissionStatus;

/**
 * Where a panel remembers being open or closed, per viewer. Every viewer
 * preference shares the `avel.` namespace, beside avel.theme and avel.sidebar.
 */
export function panelStorageKey(panel: PanelId): string {
	return `avel.missions.panel.${panel}`;
}

/** A content-shaped placeholder: mission rows, at the real row height. */
export function MissionRowsSkeleton({
	rows,
	testId,
}: {
	rows: number;
	testId: string;
}) {
	return (
		<div data-testid={testId} className="flex flex-col divide-y divide-border">
			{/* A mission row's shape (v3 UX 8, .skel-row): its subject, the
			    status pill (.skel-pill) and the time column at the end.
			    Placeholders in a fixed order: the position is their identity. */}
			{Array.from({ length: rows }, (_, i) => `row-${i}`).map((key) => (
				<div
					key={key}
					data-testid={`${testId}-row`}
					className="flex h-10 items-center gap-3 px-4"
				>
					<Skeleton className="h-3 w-40" />
					<Skeleton className="h-3 w-16" />
					<Skeleton
						data-testid={`${testId}-pill`}
						className="h-[22px] w-16 rounded-sm"
					/>
					<Skeleton className="ml-auto h-3 w-24" />
				</div>
			))}
		</div>
	);
}

/**
 * The next page, when there is one, with how many rows are shown of how many
 * the list's own filters keep (meta.total: exact, the same on every page).
 */
export function LoadMore({
	list,
	testId,
}: {
	list: MissionList;
	testId: string;
}) {
	if (!list.hasNextPage) return null;
	return (
		<div
			data-testid={testId}
			className="flex items-center justify-between gap-2 border-t border-border px-4 py-2"
		>
			<span className="type-caption text-text-subtle tabular-nums">
				{`Showing ${rowsOf(list).length} of ${totalOf(list) ?? "—"}`}
			</span>
			<Button
				variant="ghost"
				size="sm"
				data-testid={`${testId}-button`}
				disabled={list.isFetchingNextPage}
				onClick={() => list.fetchNextPage()}
			>
				{list.isFetchingNextPage ? "Loading" : "Load more"}
			</Button>
		</div>
	);
}

/**
 * Missions grouped by where they stand: Needs you first (the server derives
 * it from the last export, so it cuts across statuses), then one panel per
 * status in the order an operator acts on them. Each panel pages its own
 * query; its badge is the status's count from meta.counts. A status filter
 * shows only its panel.
 *
 * `nested`, inside a panel that already frames the list (the Missions page's
 * Missions panel), sets each group as a sub-section instead: an eyebrow
 * heading and a hairline, never a panel inside a panel.
 */
export function MissionPanels({
	params,
	counts,
	now,
	onOpen,
	nested = false,
}: {
	/** The page's filters, without a status: each panel adds its own. */
	params: MissionListParams;
	counts?: MissionCounts;
	now: number;
	onOpen: (mission: MissionListItem) => void;
	nested?: boolean;
}) {
	const search = route.useSearch();
	return (
		<div
			data-testid="missions-panels"
			data-nested={nested || undefined}
			className={cn(
				"flex flex-col",
				nested ? "divide-y divide-border" : "gap-4",
			)}
		>
			{/* Nested in the Missions page's grid, the side column's Needs you
			    panel already lists these, so the list starts at the statuses;
			    pressing the Needs you card still narrows it to them. */}
			{showsNeedsYou(search.status) && !(nested && search.status === "all") ? (
				<MissionPanel
					panel="needs-you"
					title={NEEDS_YOU.label}
					tone={NEEDS_YOU.tone}
					defaultOpen={NEEDS_YOU.defaultOpen}
					params={{ ...params, needsYou: true }}
					count={counts?.needsYou}
					empty="Nothing needs you right now."
					now={now}
					onOpen={onOpen}
					nested={nested}
				/>
			) : null}
			{visibleStatuses(search).map((status) => (
				<MissionPanel
					key={status}
					panel={status}
					title={STATUS_PANEL[status].label}
					tone={STATUS_PANEL[status].tone}
					defaultOpen={STATUS_PANEL[status].defaultOpen}
					params={{ ...params, status: [status] }}
					count={counts?.byStatus[status]}
					empty={`No ${STATUS_PANEL[status].label.toLowerCase()} missions.`}
					now={now}
					onOpen={onOpen}
					nested={nested}
				/>
			))}
		</div>
	);
}

function MissionPanel({
	panel,
	title,
	tone,
	defaultOpen,
	params,
	count,
	empty,
	now,
	onOpen,
	nested,
}: {
	panel: PanelId;
	title: string;
	tone: DataPanelTone;
	defaultOpen: boolean;
	params: MissionListParams;
	count?: number;
	empty: string;
	now: number;
	onOpen: (mission: MissionListItem) => void;
	nested: boolean;
}) {
	const list = useMissionList(params);
	const testId = `missions-panel-${panel}`;
	// A status panel needs no status column: the panel says it. The needs-you
	// lens keeps it, and adds why, except nested in the narrower Missions
	// panel, where why repeats the last export's pill.
	const columns = useMemo(() => {
		const all = missionColumns(now);
		if (panel !== "needs-you")
			return all.filter((column) => column.id !== "status");
		return nested ? all : [...all, needsYouColumn()];
	}, [now, panel, nested]);

	const Group = nested ? SubSection : DataPanel;
	return (
		<Group
			data-testid={testId}
			title={title}
			tone={tone}
			count={count}
			defaultOpen={defaultOpen}
			storageKey={panelStorageKey(panel)}
		>
			<Surface
				data-testid={`${testId}-list`}
				query={asSurface(list)}
				// Nested, the Missions panel's footer says when the list was
				// read; a read age per group would repeat it.
				freshness={nested ? undefined : {}}
				loading={<MissionRowsSkeleton rows={3} testId={`${testId}-skeleton`} />}
				empty={
					<p
						data-testid={`${testId}-empty`}
						className="px-4 py-6 text-center type-small text-text-subtle"
					>
						{empty}
					</p>
				}
				error={ErrorState}
			>
				{(rows) => (
					<>
						<DataTable
							data-testid={`${testId}-table`}
							label={`${title} missions`}
							columns={columns}
							rows={rows}
							getRowId={(mission) => mission.id}
							density="compact"
							// Nested, the table scrolls sideways inside the panel
							// rather than being clipped by it; a sticky header
							// would make the page its scroll scope instead.
							stickyHeader={!nested}
							onRowClick={onOpen}
							renderCard={(mission) => (
								<MissionCard mission={mission} now={now} />
							)}
						/>
						<LoadMore list={list} testId={`${testId}-more`} />
					</>
				)}
			</Surface>
		</Group>
	);
}

/**
 * A group inside a panel: the eyebrow heading with the group's glyph and
 * count, a hairline above it (from the list's dividers), and the same
 * collapse as a panel's, remembered under the same key.
 */
function SubSection({
	title,
	count,
	tone,
	defaultOpen,
	storageKey,
	children,
	"data-testid": testId,
}: {
	title: string;
	count?: number;
	tone: DataPanelTone;
	defaultOpen: boolean;
	storageKey: string;
	children: ReactNode;
	"data-testid": string;
}) {
	const bodyId = useId();
	const titleId = useId();
	const [stored, setStored] = useStoredState(
		storageKey,
		defaultOpen ? "open" : "closed",
		["open", "closed"] as const,
	);
	const open = stored === "open";
	return (
		<section
			data-testid={testId}
			data-state={open ? "open" : "closed"}
			aria-labelledby={titleId}
		>
			<button
				type="button"
				data-testid={`${testId}-toggle`}
				aria-expanded={open}
				aria-controls={bodyId}
				onClick={() => setStored(open ? "closed" : "open")}
				className="focus-inset flex h-10 w-full items-center gap-2 px-4 text-left transition-colors duration-(--duration-micro) ease-avel hover:bg-app-raised"
			>
				<ChevronRight
					aria-hidden="true"
					className={cn(
						"size-3.5 shrink-0 text-text-subtle transition-transform duration-(--duration-state) ease-avel",
						open && "rotate-90",
					)}
				/>
				{tone === "neutral" ? null : (
					<StatusGlyph tone={tone} className={TONE_TEXT[tone]} />
				)}
				<h3 id={titleId} className="type-eyebrow">
					{title}
				</h3>
				<Badge variant="count" data-testid={`${testId}-count`}>
					{count === undefined ? "—" : count}
				</Badge>
			</button>
			<div
				id={bodyId}
				data-testid={`${testId}-body`}
				inert={!open}
				className={cn(
					"grid grid-cols-[minmax(0,1fr)] transition-[grid-template-rows] duration-(--duration-state) ease-avel",
					open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
				)}
			>
				<div className="min-h-0 min-w-0 overflow-clip">{children}</div>
			</div>
		</section>
	);
}
