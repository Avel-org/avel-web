import { Link } from "@tanstack/react-router";
import type { Preset } from "avel-server/contract";
import { Check, ChevronsUpDown, GitCompareArrows, Plus } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	agentCount,
	CUT_LABEL,
	loadedPresets,
	presetSearchText,
	usePresets,
} from "@/lib/api/presets";
import { cn } from "@/lib/utils";
import { COMPARE_FULL } from "./preset-board";
import { SearchField } from "./search-field";

/*
 * The team switcher at the head of the composer's canvas: a button naming
 * the selected team, its cut and version, that opens a searchable list of
 * teams with New team at its foot. It replaces the rail, so the canvas has
 * the page's whole width. Selection is the URL's `?preset`: each team is a
 * link. Compare stays a toggle on each row.
 */

export function TeamSwitcher({
	presets,
	selected,
	hasMore,
	loadingMore,
	onLoadMore,
	onNew,
	comparing,
	onToggleCompare,
}: {
	presets: readonly Preset[];
	/** Null when the URL's team could not be read: the switcher is the way out. */
	selected: Preset | null;
	hasMore: boolean;
	loadingMore: boolean;
	onLoadMore: () => void;
	onNew: () => void;
	comparing: readonly string[];
	onToggleCompare: (preset: Preset) => void;
}) {
	const [open, setOpen] = useState(false);
	// A search goes to the server: the pages loaded so far are not every team.
	const [query, setQuery] = useState("");
	const text = presetSearchText(query);
	const found = usePresets(text);
	const searching = text !== undefined;
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					role="combobox"
					aria-expanded={open}
					aria-haspopup="listbox"
					aria-label={
						selected ? `Team: ${selected.name}. Switch team` : "Choose a team"
					}
					data-testid="preset-switcher"
					className="field-surface inline-flex h-control-lg min-w-0 max-w-full items-center gap-2 rounded-control px-3 text-left transition-[background-color,border-color,box-shadow] duration-(--duration-micro) ease-avel"
				>
					{selected ? (
						<>
							<span className="min-w-0 truncate type-title text-text">
								{selected.name}
							</span>
							<Badge variant="tag">{CUT_LABEL[selected.cut]}</Badge>
							<Badge variant="tag" data-testid="preset-kanban-version">
								{`v${selected.version}`}
							</Badge>
						</>
					) : (
						<span className="type-title text-text-muted">Choose a team</span>
					)}
					<ChevronsUpDown
						aria-hidden="true"
						className="size-3.5 shrink-0 text-text-subtle"
					/>
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-80 p-2">
				<TeamList
					presets={
						searching ? (found.data ? loadedPresets(found.data) : []) : presets
					}
					query={query}
					onQueryChange={setQuery}
					pending={searching && found.isPending}
					selectedId={selected?.id ?? ""}
					hasMore={searching ? found.hasNextPage : hasMore}
					loadingMore={searching ? found.isFetchingNextPage : loadingMore}
					onLoadMore={searching ? () => void found.fetchNextPage() : onLoadMore}
					onNew={() => {
						setOpen(false);
						onNew();
					}}
					onChoose={() => setOpen(false)}
					comparing={comparing}
					onToggleCompare={onToggleCompare}
				/>
			</PopoverContent>
		</Popover>
	);
}

/** The switcher's body, apart from its popover, so it renders in a test. */
export function TeamList({
	presets,
	selectedId,
	hasMore,
	loadingMore,
	onLoadMore,
	onNew,
	onChoose,
	comparing,
	onToggleCompare,
	query: controlled,
	onQueryChange,
	pending = false,
}: {
	presets: readonly Preset[];
	/**
	 * With onQueryChange, the search is the caller's and `presets` are already
	 * its matches; without, the list filters the presets it was given.
	 */
	query?: string;
	onQueryChange?: (query: string) => void;
	pending?: boolean;
	selectedId: string;
	hasMore: boolean;
	loadingMore: boolean;
	onLoadMore: () => void;
	onNew: () => void;
	onChoose?: () => void;
	comparing: readonly string[];
	onToggleCompare: (preset: Preset) => void;
}) {
	const [local, setLocal] = useState("");
	const query = onQueryChange ? (controlled ?? "") : local;
	const setQuery = onQueryChange ?? setLocal;
	const q = query.trim().toLowerCase();
	const shown = onQueryChange
		? presets
		: presets.filter((p) => q === "" || p.name.toLowerCase().includes(q));
	return (
		<div data-testid="preset-switcher-list" className="flex flex-col gap-2">
			<SearchField
				value={query}
				onChange={setQuery}
				label="Search teams"
				placeholder="Search teams"
				data-testid="preset-switcher-search"
			/>
			{pending ? (
				<p className="px-2 py-3 type-small text-text-subtle">Searching</p>
			) : shown.length === 0 ? (
				<p className="px-2 py-3 type-small text-text-subtle">
					No team matches.
				</p>
			) : (
				<ul
					aria-label="Teams"
					className="flex max-h-80 flex-col overflow-y-auto"
				>
					{shown.map((p) => {
						const current = p.id === selectedId;
						const compared = comparing.includes(p.id);
						const full = comparing.length >= 2 && !compared;
						return (
							<li
								key={p.id}
								data-testid={`preset-switcher-team-${p.id}`}
								data-selected={current || undefined}
								className={cn(
									"flex items-center gap-1 rounded-control pr-1 transition-colors duration-(--duration-micro) ease-avel",
									current ? "bg-selected" : "hover:bg-app-raised",
								)}
							>
								<Link
									to="/presets"
									search={(prev) => ({
										...prev,
										preset: p.id,
										view: undefined,
									})}
									onClick={onChoose}
									data-testid={`preset-open-${p.id}`}
									className="flex min-w-0 flex-1 items-center gap-2 rounded-control px-2 py-2"
								>
									<Check
										aria-hidden="true"
										className={cn(
											"size-3.5 shrink-0 text-accent-text",
											!current && "invisible",
										)}
									/>
									<span className="flex min-w-0 flex-col">
										<span className="truncate type-small font-medium text-text">
											{p.name}
										</span>
										<span className="type-caption">
											{`${CUT_LABEL[p.cut]} · ${agentCount(p.agents.length)} · v${p.version}`}
										</span>
									</span>
								</Link>
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									aria-pressed={compared}
									aria-label={`Compare ${p.name}`}
									data-testid={`preset-compare-${p.id}`}
									disabledReason={full ? COMPARE_FULL : undefined}
									onClick={() => onToggleCompare(p)}
									className="aria-pressed:bg-selected aria-pressed:text-accent-text"
								>
									<GitCompareArrows aria-hidden="true" />
								</Button>
							</li>
						);
					})}
				</ul>
			)}
			{hasMore ? (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					data-testid="presets-load-more"
					disabled={loadingMore}
					onClick={onLoadMore}
				>
					{loadingMore ? "Loading" : "Load more"}
				</Button>
			) : null}
			<div className="border-t border-border pt-2">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					data-testid="preset-switcher-new"
					onClick={onNew}
					className="w-full justify-start"
				>
					<Plus aria-hidden="true" />
					New team
				</Button>
			</div>
		</div>
	);
}
