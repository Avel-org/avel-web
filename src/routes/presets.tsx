import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { Preset } from "avel-server/contract";
import { Layers, Plus } from "lucide-react";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { z } from "zod";
import { EmptyState } from "@/components/avel/empty-state";
import { playbookCountLabel } from "@/components/avel/playbook-list";
import { NewPlaybookModal } from "@/components/avel/playbook-new";
import {
	PLAYBOOKS_ICON,
	PlaybooksSection,
	TeamPlaybooks,
} from "@/components/avel/playbook-section";
import { ApplyPresetModal } from "@/components/avel/preset-apply";
import { PresetCompare } from "@/components/avel/preset-compare";
import { useTemplateNames } from "@/components/avel/preset-detail";
import { PresetFormModal } from "@/components/avel/preset-form";
import { CanvasSkeleton, PresetKanban } from "@/components/avel/preset-kanban";
import { TeamSwitcher } from "@/components/avel/preset-switcher";
import {
	ErrorState,
	type ErrorStateProps,
	Surface,
} from "@/components/avel/surface";
import { type ViewOption, ViewToggle } from "@/components/avel/view-toggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { catalogTotal } from "@/lib/api/catalog";
import { listTotal } from "@/lib/api/clients";
import type { ApiError } from "@/lib/api/errors";
import { usePlaybooks } from "@/lib/api/playbooks";
import {
	loadedPresets,
	presetCountLabel,
	usePreset,
	usePresets,
} from "@/lib/api/presets";
import { linkFor } from "../shell/nav";
import { Page, pageHead } from "../shell/page";

/**
 * The page's state in the URL.
 * - `preset` is the team open on the board. It stays in the URL: an open
 *   team is a link, and Back walks.
 * - `section` is "playbooks" for the page's second section; absent is Teams.
 * Each section shows only its board (ruling 55). Any other key, such as an
 * old link's `?view=table`, `?q` or `?cut`, is dropped, so it opens the board.
 */
export const presetsSearch = z.object({
	preset: z.string().uuid().optional().catch(undefined),
	section: z.literal("playbooks").optional().catch(undefined),
});

type Section = "teams" | "playbooks";

/**
 * Teams and Playbooks, one page (operator request, 2026-10-20): the squads,
 * and the process each kind of mission follows, which names the squad its
 * missions start from.
 */
const SECTIONS: readonly ViewOption<Section>[] = [
	{ id: "teams", label: "Teams", icon: Layers },
	{ id: "playbooks", label: "Playbooks", icon: PLAYBOOKS_ICON },
];

export const Route = createFileRoute("/presets")({
	staticData: { device: "construction" },
	validateSearch: presetsSearch,
	head: pageHead("/presets"),
	component: PresetsPage,
});

/**
 * Presets as a squad board (ruling 35): each preset a small wave board,
 * opened in place to edit, two compared side by side, any applied to a draft
 * mission. There is no table view (ruling 55). The top bar counts from
 * meta.total, never from the rows loaded.
 */
function PresetsPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: "/presets" });
	const section: Section = search.section ?? "teams";
	if (section === "playbooks")
		return (
			<PlaybooksPage
				onSection={(next) =>
					navigate({ search: next === "teams" ? {} : { section: next } })
				}
			/>
		);
	return <TeamsSection search={search} />;
}

/** Teams | Playbooks, in the top bar beside the section's New. */
function SectionSwitch({
	section,
	onChange,
}: {
	section: Section;
	onChange: (section: Section) => void;
}) {
	return (
		<ViewToggle
			options={SECTIONS}
			view={section}
			onChange={onChange}
			testIdPrefix="presets-section"
		/>
	);
}

/** The second section: every playbook, and New playbook. */
function PlaybooksPage({
	onSection,
}: {
	onSection: (section: Section) => void;
}) {
	const [creating, setCreating] = useState(false);
	const total = catalogTotal(usePlaybooks().data);
	return (
		<Page
			to="/presets"
			subtitle={total === undefined ? undefined : playbookCountLabel(total)}
			actions={
				<>
					<SectionSwitch section="playbooks" onChange={onSection} />
					<Button
						size="sm"
						data-testid="playbooks-new"
						onClick={() => setCreating(true)}
					>
						<Plus aria-hidden="true" />
						New playbook
					</Button>
				</>
			}
		>
			<PlaybooksSection />
			<NewPlaybookModal open={creating} onOpenChange={setCreating} />
		</Page>
	);
}

/** The first section: the team composer. */
function TeamsSection({ search }: { search: z.infer<typeof presetsSearch> }) {
	const navigate = useNavigate({ from: "/presets" });
	// Unfiltered: the switcher has its own search.
	const presets = usePresets();
	const names = useTemplateNames();
	const [form, setForm] = useState<
		{ kind: "none" } | { kind: "new" } | { kind: "edit"; preset: Preset }
	>({ kind: "none" });
	const [comparing, setComparing] = useState<string[]>([]);
	const [applying, setApplying] = useState<Preset | null>(null);
	const [applyOpen, setApplyOpen] = useState(false);

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
	const subtitle = total === undefined ? undefined : presetCountLabel(total);
	// First run: no presets at all.
	const firstRun = presets.status === "success" && loaded.length === 0;
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
				<>
					<SectionSwitch
						section="teams"
						onChange={(next) =>
							navigate({
								search: next === "teams" ? {} : { section: next },
							})
						}
					/>
					{/* Outlined: the canvas's one primary is Apply to mission. */}
					<Button
						size="sm"
						variant="outline"
						data-testid="presets-new"
						onClick={() => setForm({ kind: "new" })}
					>
						<Plus aria-hidden="true" />
						New team
					</Button>
				</>
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
					{/* The canvas: the selected team (the URL's, else the first), the
					   switcher at its head; read, empty and failed as every region. */}
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
	onApply,
	onSaved,
}: {
	id: string;
	names: ReturnType<typeof useTemplateNames>;
	switcher: (preset: Preset | null) => ReactNode;
	onApply: (preset: Preset) => void;
	onSaved: (preset: Preset) => void;
}) {
	const query = usePreset(id);
	// A team that can't be read (a stale ?preset= of a deleted one is a 404)
	// keeps the canvas header, so there is always a way to another team.
	// Surface renders `error` as a component, so it is made once: a new one
	// each render would remount the header, closing an open switcher and
	// wiping its search. The latest switcher comes through a ref.
	const latest = useRef(switcher);
	latest.current = switcher;
	const failed = useCallback(
		(props: ErrorStateProps<ApiError>) => (
			<div data-testid="preset-open-failed" className="flex flex-col gap-4">
				<header
					data-testid="preset-canvas-header"
					className="flex flex-wrap items-center gap-2"
				>
					{latest.current(null)}
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
				<div className="flex min-w-0 flex-col gap-3">
					<TeamPlaybooks presetId={preset.id} />
					<PresetKanban
						// Keyed on the preset only: a newer version is the board's to
						// handle (boardSync), so a refetch never remounts it under edits.
						key={preset.id}
						preset={preset}
						names={names}
						switcher={switcher(preset)}
						onApply={onApply}
						onSaved={onSaved}
					/>
				</div>
			)}
		</Surface>
	);
}
