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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { tabsListVariants } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
	type Direction,
	ORIGIN_LABEL,
	ORIGINS,
	SORT_DIRECTION,
	SORT_LABEL,
	SORTS,
	type Sort,
	type View,
} from "./mission-search";

const route = getRouteApi("/missions");

/** How long typing pauses before the search is written to the URL. */
const SEARCH_DEBOUNCE_MS = 250;

/** meta.counts from missions.list: every status, whatever the status filter. */
export type MissionCounts = {
	byStatus: z.infer<typeof missionStatusCounts>;
	needsYou: number;
};

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
			className={cn(
				tabsListVariants({ variant: "default" }),
				"min-w-0 shrink-0",
			)}
		>
			<legend className="sr-only">{legend}</legend>
			{options.map((option) => (
				<Button
					key={option.value}
					type="button"
					variant="segment"
					aria-pressed={value === option.value}
					data-testid={`${testId}-${option.value}`}
					onClick={() => onChange(option.value)}
				>
					{option.icon ? <option.icon aria-hidden="true" /> : null}
					{option.label}
				</Button>
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
			// The Missions panel's header toolbar: one row of controls that
			// wraps, never a bar of its own.
			className="flex min-w-0 flex-wrap items-center gap-2"
		>
			<div className="relative w-full min-w-0 sm:w-56">
				{/* The short placeholder fits the toolbar; the label and the
				    title carry what it matches. */}
				<label htmlFor={inputId} className="sr-only">
					Search missions by client, engagement or type
				</label>
				<Search
					aria-hidden="true"
					className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-subtle"
				/>
				<Input
					id={inputId}
					type="search"
					data-testid="missions-search"
					placeholder="Search missions"
					title="Search by client, engagement or type"
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
			<div className="flex flex-wrap items-center gap-2">
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
						<Button
							type="button"
							variant="segment"
							data-testid="missions-direction"
							className="px-1.5"
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
						>
							{shown === "asc" ? (
								<ArrowUpNarrowWide aria-hidden="true" />
							) : (
								<ArrowDownWideNarrow aria-hidden="true" />
							)}
						</Button>
					}
				/>
			</div>
		</div>
	);
}
