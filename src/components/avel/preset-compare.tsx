import type { Preset, PresetAgent } from "avel-server/contract";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	CUT_LABEL,
	type DiffField,
	presetAgentKey,
	presetDiff,
	shortId,
	templateLabel,
} from "@/lib/api/presets";
import { cn } from "@/lib/utils";
import { WaveGrid } from "./preset-board";
import type { Names } from "./preset-detail";

const FIELD_LABEL: Record<DiffField, string> = {
	waves: "Waves",
	writablePaths: "Writable paths",
	estimatedTokens: "Est. tokens",
};

/** A field's value as the board shows it: mono machine values, words for "unset". */
export function fieldText(agent: PresetAgent, field: DiffField): string {
	switch (field) {
		case "waves":
			return agent.waves.length === 0 ? "None" : agent.waves.join(" · ");
		case "writablePaths":
			return agent.writablePaths === null
				? "Template's"
				: agent.writablePaths.join(", ");
		case "estimatedTokens":
			return agent.estimatedTokens === null
				? "Not set"
				: agent.estimatedTokens.toLocaleString("en-US");
	}
}

/** An agent's name, or its short id while names load or when the catalog lacks it. */
export function agentName(agent: PresetAgent, names: Names): string {
	if (names.status !== "success") return shortId(agent.agentTemplateId);
	const label = templateLabel(agent.agentTemplateId, names.byId);
	const name = label.known ? label.name : `Unknown · ${label.shortId}`;
	return agent.territory ? `${name} · ${agent.territory}` : name;
}

/**
 * Two presets' squads, side by side: agents only one has, agents both have
 * but set differently (field by field, from → to), and how many are alike.
 */
export function PresetCompare({
	a,
	b,
	names,
	onClear,
}: {
	a: Preset;
	b: Preset;
	names: Names;
	onClear: () => void;
}) {
	const diff = presetDiff(a, b);
	const nothing =
		diff.onlyA.length === 0 &&
		diff.onlyB.length === 0 &&
		diff.changed.length === 0;
	return (
		<section
			aria-label={`Comparing ${a.name} with ${b.name}`}
			data-testid="preset-compare"
			className="plate flex flex-col gap-4 rounded-md border p-4 motion-safe:animate-in motion-safe:fade-in-0 duration-(--duration-enter) ease-avel"
		>
			<header className="flex items-start gap-3">
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<h2 className="type-panel-title text-foreground">
						{`${a.name} → ${b.name}`}
					</h2>
					<p
						data-testid="preset-compare-cut"
						className="type-caption text-text-subtle"
					>
						{diff.cutDiffers
							? `${CUT_LABEL[a.cut]} → ${CUT_LABEL[b.cut]}: a different kind of roster.`
							: `Both ${CUT_LABEL[a.cut].toLowerCase()}.`}
					</p>
				</div>
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label="Stop comparing"
					data-testid="preset-compare-clear"
					onClick={onClear}
				>
					<X aria-hidden="true" />
				</Button>
			</header>

			{nothing ? (
				<p
					data-testid="preset-compare-alike"
					className="type-small text-text-muted"
				>
					The two squads are alike, agent for agent.
				</p>
			) : (
				<div className="grid gap-4 md:grid-cols-2">
					<SideBoard
						preset={a}
						names={names}
						only={diff.onlyA}
						changed={diff.changed.map((c) => c.a)}
						testid="preset-compare-a"
						from="left"
					/>
					<SideBoard
						preset={b}
						names={names}
						only={diff.onlyB}
						changed={diff.changed.map((c) => c.b)}
						testid="preset-compare-b"
						from="right"
					/>
				</div>
			)}

			{diff.changed.length > 0 ? (
				<div
					data-testid="preset-compare-changed"
					className="flex flex-col gap-2"
				>
					<h3 className="type-small font-medium text-foreground">
						Set differently
					</h3>
					<ul className="flex flex-col gap-2">
						{diff.changed.map(({ a: from, b: to, fields }, i) => (
							<li
								key={presetAgentKey(from)}
								// Rows fade in 30ms apart, the stagger capped at six.
								style={{ animationDelay: `${Math.min(i, 6) * 30}ms` }}
								className="flex flex-col gap-1 motion-safe:animate-in motion-safe:fade-in-0 fill-mode-both duration-(--duration-state) ease-avel"
								data-testid={`preset-compare-change-${presetAgentKey(from)}`}
							>
								<span className="type-small text-foreground">
									{agentName(from, names)}
								</span>
								<dl className="flex flex-col gap-0.5 pl-3">
									{fields.map((field) => (
										<div key={field} className="flex flex-wrap gap-x-2">
											<dt className="type-caption text-text-subtle">
												{FIELD_LABEL[field]}
											</dt>
											<dd className="type-mono-small text-text-muted">
												{`${fieldText(from, field)} → ${fieldText(to, field)}`}
											</dd>
										</div>
									))}
								</dl>
							</li>
						))}
					</ul>
				</div>
			) : null}

			<p
				data-testid="preset-compare-same"
				className="type-caption text-text-subtle tabular-nums"
			>
				{diff.same.length === 1
					? "1 agent alike in both"
					: `${diff.same.length} agents alike in both`}
			</p>
		</section>
	);
}

/**
 * One side of a comparison: the preset's own wave board, each chip marked
 * when only this preset has the agent, or both have it set differently.
 */
function SideBoard({
	preset,
	names,
	only,
	changed,
	testid,
	from,
}: {
	preset: Preset;
	names: Names;
	only: PresetAgent[];
	changed: PresetAgent[];
	testid: string;
	/** The side it slides in from: the two boards slide together. */
	from: "left" | "right";
}) {
	const onlyKeys = new Set(only.map(presetAgentKey));
	const changedKeys = new Set(changed.map(presetAgentKey));
	return (
		<div
			data-testid={testid}
			className={cn(
				"flex flex-col gap-1.5 motion-safe:animate-in duration-(--duration-enter) ease-avel",
				from === "left"
					? "motion-safe:slide-in-from-left-4"
					: "motion-safe:slide-in-from-right-4",
			)}
		>
			<h3 className="type-small font-medium text-foreground">{preset.name}</h3>
			<WaveGrid
				preset={preset}
				names={names}
				diffOf={(agent) => {
					const key = presetAgentKey(agent);
					if (onlyKeys.has(key)) return "only";
					if (changedKeys.has(key)) return "changed";
					return undefined;
				}}
			/>
		</div>
	);
}
