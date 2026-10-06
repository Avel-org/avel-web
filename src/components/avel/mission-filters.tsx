import { getRouteApi } from "@tanstack/react-router";
import type { missionStatusCounts } from "avel-server/contract";
import {
	ArrowDownWideNarrow,
	ArrowUpNarrowWide,
	LayoutList,
	ListTree,
	Search,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import type { z } from "zod";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { MISSION_STATUS_TONE } from "./mission-columns";
import {
	type Direction,
	includesArchived,
	NEEDS_YOU,
	ORIGIN_LABEL,
	ORIGINS,
	SORT_DIRECTION,
	SORT_LABEL,
	SORTS,
	type Sort,
	STATUS_ORDER,
	STATUS_PANEL,
	type StatusFilter,
	type View,
} from "./mission-search";
import { StatusGlyph, type StatusTone } from "./status-pill";

const route = getRouteApi("/missions");

/** How long typing pauses before the search is written to the URL. */
const SEARCH_DEBOUNCE_MS = 250;

/** meta.counts from missions.list: every status, whatever the status filter. */
export type MissionCounts = {
	byStatus: z.infer<typeof missionStatusCounts>;
	needsYou: number;
};

/**
 * The status strip: All, Needs you, and one chip per status, each with its
 * count from meta.counts (which ignores the status filter, so every chip
 * keeps its number while one is chosen). Until counts arrive, each says "—",
 * never a zero it cannot vouch for. The pressed chip is the URL's `status`.
 * Archived appears only while archived missions are included.
 */
export function MissionStatusStrip({ counts }: { counts?: MissionCounts }) {
	const search = route.useSearch();
	const navigate = route.useNavigate();
	const total = counts
		? Object.values(counts.byStatus).reduce((sum, n) => sum + n, 0)
		: undefined;
	const chips: {
		id: StatusFilter;
		label: string;
		tone: StatusTone | null;
		count?: number;
	}[] = [
		{ id: "all", label: "All", tone: null, count: total },
		{
			id: "needs-you",
			label: NEEDS_YOU.label,
			tone: "warn",
			count: counts?.needsYou,
		},
		...STATUS_ORDER.filter(
			(status) => status !== "archived" || includesArchived(search),
		).map((status) => ({
			id: status,
			label: STATUS_PANEL[status].label,
			tone: MISSION_STATUS_TONE[status],
			count: counts?.byStatus[status],
		})),
	];

	return (
		<fieldset
			data-testid="missions-status-strip"
			// min-w-0: a fieldset is min-content wide by default, which would stop
			// the strip scrolling sideways on a phone.
			className="no-scrollbar -mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0"
		>
			<legend className="sr-only">Filter by status</legend>
			{chips.map((chip) => (
				<button
					key={chip.id}
					type="button"
					aria-pressed={search.status === chip.id}
					data-testid={`missions-status-${chip.id}`}
					onClick={() =>
						navigate({ search: (prev) => ({ ...prev, status: chip.id }) })
					}
					className="inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-border px-3 type-small whitespace-nowrap text-text-muted transition-colors duration-(--duration-micro) ease-avel hover:bg-state-hover hover:text-foreground aria-pressed:border-transparent aria-pressed:bg-state-selected aria-pressed:text-foreground"
				>
					{chip.tone ? <StatusGlyph tone={chip.tone} /> : null}
					{chip.label}
					<span
						data-testid={`missions-status-${chip.id}-count`}
						className="type-mono-small text-text-subtle"
					>
						{chip.count === undefined ? (
							<>
								<span aria-hidden="true">—</span>
								<span className="sr-only">, count not available</span>
							</>
						) : (
							chip.count
						)}
					</span>
				</button>
			))}
		</fieldset>
	);
}

/**
 * The direction after a flip. Flipping back to the sort's own direction
 * returns undefined, so the URL loses the parameter and the plain link stays
 * plain.
 */
export function flipDirection(
	sort: Sort,
	direction: Direction | undefined,
): Direction | undefined {
	const shown = direction ?? SORT_DIRECTION[sort];
	const flipped: Direction = shown === "asc" ? "desc" : "asc";
	return flipped === SORT_DIRECTION[sort] ? undefined : flipped;
}

/**
 * A segmented control of pressed buttons: a pill track with pill segments.
 * `trailing` sits inside the same track after a hairline divider, for a
 * control that belongs to the choice (Sort's direction).
 */
function Segmented<T extends string>({
	legend,
	options,
	value,
	onChange,
	testId,
	trailing,
}: {
	legend: string;
	options: readonly { value: T; label: string; icon?: typeof Search }[];
	value: T;
	onChange: (next: T) => void;
	testId: string;
	trailing?: ReactNode;
}) {
	return (
		<fieldset
			data-testid={testId}
			className="field-inset inline-flex h-9 min-w-0 shrink-0 items-center gap-0.5 rounded-full border border-border bg-app-band p-0.5"
		>
			<legend className="sr-only">{legend}</legend>
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					aria-pressed={value === option.value}
					data-testid={`${testId}-${option.value}`}
					onClick={() => onChange(option.value)}
					// 6px outer radius minus 2px padding: concentric at 4px.
					className="inline-flex h-full items-center gap-1.5 rounded-full px-3.5 type-small aria-pressed:surface-steel text-text-muted transition-colors duration-(--duration-micro) ease-avel hover:text-foreground aria-pressed:bg-card aria-pressed:font-medium aria-pressed:text-foreground aria-pressed:shadow-e1 [&>svg]:size-4"
				>
					{option.icon ? <option.icon aria-hidden="true" /> : null}
					{option.label}
				</button>
			))}
			{trailing ? (
				<>
					<span
						aria-hidden="true"
						className="mx-0.5 h-4 w-px bg-border-strong"
					/>
					{trailing}
				</>
			) : null}
		</fieldset>
	);
}

/**
 * Client or Internal, never both: internal missions are benchmarks and are
 * never listed with client work (DATA-CONTRACTS-V2.md, Mission.origin).
 */
export function MissionOriginSwitch() {
	const { origin } = route.useSearch();
	const navigate = route.useNavigate();
	return (
		<Segmented
			legend="Mission origin"
			testId="missions-origin"
			options={ORIGINS.map((value) => ({ value, label: ORIGIN_LABEL[value] }))}
			value={origin}
			onChange={(value) =>
				navigate({ search: (prev) => ({ ...prev, origin: value }) })
			}
		/>
	);
}

const VIEW_OPTIONS = [
	{ value: "grouped", label: "Grouped", icon: LayoutList },
	{ value: "tree", label: "Tree", icon: ListTree },
] as const satisfies readonly {
	value: View;
	label: string;
	icon: typeof Search;
}[];

/**
 * Search, origin, archived, view and sort. The search writes `q` to the URL
 * after typing pauses, replacing history rather than adding an entry per
 * keystroke. Sort is avel-server's: each key has the one direction it sorts
 * in. On a phone the bar stacks.
 */
export function MissionFilterBar({
	onViewChange,
}: {
	/** The page also remembers the view per viewer. */
	onViewChange: (view: View) => void;
}) {
	const { q, sort, archived, view, direction } = route.useSearch();
	const shown = direction ?? SORT_DIRECTION[sort];
	const navigate = route.useNavigate();
	const inputId = useId();
	const archivedId = useId();
	const [draft, setDraft] = useState(q);

	// A link or the back button changed `q`: show it.
	useEffect(() => setDraft(q), [q]);

	useEffect(() => {
		const next = draft.trim();
		if (next === q) return;
		const timer = window.setTimeout(
			() =>
				navigate({
					search: (prev) => ({ ...prev, q: next }),
					replace: true,
				}),
			SEARCH_DEBOUNCE_MS,
		);
		return () => window.clearTimeout(timer);
	}, [draft, q, navigate]);

	return (
		<div
			data-testid="missions-filter-bar"
			className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center"
		>
			<div className="relative min-w-0 flex-1 md:max-w-sm">
				<label htmlFor={inputId} className="sr-only">
					Search missions
				</label>
				<Search
					aria-hidden="true"
					className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-subtle"
				/>
				<Input
					id={inputId}
					type="search"
					data-testid="missions-search"
					placeholder="Search by client, engagement or type"
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					className="pl-9"
				/>
			</div>
			<MissionOriginSwitch />
			<div className="flex h-9 items-center gap-2">
				<Switch
					id={archivedId}
					data-testid="missions-archived"
					checked={archived}
					onCheckedChange={(checked) =>
						navigate({ search: (prev) => ({ ...prev, archived: checked }) })
					}
				/>
				<label htmlFor={archivedId} className="type-small text-text-muted">
					Show archived
				</label>
			</div>
			<div className="flex flex-wrap items-center gap-2 md:ml-auto">
				<Segmented
					legend="View"
					testId="missions-view"
					options={VIEW_OPTIONS}
					value={view}
					onChange={onViewChange}
				/>
				<Segmented
					legend="Sort missions"
					testId="missions-sort"
					options={SORTS.map((value) => ({ value, label: SORT_LABEL[value] }))}
					value={sort}
					onChange={(value) =>
						navigate({
							// A new sort starts in its own direction.
							search: (prev) => ({
								...prev,
								sort: value,
								direction: undefined,
							}),
						})
					}
					trailing={
						// The sort's direction, as the track's last segment. Flipping
						// back to the sort's own direction leaves the URL, so the
						// default link stays plain.
						<button
							type="button"
							data-testid="missions-direction"
							aria-label={
								shown === "asc"
									? "Sorted ascending. Sort descending"
									: "Sorted descending. Sort ascending"
							}
							onClick={() =>
								navigate({
									search: (prev) => ({
										...prev,
										direction: flipDirection(sort, direction),
									}),
								})
							}
							className="inline-flex aspect-square h-full items-center justify-center rounded-full text-text-muted transition-colors duration-(--duration-micro) ease-avel hover:bg-state-hover hover:text-foreground [&>svg]:size-4"
						>
							{shown === "asc" ? (
								<ArrowUpNarrowWide aria-hidden="true" />
							) : (
								<ArrowDownWideNarrow aria-hidden="true" />
							)}
						</button>
					}
				/>
			</div>
		</div>
	);
}
