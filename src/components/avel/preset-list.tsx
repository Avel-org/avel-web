import { Link } from "@tanstack/react-router";
import type { Preset } from "avel-server/contract";
import { Search, SearchX } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { listTotal } from "@/lib/api/clients";
import {
	agentCount,
	CUT_LABEL,
	loadedPresets,
	PRESET_SEARCH_MAX,
	type PresetCut,
	presetSearchText,
	type usePresets,
} from "@/lib/api/presets";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";
import { ErrorState, Surface } from "./surface";

/** The search writes to the URL this long after the last keystroke. */
const PRESET_SEARCH_DEBOUNCE_MS = 300;

const CUTS: PresetCut[] = ["horizontal", "vertical"];

/**
 * The table view's left pane: the presets, a page at a time (the search
 * and cut filter sit in the page's toolbar). Each row is a link (?preset=<id>, keeping the filters), so a
 * selected preset is a link. The route owns the query; this renders it.
 */
export function PresetListPane({
	query,
	search,
	cut,
	selectedId,
	onClearFilters,
}: {
	query: ReturnType<typeof usePresets>;
	/** The settled search, or undefined for none. */
	search: string | undefined;
	cut: PresetCut | undefined;
	selectedId: string | undefined;
	onClearFilters: () => void;
}) {
	return (
		<section
			aria-label="Teams"
			data-testid="preset-pane"
			className="flex min-h-0 flex-col gap-3"
		>
			<Surface
				data-testid="preset-list"
				query={query}
				isEmpty={(data) => loadedPresets(data).length === 0}
				loading={<PresetListSkeleton />}
				// First run (no presets at all) is the page's to show; here an
				// empty list is always a search or cut that matched nothing.
				empty={
					<EmptyState
						data-testid="presets-no-match"
						compact
						icon={SearchX}
						title="No teams match"
						description={noMatchCopy(search, cut)}
						action={
							<Button
								size="sm"
								variant="outline"
								data-testid="presets-clear-filters"
								onClick={onClearFilters}
							>
								Clear filters
							</Button>
						}
					/>
				}
				error={ErrorState}
			>
				{(data) => (
					<div className="flex flex-col gap-2">
						<PresetRows
							presets={loadedPresets(data)}
							selectedId={selectedId}
							search={search}
							cut={cut}
						/>
						<ListFooter
							loaded={loadedPresets(data).length}
							total={listTotal(data)}
							hasMore={query.hasNextPage}
							loadingMore={query.isFetchingNextPage}
							onLoadMore={() => query.fetchNextPage()}
						/>
					</div>
				)}
			</Surface>
		</section>
	);
}

/** Says which filters matched nothing, so Clear filters is the obvious next step. */
export function noMatchCopy(
	search: string | undefined,
	cut: PresetCut | undefined,
): string {
	const q = presetSearchText(search);
	const cutText = cut ? `${CUT_LABEL[cut].toLowerCase()} ` : "";
	return q === undefined
		? `There are no ${cutText}teams.`
		: `No ${cutText}team's name contains “${q}”.`;
}

/**
 * Searches presets by name. The URL's `?q` is the source of truth, so a
 * search is a link; typing updates it after a short pause.
 */
export function PresetSearch({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) {
	const id = useId();
	const [text, setText] = useState(value);
	const latest = useRef(onChange);
	latest.current = onChange;

	// Follows the URL when it changes from outside, such as Clear filters.
	useEffect(() => setText(value), [value]);

	useEffect(() => {
		if (text === value) return;
		const timer = window.setTimeout(
			() => latest.current(text),
			PRESET_SEARCH_DEBOUNCE_MS,
		);
		return () => window.clearTimeout(timer);
	}, [text, value]);

	return (
		<div className="relative">
			<label htmlFor={id} className="sr-only">
				Search teams
			</label>
			<Search
				aria-hidden="true"
				className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-subtle"
			/>
			<Input
				id={id}
				type="search"
				data-testid="presets-search"
				placeholder="Search by name"
				maxLength={PRESET_SEARCH_MAX}
				value={text}
				onChange={(event) => setText(event.target.value)}
				className="pl-8"
			/>
		</div>
	);
}

/** All, Horizontal or Vertical: one pressed at a time, as the URL's `?cut`. */
export function CutFilter({
	value,
	onChange,
}: {
	value: PresetCut | undefined;
	onChange: (cut: PresetCut | undefined) => void;
}) {
	const options: { cut: PresetCut | undefined; label: string; id: string }[] = [
		{ cut: undefined, label: "All", id: "all" },
		...CUTS.map((cut) => ({ cut, label: CUT_LABEL[cut], id: cut })),
	];
	return (
		<fieldset data-testid="presets-cut" className="flex gap-1">
			<legend className="sr-only">Cut</legend>
			{options.map((option) => (
				<Button
					key={option.id}
					variant="ghost"
					size="sm"
					aria-pressed={value === option.cut}
					data-testid={`presets-cut-${option.id}`}
					onClick={() => onChange(option.cut)}
					className="aria-pressed:bg-state-selected"
				>
					{option.label}
				</Button>
			))}
		</fieldset>
	);
}

/**
 * The rows: links, so Enter and a click both select, and the selection is a
 * URL. Up and Down move between rows; Home and End jump to the ends.
 */
function PresetRows({
	presets,
	selectedId,
	search,
	cut,
}: {
	presets: Preset[];
	selectedId: string | undefined;
	search: string | undefined;
	cut: PresetCut | undefined;
}) {
	const move = (event: KeyboardEvent<HTMLUListElement>) => {
		const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
		if (!keys.includes(event.key)) return;
		const links = [
			...event.currentTarget.querySelectorAll<HTMLAnchorElement>("a"),
		];
		const at = links.indexOf(document.activeElement as HTMLAnchorElement);
		const next =
			event.key === "Home"
				? 0
				: event.key === "End"
					? links.length - 1
					: event.key === "ArrowDown"
						? Math.min(at + 1, links.length - 1)
						: Math.max(at - 1, 0);
		event.preventDefault();
		links[next]?.focus();
	};

	return (
		<ul
			aria-label="Teams"
			data-testid="preset-rows"
			className="flex flex-col gap-0.5"
			onKeyDown={move}
		>
			{presets.map((preset) => {
				const selected = preset.id === selectedId;
				return (
					<li key={preset.id}>
						<Link
							to="/presets"
							search={{ q: search, cut, preset: preset.id }}
							data-testid={`preset-row-${preset.id}`}
							// The router marks the active link aria-current="page" itself.
							data-selected={selected || undefined}
							className={cn(
								"focus-inset relative flex flex-col gap-1 rounded-sm px-3 py-2 transition-colors duration-(--duration-micro) ease-avel hover:bg-state-hover",
								selected &&
									"bg-state-selected before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-accent hover:bg-state-selected",
							)}
						>
							<span className="flex items-center gap-2">
								<span className="type-body min-w-0 flex-1 truncate font-medium text-foreground">
									{preset.name}
								</span>
								<Badge variant="tag" data-testid={`preset-cut-${preset.id}`}>
									{CUT_LABEL[preset.cut]}
								</Badge>
							</span>
							<span className="type-mono-small text-text-muted">
								{`${agentCount(preset.agents.length)} · v${preset.version}`}
							</span>
						</Link>
					</li>
				);
			})}
		</ul>
	);
}

/** How much of the list is loaded, and a way to load the rest. */
function ListFooter({
	loaded,
	total,
	hasMore,
	loadingMore,
	onLoadMore,
}: {
	loaded: number;
	total: number | undefined;
	hasMore: boolean;
	loadingMore: boolean;
	onLoadMore: () => void;
}) {
	if (total === undefined && !hasMore) return null;
	return (
		<div className="flex items-center justify-between gap-2 px-3">
			{total === undefined ? (
				<span />
			) : (
				<p
					data-testid="presets-showing"
					className="type-caption text-text-subtle tabular-nums"
				>
					{`Showing ${loaded} of ${total}`}
				</p>
			)}
			{hasMore ? (
				<Button
					variant="ghost"
					size="sm"
					data-testid="presets-load-more"
					disabled={loadingMore}
					onClick={onLoadMore}
				>
					{loadingMore ? "Loading" : "Load more"}
				</Button>
			) : null}
		</div>
	);
}

/** Three rows in the list's real shape: few, so it does not promise many. */
function PresetListSkeleton() {
	return (
		<div data-testid="preset-list-skeleton" className="flex flex-col gap-0.5">
			{[0, 1, 2].map((i) => (
				<div
					key={i}
					data-testid="preset-list-skeleton-row"
					className="flex flex-col gap-1.5 px-3 py-2"
				>
					<span className="flex items-center gap-2">
						<Skeleton className="h-4 flex-1" />
						<Skeleton className="h-5 w-16 rounded-xs" />
					</span>
					<Skeleton className="h-3 w-28" />
				</div>
			))}
		</div>
	);
}
