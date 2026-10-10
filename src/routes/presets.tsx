import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { missionCut, type Preset } from "avel-server/contract";
import { MousePointerClick, Plus } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { EmptyState } from "@/components/avel/empty-state";
import { PresetDetail } from "@/components/avel/preset-detail";
import { PresetFormSheet } from "@/components/avel/preset-form";
import { PresetListPane } from "@/components/avel/preset-list";
import { Button } from "@/components/ui/button";
import { listTotal } from "@/lib/api/clients";
import {
	loadedPresets,
	type PresetCut,
	presetCountLabel,
	presetSearchText,
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
 * - `preset` is the selected preset. It stays in the URL: a selected preset
 *   is a link, and Back walks the selections.
 */
export const presetsSearch = z.object({
	q: z
		.string()
		.transform((value) => presetSearchText(value))
		.optional()
		.catch(undefined),
	cut: missionCut.optional().catch(undefined),
	preset: z.string().uuid().optional().catch(undefined),
});

export const Route = createFileRoute("/presets")({
	staticData: { device: "construction" },
	validateSearch: presetsSearch,
	head: pageHead("/presets"),
	component: PresetsPage,
});

/**
 * Presets as a list and a detail, as Clients is. At lg and up the list sits
 * left and the selected preset right; below lg a selection replaces the list,
 * with a way back. The top bar counts from meta.total, never from the rows
 * loaded. Applying a preset is a roster write and lives on the mission.
 */
function PresetsPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: "/presets" });
	const presets = usePresets(search.q, search.cut);
	// The open form: a new preset, or the preset being edited.
	const [form, setForm] = useState<
		{ kind: "none" } | { kind: "new" } | { kind: "edit"; preset: Preset }
	>({ kind: "none" });

	const setQuery = (text: string) =>
		navigate({
			search: (prev) => ({ ...prev, q: presetSearchText(text) }),
			replace: true,
		});
	const setCut = (cut: PresetCut | undefined) =>
		navigate({ search: (prev) => ({ ...prev, cut }), replace: true });
	const select = (preset: Preset) =>
		navigate({ search: (prev) => ({ ...prev, preset: preset.id }) });
	const clearFilters = () =>
		navigate({
			search: (prev) => ({ ...prev, q: undefined, cut: undefined }),
			replace: true,
		});

	const total = listTotal(presets.data);
	const filtered = search.q !== undefined || search.cut !== undefined;
	const subtitle =
		total === undefined ? undefined : presetCountLabel(total, filtered);
	const selected = search.preset;
	// First run: no presets at all, not a filter that matched none.
	const firstRun =
		presets.status === "success" &&
		!filtered &&
		loadedPresets(presets.data).length === 0;

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
					New preset
				</Button>
			}
		>
			{firstRun ? (
				<EmptyState
					data-testid="presets-empty"
					icon={linkFor("/presets").icon}
					title="No presets yet"
					description="A preset saves a squad of agents once, so any mission can start from it. Applying one copies its agents into the mission's roster."
					action={
						<Button
							size="sm"
							data-testid="presets-empty-new"
							onClick={() => setForm({ kind: "new" })}
						>
							<Plus aria-hidden="true" />
							New preset
						</Button>
					}
				/>
			) : (
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
							search={search.q}
							cut={search.cut}
							onSearch={setQuery}
							onCut={setCut}
							selectedId={selected}
							onClearFilters={clearFilters}
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
							<PresetDetail
								key={selected}
								presetId={selected}
								onEdit={(preset) => setForm({ kind: "edit", preset })}
							/>
						) : (
							<EmptyState
								data-testid="presets-choose"
								icon={MousePointerClick}
								title="Choose a preset"
								description={
									subtitle
										? `${subtitle}. Choose one to see the agents it saves.`
										: "Choose one to see the agents it saves."
								}
							/>
						)}
					</div>
				</div>
			)}
			<PresetFormSheet
				open={form.kind !== "none"}
				onOpenChange={(open) => {
					if (!open) setForm({ kind: "none" });
				}}
				preset={form.kind === "edit" ? form.preset : undefined}
				onCreated={select}
			/>
		</Page>
	);
}
