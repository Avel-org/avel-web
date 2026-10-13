import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { missionCut, type Preset } from "avel-server/contract";
import { LayoutGrid, MousePointerClick, Plus, Rows3 } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { EmptyState } from "@/components/avel/empty-state";
import { ApplyPresetModal } from "@/components/avel/preset-apply";
import { PresetBoard } from "@/components/avel/preset-board";
import { PresetCompare } from "@/components/avel/preset-compare";
import {
	PresetDetail,
	useTemplateNames,
} from "@/components/avel/preset-detail";
import { PresetFormModal } from "@/components/avel/preset-form";
import { PresetKanban } from "@/components/avel/preset-kanban";
import {
	CutFilter,
	PresetListPane,
	PresetSearch,
} from "@/components/avel/preset-list";
import { ErrorState, Surface } from "@/components/avel/surface";
import { type ViewOption, ViewToggle } from "@/components/avel/view-toggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listTotal } from "@/lib/api/clients";
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

/** Board first: the squad board is the page; Table is for reading. */
const PRESET_VIEWS = [
	{ id: "board", label: "Board", icon: LayoutGrid },
	{ id: "table", label: "Table", icon: Rows3 },
] as const satisfies readonly ViewOption<View>[];

/**
 * Presets as a squad board (ruling 35): each preset a small wave board,
 * opened in place to edit, two compared side by side, any applied to a draft
 * mission. Table is the second view, the list and detail, for reading. The
 * top bar counts from meta.total, never from the rows loaded.
 */
function PresetsPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: "/presets" });
	const presets = usePresets(search.q, search.cut);
	const names = useTemplateNames();
	const view: View = search.view === "table" ? "table" : "board";
	const [form, setForm] = useState<
		{ kind: "none" } | { kind: "new" } | { kind: "edit"; preset: Preset }
	>({ kind: "none" });
	const [comparing, setComparing] = useState<string[]>([]);
	const [applying, setApplying] = useState<Preset | null>(null);
	const [applyOpen, setApplyOpen] = useState(false);
	const [landedId, setLandedId] = useState<string | undefined>(undefined);

	const setSearch = (patch: Partial<z.infer<typeof presetsSearch>>) =>
		navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
	const open = (preset: Preset) =>
		navigate({ search: (prev) => ({ ...prev, preset: preset.id }) });
	const close = () =>
		navigate({ search: (prev) => ({ ...prev, preset: undefined }) });
	const apply = (preset: Preset) => {
		setApplying(preset);
		setApplyOpen(true);
	};
	const saved = (preset: Preset) => {
		setLandedId(preset.id);
		open(preset);
	};

	const loaded = presets.data ? loadedPresets(presets.data) : [];
	const total = listTotal(presets.data);
	const filtered = search.q !== undefined || search.cut !== undefined;
	const subtitle =
		total === undefined ? undefined : presetCountLabel(total, filtered);
	// First run: no presets at all, not a filter that matched none.
	const firstRun =
		presets.status === "success" && !filtered && loaded.length === 0;
	const pair = comparing
		.map((id) => loaded.find((p) => p.id === id))
		.filter((p): p is Preset => p !== undefined);

	return (
		<Page
			to="/presets"
			subtitle={subtitle}
			actions={
				<Button
					size="sm"
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
					<div
						data-testid="presets-toolbar"
						className="flex flex-wrap items-center gap-3"
					>
						<div className="w-full max-w-sm">
							<PresetSearch
								value={search.q ?? ""}
								onChange={(text) => setSearch({ q: presetSearchText(text) })}
							/>
						</div>
						<CutFilter
							value={search.cut}
							onChange={(cut: PresetCut | undefined) => setSearch({ cut })}
						/>
						<ViewToggle
							options={PRESET_VIEWS}
							view={view}
							onChange={(next) =>
								setSearch({ view: next === "table" ? "table" : undefined })
							}
							testIdPrefix="presets-view"
							className="ml-auto"
						/>
					</div>

					{view === "table" ? (
						<TableView
							presets={presets}
							search={search.q}
							cut={search.cut}
							selected={search.preset}
							subtitle={subtitle}
							onClearFilters={() => setSearch({ q: undefined, cut: undefined })}
							onEdit={(preset) => setForm({ kind: "edit", preset })}
						/>
					) : search.preset ? (
						<OpenPreset
							id={search.preset}
							names={names}
							onClose={close}
							onApply={apply}
							onSaved={saved}
						/>
					) : (
						<div className="flex flex-col gap-4">
							{pair.length === 2 && pair[0] && pair[1] ? (
								<PresetCompare
									a={pair[0]}
									b={pair[1]}
									names={names}
									onClear={() => setComparing([])}
								/>
							) : null}
							<PresetBoard
								query={presets}
								search={search.q}
								cut={search.cut}
								onClearFilters={() =>
									setSearch({ q: undefined, cut: undefined })
								}
								names={names}
								comparing={comparing}
								landedId={landedId}
								actions={{
									onOpen: open,
									onApply: apply,
									onToggleCompare: (preset) =>
										setComparing((ids) =>
											ids.includes(preset.id)
												? ids.filter((id) => id !== preset.id)
												: [...ids, preset.id].slice(-2),
										),
								}}
							/>
						</div>
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
	onClose,
	onApply,
	onSaved,
}: {
	id: string;
	names: ReturnType<typeof useTemplateNames>;
	onClose: () => void;
	onApply: (preset: Preset) => void;
	onSaved: (preset: Preset) => void;
}) {
	const query = usePreset(id);
	return (
		<Surface
			data-testid="preset-open"
			query={query}
			isEmpty={() => false}
			empty={null}
			loading={<Skeleton className="h-64 w-full rounded-md" />}
			error={ErrorState}
		>
			{(preset) => (
				<PresetKanban
					// Keyed on the preset only: a newer version is the board's to
					// handle (boardSync), so a refetch never remounts it under edits.
					key={preset.id}
					preset={preset}
					names={names}
					onClose={onClose}
					onApply={onApply}
					onSaved={onSaved}
				/>
			)}
		</Surface>
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
