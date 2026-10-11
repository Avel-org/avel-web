import type { Preset, PresetAgent } from "avel-server/contract";
import { GitCompareArrows, Maximize2, Rocket, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listTotal } from "@/lib/api/clients";
import {
	agentCount,
	CUT_LABEL,
	loadedPresets,
	presetAgentKey,
	type usePresets,
	waveGrid,
} from "@/lib/api/presets";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";
import { agentName } from "./preset-compare";
import type { Names } from "./preset-detail";
import { noMatchCopy } from "./preset-list";
import { ErrorState, Surface } from "./surface";

/** Why a third card cannot join a comparison. */
export const COMPARE_FULL = "Two are picked. Clear one to pick another.";

/**
 * Territory as a chip's tone, so one territory's agents read as a group on
 * any board. Borrowed from existing tones until territory tokens are
 * decided; swapping them is this one table. No territory keeps the plain
 * border.
 */
const TERRITORY_TONES = [
	"border-accent",
	"border-gate-pass-line",
	"border-gate-warn-line",
	"border-gate-stale-line",
] as const;

export function territoryTone(territory: string | null): string {
	if (territory === null) return "border-border";
	let sum = 0;
	for (const ch of territory) sum = (sum + ch.charCodeAt(0)) % 9973;
	return TERRITORY_TONES[sum % TERRITORY_TONES.length] ?? "border-border";
}

/** How a chip reads in a comparison. */
type ChipDiff = "only" | "changed";

const DIFF_CLASS: Record<ChipDiff, string> = {
	only: "bg-gate-pass-soft",
	changed: "bg-gate-warn-soft",
};

const DIFF_WORD: Record<ChipDiff, string> = {
	only: "only in this preset",
	changed: "set differently",
};

type BoardActions = {
	onOpen: (preset: Preset) => void;
	onApply: (preset: Preset) => void;
	onToggleCompare: (preset: Preset) => void;
};

/**
 * The squad board: every preset as a card holding its own small wave board.
 * Open expands one in place to edit it; pick two to compare. The route owns
 * the query and the filters; this renders them.
 */
export function PresetBoard({
	query,
	search,
	cut,
	onClearFilters,
	names,
	comparing,
	landedId,
	actions,
}: {
	query: ReturnType<typeof usePresets>;
	search: string | undefined;
	cut: Preset["cut"] | undefined;
	onClearFilters: () => void;
	names: Names;
	/** The ids picked for comparison, at most two. */
	comparing: readonly string[];
	/** The preset just saved: its card shows the landed highlight. */
	landedId?: string;
	actions: BoardActions;
}) {
	return (
		<Surface
			data-testid="preset-list"
			query={query}
			isEmpty={(data) => loadedPresets(data).length === 0}
			loading={<BoardSkeleton />}
			empty={
				<EmptyState
					data-testid="presets-no-match"
					compact
					icon={SearchX}
					title="No presets match"
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
			{(data) => {
				const presets = loadedPresets(data);
				const total = listTotal(data);
				return (
					<div className="flex flex-col gap-3">
						<ul
							data-testid="preset-cards"
							className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3"
						>
							{presets.map((preset) => (
								<li key={preset.id}>
									<PresetCard
										preset={preset}
										names={names}
										compared={comparing.includes(preset.id)}
										compareFull={
											comparing.length >= 2 && !comparing.includes(preset.id)
										}
										landed={preset.id === landedId}
										actions={actions}
									/>
								</li>
							))}
						</ul>
						{total !== undefined || query.hasNextPage ? (
							<div className="flex items-center justify-between gap-2">
								<p
									data-testid="presets-showing"
									className="type-caption text-text-subtle tabular-nums"
								>
									{total === undefined
										? ""
										: `Showing ${presets.length} of ${total}`}
								</p>
								{query.hasNextPage ? (
									<Button
										variant="ghost"
										size="sm"
										data-testid="presets-load-more"
										disabled={query.isFetchingNextPage}
										onClick={() => query.fetchNextPage()}
									>
										{query.isFetchingNextPage ? "Loading" : "Load more"}
									</Button>
								) : null}
							</div>
						) : null}
					</div>
				);
			}}
		</Surface>
	);
}

/**
 * One preset as a small board: name, cut and version, its agents in their
 * wave columns, and Open, Apply and Compare.
 */
export function PresetCard({
	preset,
	names,
	compared,
	compareFull,
	landed = false,
	actions,
}: {
	preset: Preset;
	names: Names;
	compared: boolean;
	compareFull: boolean;
	landed?: boolean;
	actions: BoardActions;
}) {
	return (
		<article
			aria-label={preset.name}
			data-testid={`preset-card-${preset.id}`}
			data-compared={compared || undefined}
			// plate-interactive lifts a picked card as it does a hovered one.
			data-selected={compared ? "true" : undefined}
			className={cn(
				"plate plate-interactive flex h-full flex-col gap-3 rounded-md border p-4",
				landed && "landed",
			)}
		>
			<header className="flex items-start gap-2">
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<h3 className="type-panel-title truncate text-foreground">
						{preset.name}
					</h3>
					<span className="type-mono-small text-text-subtle">
						{agentCount(preset.agents.length)}
					</span>
				</div>
				<Badge variant="tag" data-testid={`preset-cut-${preset.id}`}>
					{CUT_LABEL[preset.cut]}
				</Badge>
				<Badge variant="tag" data-testid={`preset-version-${preset.id}`}>
					{`v${preset.version}`}
				</Badge>
			</header>
			{preset.description ? (
				<p className="type-small line-clamp-2 text-text-muted">
					{preset.description}
				</p>
			) : null}
			<WaveGrid preset={preset} names={names} />
			<footer className="mt-auto flex flex-wrap items-center gap-1">
				<Button
					size="sm"
					data-testid={`preset-open-${preset.id}`}
					onClick={() => actions.onOpen(preset)}
				>
					<Maximize2 aria-hidden="true" />
					Open
				</Button>
				<Button
					size="sm"
					variant="ghost"
					data-testid={`preset-apply-${preset.id}`}
					onClick={() => actions.onApply(preset)}
				>
					<Rocket aria-hidden="true" />
					Apply
				</Button>
				<Button
					size="sm"
					variant="ghost"
					aria-pressed={compared}
					data-testid={`preset-compare-${preset.id}`}
					disabledReason={compareFull ? COMPARE_FULL : undefined}
					onClick={() => actions.onToggleCompare(preset)}
					className="ml-auto aria-pressed:bg-state-selected"
				>
					<GitCompareArrows aria-hidden="true" />
					Compare
				</Button>
			</footer>
		</article>
	);
}

/**
 * A preset's agents by wave: five columns, A to E, each agent as a chip in
 * every wave it works in, toned by territory. In a comparison, `diffOf`
 * marks each chip. An agent with no wave is listed under the grid.
 */
export function WaveGrid({
	preset,
	names,
	diffOf,
}: {
	preset: Pick<Preset, "id" | "agents">;
	names: Names;
	diffOf?: (agent: PresetAgent) => ChipDiff | undefined;
}) {
	const { columns, noWave } = waveGrid(preset.agents);
	return (
		<div
			data-testid={`preset-waves-${preset.id}`}
			className="flex flex-col gap-1"
		>
			<ol aria-label="Agents by wave" className="grid grid-cols-5 gap-1">
				{columns.map(({ wave, agents }) => (
					<li
						key={wave}
						data-testid={`preset-wave-${preset.id}-${wave}`}
						data-count={agents.length}
						className="flex min-w-0 flex-col gap-1 rounded-sm bg-app-band p-1"
					>
						<span className="type-mono-small text-center text-text-subtle">
							{wave}
						</span>
						<ul className="flex flex-col gap-0.5">
							{agents.map((agent) => {
								const diff = diffOf?.(agent);
								const name = agentName(agent, names);
								return (
									<li
										key={presetAgentKey(agent)}
										data-diff={diff}
										title={diff ? `${name}: ${DIFF_WORD[diff]}` : name}
										className={cn(
											"type-caption truncate rounded-xs border bg-card px-1 text-text-muted",
											territoryTone(agent.territory),
											diff && DIFF_CLASS[diff],
										)}
									>
										{name}
										{diff ? (
											<span className="sr-only">{`, ${DIFF_WORD[diff]}`}</span>
										) : null}
									</li>
								);
							})}
						</ul>
					</li>
				))}
			</ol>
			{noWave.length > 0 ? (
				<p
					data-testid={`preset-no-wave-${preset.id}`}
					className="type-caption text-text-subtle"
				>
					{`No wave: ${noWave.map((a) => agentName(a, names)).join(", ")}`}
				</p>
			) : null}
		</div>
	);
}

function BoardSkeleton() {
	return (
		<div
			data-testid="preset-board-skeleton"
			className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3"
		>
			{[0, 1, 2].map((i) => (
				<div
					key={i}
					data-testid="preset-board-skeleton-card"
					className="plate flex flex-col gap-3 rounded-md border p-4"
				>
					<Skeleton className="h-5 w-40" />
					<Skeleton className="h-20 w-full" />
					<Skeleton className="h-7 w-48" />
				</div>
			))}
		</div>
	);
}
