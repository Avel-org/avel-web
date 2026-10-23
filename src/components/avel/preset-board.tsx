import type { Preset, PresetAgent } from "avel-server/contract";
import { presetAgentKey, waveGrid } from "@/lib/api/presets";
import { cn } from "@/lib/utils";
import { agentName } from "./preset-compare";
import type { Names } from "./preset-detail";

/** Why a third card cannot join a comparison. */
export const COMPARE_FULL = "Two are picked. Clear one to pick another.";

/** How a chip reads in a comparison. */
type ChipDiff = "only" | "changed";

const DIFF_CLASS: Record<ChipDiff, string> = {
	only: "bg-gate-pass-soft",
	changed: "bg-gate-warn-soft",
};

const DIFF_WORD: Record<ChipDiff, string> = {
	only: "only in this team",
	changed: "set differently",
};

/**
 * A preset's agents by wave: five columns, A to E, each agent as a chip in
 * every wave it works in. In a comparison, `diffOf`
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
						className="flex min-w-0 flex-col gap-1 rounded-control bg-app-raised p-1"
					>
						<span className="type-mono text-center text-text-subtle">
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
					{`No wave: ${noWave.map((a) => agentName(a, names)).join("; ")}`}
				</p>
			) : null}
		</div>
	);
}
