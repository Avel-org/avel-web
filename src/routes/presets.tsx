import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { missionCut, type Preset } from "avel-server/contract";
import { MousePointerClick, Plus, Rows3 } from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { z } from "zod";
import { EmptyState } from "@/components/avel/empty-state";
import { ApplyPresetModal } from "@/components/avel/preset-apply";
import { PresetCompare } from "@/components/avel/preset-compare";
import {
	PresetDetail,
	useTemplateNames,
} from "@/components/avel/preset-detail";
import { PresetFormModal } from "@/components/avel/preset-form";
import {
	CanvasSkeleton,
	PresetKanban,
	VIEW_OPTIONS,
} from "@/components/avel/preset-kanban";
import { CutFilter, PresetListPane } from "@/components/avel/preset-list";
import { TeamSwitcher } from "@/components/avel/preset-switcher";
import { SearchField } from "@/components/avel/search-field";
import {
	ErrorState,
	type ErrorStateProps,
	Surface,
} from "@/components/avel/surface";
import { ViewToggle } from "@/components/avel/view-toggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listTotal } from "@/lib/api/clients";
import type { ApiError } from "@/lib/api/errors";
import {
	loadedPresets,
	type PresetCut,
	presetCountLabel,
	presetSearchText,
	usePreset,
	usePresets,
} from "@/lib/api/presets";
import { cn } from "@/lib/utils";
import { linkFor } from "../shell/nav";
import { Page, pageHead } from "../shell/page";

/**
 * The page's state in the URL.
 * - `q` searches preset names, trimmed and cut to the contract's 200
 *   characters; empty means no search.
 * - `cut` keeps presets of one cut; absent means both.
 * - `view` is "table" for the list and detail; absent is the board.
 * - `preset` is the open preset: expanded on the board, selected in the
 *   table. It stays in the URL: an open preset is a link, and Back walks.
 */
export const presetsSearch = z.object({
	q: z
		.string()
		.transform((value) => presetSearchText(value))
		.optional()
		.catch(undefined),
	cut: missionCut.optional().catch(undefined),
	view: z.literal("table").optional().catch(undefined),
	preset: z.string().uuid().optional().catch(undefined),
});

export const Route = createFileRoute("/presets")({
	staticData: { device: "construction" },
	validateSearch: presetsSearch,
	head: pageHead("/presets"),
	component: PresetsPage,
});

type View = "board" | "table";

/**
 * Presets as a squad board (ruling 35): each preset a small wave board,
 * opened in place to edit, two compared side by side, any applied to a draft
 * mission. Table is the second view, the list and detail, for reading. The
 * top bar counts from meta.total, never from the rows loaded.
 */
function PresetsPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: "/presets" });
	const view: View = search.view === "table" ? "table" : "board";
	// The search and cut live in the Table's toolbar, so only the Table is
	// filtered by them: the Board never hides a team behind a filter it
	// doesn't show (its switcher has its own search).
	const table = view === "table";
	const presets = usePresets(
		table ? search.q : undefined,
		table ? search.cut : undefined,
	);
	const names = useTemplateNames();
	const [form, setForm] = useState<
		{ kind: "none" } | { kind: "new" } | { kind: "edit"; preset: Preset }
	>({ kind: "none" });
	const [comparing, setComparing] = useState<string[]>([]);
	const [applying, setApplying] = useState<Preset | null>(null);
	const [applyOpen, setApplyOpen] = useState(false);

	const setSearch = (patch: Partial<z.infer<typeof presetsSearch>>) =>
		navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
	const open = (preset: Preset) =>
		navigate({ search: (prev) => ({ ...prev, preset: preset.id }) });
	const apply = (preset: Preset) => {
		setApplying(preset);
		setApplyOpen(true);
	};
	const saved = (preset: Preset) => {
		open(preset);
	};

	const loaded = presets.data ? loadedPresets(presets.data) : [];
	const total = listTotal(presets.data);
	const filtered =
		table && (search.q !== undefined || search.cut !== undefined);
	const subtitle =
		total === undefined ? undefined : presetCountLabel(total, filtered);
	// First run: no presets at all, not a filter that matched none.
	const firstRun =
		presets.status === "success" && !filtered && loaded.length === 0;
	// The composer always shows a team: the URL's, or the first listed.
	const selectedId = search.preset ?? loaded[0]?.id;
	const pair = comparing
		.map((id) => loaded.find((p) => p.id === id))
		.filter((p): p is Preset => p !== undefined);

	return (
		<Page
			to="/presets"
			subtitle={subtitle}
			actions={
				// Outlined: the canvas's one primary is Apply to mission.
				<Button
					size="sm"
					variant="outline"
					data-testid="presets-new"
					onClick={() => setForm({ kind: "new" })}
				>
					<Plus aria-hidden="true" />
					New team
				</Button>
			}
		>
			{firstRun ? (
				<EmptyState
					data-testid="presets-empty"
					icon={linkFor("/presets").icon}
					title="No teams yet"
					description="A team saves a squad of agents once, so any mission can start from it. Applying one copies its agents into the mission's roster."
					action={
						<Button
							size="sm"
							data-testid="presets-empty-new"
							onClick={() => setForm({ kind: "new" })}
						>
							<Plus aria-hidden="true" />
							New team
						</Button>
					}
				/>
			) : (
				<div className="flex min-h-0 flex-1 flex-col gap-4">
					{view === "table" ? (
						<>
							{/* The table's header: the one view control, then its
							    own search and cut. */}
							<div
								data-testid="presets-toolbar"
								className="flex flex-wrap items-center gap-3"
							>
								<ViewToggle
									options={VIEW_OPTIONS}
									view="table"
									onChange={(next) => {
										if (next !== "table") setSearch({ view: undefined });
									}}
									testIdPrefix="preset-view"
								/>
								<TeamSearch
									value={search.q ?? ""}
									onChange={(text) => setSearch({ q: presetSearchText(text) })}
								/>
								<CutFilter
									value={search.cut}
									onChange={(cut: PresetCut | undefined) => setSearch({ cut })}
								/>
							</div>
							<section
								aria-label="Teams"
								className="flex min-h-0 flex-1 flex-col rounded-card border border-border bg-app-panel p-4 shadow-card"
							>
								<TableView
									presets={presets}
									search={search.q}
									cut={search.cut}
									selected={search.preset}
									subtitle={subtitle}
									onClearFilters={() =>
										setSearch({ q: undefined, cut: undefined })
									}
									onEdit={(preset) => setForm({ kind: "edit", preset })}
								/>
							</section>
						</>
					) : (
						// The canvas: the selected team (the URL's, else the first), the
						// switcher at its head; read, empty and failed as every region.
						<Surface
							data-testid="preset-list"
							query={presets}
							isEmpty={(data) => loadedPresets(data).length === 0}
							loading={<CanvasSkeleton />}
							// Unfiltered, an empty list is the first run, shown above.
							empty={null}
							error={ErrorState}
						>
							{() => (
								<div
									data-testid="presets-composer"
									className="flex min-w-0 flex-1 flex-col gap-4"
								>
									{pair.length === 2 && pair[0] && pair[1] ? (
										<PresetCompare
											a={pair[0]}
											b={pair[1]}
											names={names}
											onClear={() => setComparing([])}
										/>
									) : null}
									{selectedId ? (
										<OpenPreset
											id={selectedId}
											names={names}
											onApply={apply}
											onSaved={saved}
											onTable={() => setSearch({ view: "table" })}
											switcher={(selected) => (
												<TeamSwitcher
													presets={loaded}
													selected={selected}
													hasMore={presets.hasNextPage}
													loadingMore={presets.isFetchingNextPage}
													onLoadMore={() => presets.fetchNextPage()}
													onNew={() => setForm({ kind: "new" })}
													comparing={comparing}
													onToggleCompare={(preset) =>
														setComparing((ids) =>
															ids.includes(preset.id)
																? ids.filter((id) => id !== preset.id)
																: [...ids, preset.id].slice(-2),
														)
													}
												/>
											)}
										/>
									) : null}
								</div>
							)}
						</Surface>
					)}
				</div>
			)}
			<PresetFormModal
				open={form.kind !== "none"}
				onOpenChange={(next) => {
					if (!next) setForm({ kind: "none" });
				}}
				preset={form.kind === "edit" ? form.preset : undefined}
				onSaved={saved}
			/>
			<ApplyPresetModal
				preset={applying}
				open={applyOpen}
				onOpenChange={setApplyOpen}
				names={names}
			/>
		</Page>
	);
}

/** The open preset on the board, read fresh by id and expanded to edit. */
function OpenPreset({
	id,
	names,
	switcher,
	onTable,
	onApply,
	onSaved,
}: {
	id: string;
	names: ReturnType<typeof useTemplateNames>;
	switcher: (preset: Preset | null) => ReactNode;
	onTable: () => void;
	onApply: (preset: Preset) => void;
	onSaved: (preset: Preset) => void;
}) {
	const query = usePreset(id);
	// A team that can't be read (a stale ?preset= of a deleted one is a 404)
	// keeps the canvas header, so there is always a way to another team or
	// the table.
	// Surface renders `error` as a component, so it is made once: a new one
	// each render would remount the header, closing an open switcher and
	// wiping its search. The latest switcher and onTable come through a ref.
	const latest = useRef({ switcher, onTable });
	latest.current = { switcher, onTable };
	const failed = useCallback(
		(props: ErrorStateProps<ApiError>) => (
			<div data-testid="preset-open-failed" className="flex flex-col gap-4">
				<header
					data-testid="preset-canvas-header"
					className="flex flex-wrap items-center gap-2"
				>
					{latest.current.switcher(null)}
					<Button
						type="button"
						variant="outline"
						size="sm"
						data-testid="preset-open-table"
						onClick={() => latest.current.onTable()}
					>
						<Rows3 aria-hidden="true" />
						Open the table
					</Button>
				</header>
				<ErrorState {...props} />
			</div>
		),
		[],
	);
	return (
		<Surface
			data-testid="preset-open"
			query={query}
			isEmpty={() => false}
			empty={null}
			loading={<Skeleton className="h-64 w-full rounded-card" />}
			error={failed}
		>
			{(preset) => (
				<PresetKanban
					// Keyed on the preset only: a newer version is the board's to
					// handle (boardSync), so a refetch never remounts it under edits.
					key={preset.id}
					preset={preset}
					names={names}
					switcher={switcher(preset)}
					onTable={onTable}
					onApply={onApply}
					onSaved={onSaved}
				/>
			)}
		</Surface>
	);
}

/** The search writes to the URL this long after the last keystroke. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The table's search. The URL's `?q` is the source of truth, so a search is
 * a link; typing updates it after a short pause, and Clear filters (a URL
 * change from outside) is followed.
 */
/**
 * The search box's text once the URL's `?q` changes: kept while it trims to
 * the same query (the URL holds it trimmed, so a typed trailing space would
 * otherwise be deleted mid-word), the URL's otherwise (Clear filters, Back).
 */
export function searchDraft(draft: string, url: string): string {
	return (presetSearchText(draft) ?? "") === url ? draft : url;
}

function TeamSearch({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) {
	const [text, setText] = useState(value);
	const latest = useRef(onChange);
	latest.current = onChange;
	useEffect(() => setText((draft) => searchDraft(draft, value)), [value]);
	useEffect(() => {
		// Nothing new to send: the text already trims to the URL's query.
		if ((presetSearchText(text) ?? "") === value) return;
		const timer = window.setTimeout(
			() => latest.current(text),
			SEARCH_DEBOUNCE_MS,
		);
		return () => window.clearTimeout(timer);
	}, [text, value]);
	return (
		<SearchField
			value={text}
			onChange={setText}
			label="Search teams"
			placeholder="Search teams by name"
			shortcut="/"
			className="w-full max-w-sm"
			data-testid="presets-search"
		/>
	);
}

/** The second view: the list and the selected preset's detail, for reading. */
function TableView({
	presets,
	search,
	cut,
	selected,
	subtitle,
	onClearFilters,
	onEdit,
}: {
	presets: ReturnType<typeof usePresets>;
	search: string | undefined;
	cut: PresetCut | undefined;
	selected: string | undefined;
	subtitle: string | undefined;
	onClearFilters: () => void;
	onEdit: (preset: Preset) => void;
}) {
	return (
		<div data-testid="presets-panes" className="flex min-h-0 flex-1 gap-6">
			<div
				data-testid="presets-list-pane"
				className={cn(
					"flex min-h-0 w-full flex-col lg:w-72 lg:shrink-0",
					// Below lg a selection replaces the list, as on Clients.
					selected && "max-lg:hidden",
				)}
			>
				<PresetListPane
					query={presets}
					search={search}
					cut={cut}
					selectedId={selected}
					onClearFilters={onClearFilters}
				/>
			</div>
			<div
				data-testid="presets-detail-pane"
				className={cn(
					"flex min-w-0 flex-1 flex-col lg:border-l lg:border-border lg:pl-6",
					!selected && "max-lg:hidden",
				)}
			>
				{selected ? (
					<PresetDetail key={selected} presetId={selected} onEdit={onEdit} />
				) : (
					<EmptyState
						data-testid="presets-choose"
						icon={MousePointerClick}
						title="Choose a team"
						description={
							subtitle
								? `${subtitle}. Choose one to see the agents it saves.`
								: "Choose one to see the agents it saves."
						}
					/>
				)}
			</div>
		</div>
	);
}
