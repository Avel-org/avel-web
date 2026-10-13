import { type AgentTemplate, WAVES, type Wave } from "avel-server/contract";
import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import {
	artifactLabel,
	firstWave,
	isFirmAgent,
	type SampleEdge,
	sampleEdges,
	sideOf,
} from "./catalog-agent-placeholders";

/*
 * The artifact graph: agents as nodes in wave columns A to D, Operate (E)
 * set apart, and firm agents (who work between missions and join no wave) in
 * a band of their own below, with an arrow from each producer to each
 * consumer, labelled with the artifacts it carries and their short hashes. Inline SVG coloured
 * by token classes (fill-*, stroke-*), no chart library. Every node is
 * focusable and opens the inspector on Enter or Space, as a click does.
 */

const NODE_W = 148;
const NODE_H = 48;
const COL_W = 220;
const ROW_H = 112;
const PAD = 24;
/** Room left of wave A for an edge that loops within one column. */
const LOOP = 48;
const HEADER = 36;
/** Extra room before E: Operate runs after the ship decision, apart. */
const E_GAP = 56;
/** Room above the firm band, for its rule and its label. */
const FIRM_GAP = 40;
/** The E column's width: its label, 26 mono characters, runs past a node. */
export const E_LABEL_W = 210;
/** How far the graph may shrink to fit its column before it scrolls. */
const MIN_SCALE = 0.8;

/** A node's place: a wave column, or the firm band. */
export type Lane = Wave | "firm";

type Placed = { agent: AgentTemplate; lane: Lane; x: number; y: number };

const columnX = (wave: Wave) =>
	PAD + LOOP + WAVES.indexOf(wave) * COL_W + (wave === "E" ? E_GAP : 0);

const byName = (a: AgentTemplate, b: AgentTemplate) =>
	a.name.localeCompare(b.name);

/** How many rows the tallest wave column needs. */
const waveRows = (agents: readonly AgentTemplate[]) =>
	Math.max(
		1,
		...WAVES.map(
			(wave) =>
				agents.filter((a) => !isFirmAgent(a) && firstWave(a) === wave).length,
		),
	);

/** The top of the firm band: below every wave column, past its rule. */
const firmTop = (agents: readonly AgentTemplate[]) =>
	PAD + HEADER + waveRows(agents) * ROW_H + FIRM_GAP;

/**
 * Each agent's place: its first wave's column, rows in name order. A firm
 * agent goes in the firm band instead, left to right in name order, since it
 * never joins a mission's waves.
 */
export function layoutGraph(agents: readonly AgentTemplate[]): Placed[] {
	const placed: Placed[] = [];
	for (const wave of WAVES) {
		const column = agents
			.filter((agent) => !isFirmAgent(agent) && firstWave(agent) === wave)
			.sort(byName);
		column.forEach((agent, row) => {
			placed.push({
				agent,
				lane: wave,
				x: columnX(wave),
				y: PAD + HEADER + row * ROW_H,
			});
		});
	}
	agents
		.filter(isFirmAgent)
		.sort(byName)
		.forEach((agent, i) => {
			placed.push({
				agent,
				lane: "firm",
				x: columnX("A") + i * COL_W,
				y: firmTop(agents),
			});
		});
	return placed;
}

/** An edge's path, its arrow at the consumer, and where its label sits. */
function route(from: Placed, to: Placed) {
	const y1 = from.y + NODE_H / 2;
	const y2 = to.y + NODE_H / 2;
	const x1 = from.x + NODE_W;
	if (to.x > from.x) {
		const x2 = to.x;
		const bend = (x2 - x1) / 2;
		return {
			d: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`,
			label: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 },
		};
	}
	// Same column, or backwards: leave by the left side and loop back in
	// on the left, clear of the next column's nodes.
	const x0 = from.x;
	const x2 = to.x;
	const out = Math.min(x0, x2) - LOOP + 8;
	return {
		d: `M ${x0} ${y1} C ${out} ${y1}, ${out} ${y2}, ${x2} ${y2}`,
		label: { x: out + 4, y: (y1 + y2) / 2 },
	};
}

export function AgentGraph({
	agents,
	selected,
	onOpen,
}: {
	agents: readonly AgentTemplate[];
	/** The agent whose edges print their artifacts; none on the list. */
	selected?: string;
	onOpen: (slug: string) => void;
}) {
	const placed = layoutGraph(agents);
	const at = new Map(placed.map((p) => [p.agent.slug, p]));
	const edges = sampleEdges(agents);
	const hasFirm = placed.some((p) => p.lane === "firm");
	// E's label, "wave E, operate, set apart", is wider than a node.
	const width = columnX("E") + E_LABEL_W + PAD;
	const height = hasFirm
		? firmTop(agents) + NODE_H + PAD
		: PAD * 2 + HEADER + waveRows(agents) * ROW_H;
	const markerId = "catalog-agent-graph-arrow";

	const open = (slug: string) => (event: KeyboardEvent<SVGGElement>) => {
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		onOpen(slug);
	};

	return (
		<section
			aria-label="Artifact graph: agents by wave, arrows from producer to consumer"
			className="app-scroll overflow-x-auto"
		>
			{/* It scales to its column, down to MIN_SCALE; past that it scrolls,
			    so a narrow window never shrinks its text below legible. */}
			<svg
				data-testid="catalog-agent-graph"
				viewBox={`0 0 ${width} ${height}`}
				style={{
					width: "100%",
					minWidth: Math.round(width * MIN_SCALE),
					maxWidth: width,
					height: "auto",
				}}
				className="type-mono-small"
			>
				<title>Artifact graph</title>
				<defs>
					<marker
						id={markerId}
						viewBox="0 0 8 8"
						refX="7"
						refY="4"
						markerWidth="8"
						markerHeight="8"
						orient="auto-start-reverse"
					>
						<path d="M 0 0 L 8 4 L 0 8 z" className="fill-text-subtle" />
					</marker>
				</defs>

				{/* Wave columns, with Operate fenced off by a dashed rule. */}
				{WAVES.map((wave) => (
					<text
						key={wave}
						data-testid={`catalog-agent-graph-wave-${wave}`}
						x={columnX(wave)}
						y={PAD + 12}
						className="fill-text-subtle"
					>
						{wave === "E" ? "wave E, operate, set apart" : `wave ${wave}`}
					</text>
				))}
				{hasFirm ? (
					<g data-testid="catalog-agent-graph-firm">
						<line
							x1={PAD}
							x2={width - PAD}
							y1={firmTop(agents) - FIRM_GAP + 8}
							y2={firmTop(agents) - FIRM_GAP + 8}
							strokeDasharray="4 4"
							className="stroke-border"
						/>
						<text
							data-testid="catalog-agent-graph-lane-firm"
							x={columnX("A")}
							y={firmTop(agents) - 12}
							className="fill-text-subtle"
						>
							firm, between missions
						</text>
					</g>
				) : null}
				<line
					x1={columnX("E") - E_GAP / 2 - 16}
					x2={columnX("E") - E_GAP / 2 - 16}
					y1={PAD}
					y2={hasFirm ? firmTop(agents) - FIRM_GAP + 8 : height - PAD}
					strokeDasharray="4 4"
					className="stroke-border"
				/>

				{edges.map((edge) => (
					<GraphEdge
						key={`${edge.from}->${edge.to}`}
						edge={edge}
						from={at.get(edge.from)}
						to={at.get(edge.to)}
						markerId={markerId}
						labelled={edge.from === selected || edge.to === selected}
					/>
				))}

				{placed.map(({ agent, lane, x, y }) => {
					const isSelected = agent.slug === selected;
					return (
						// biome-ignore lint/a11y/useSemanticElements: an SVG node cannot be a button element; role and keys make it one
						<g
							key={agent.slug}
							data-testid={`catalog-agent-node-${agent.slug}`}
							data-selected={isSelected || undefined}
							role="button"
							tabIndex={0}
							aria-label={`${agent.name}, ${lane === "firm" ? "firm, between missions" : `wave ${lane}`}. Open its page`}
							transform={`translate(${x} ${y})`}
							onClick={() => onOpen(agent.slug)}
							onKeyDown={open(agent.slug)}
							className="group cursor-pointer outline-none"
						>
							<rect
								width={NODE_W}
								height={NODE_H}
								rx={6}
								className={cn(
									"fill-app-panel stroke-border-strong transition-colors duration-(--duration-micro) ease-avel group-hover:fill-state-hover group-focus-visible:stroke-accent",
									isSelected && "stroke-accent",
								)}
								strokeWidth={isSelected ? 2 : 1}
							/>
							<text x={10} y={20} className="fill-foreground font-medium">
								{agent.name}
							</text>
							{/* Two facts, two elements with a gap: no middle dot (ruling 4). */}
							<text x={10} y={37} className="fill-text-subtle">
								<tspan>{sideOf(agent) ?? "firm"}</tspan>
								<tspan dx={8}>{`v${agent.version}`}</tspan>
							</text>
						</g>
					);
				})}
			</svg>
		</section>
	);
}

function GraphEdge({
	edge,
	from,
	to,
	markerId,
	labelled,
}: {
	edge: SampleEdge;
	from: Placed | undefined;
	to: Placed | undefined;
	markerId: string;
	/** Print the artifacts on the edge: only the selected agent's edges. */
	labelled: boolean;
}) {
	if (!from || !to) return null;
	const { d, label } = route(from, to);
	const lines = edge.artifacts.map(artifactLabel);
	return (
		<g
			data-testid={`catalog-agent-edge-${edge.from}-${edge.to}`}
			data-labelled={labelled || undefined}
		>
			{/* Every edge names its artifacts on hover, labelled or not. */}
			<title>{lines.join(", ")}</title>
			<path
				d={d}
				fill="none"
				markerEnd={`url(#${markerId})`}
				className={labelled ? "stroke-accent" : "stroke-border-strong"}
			/>
			{labelled ? (
				<text
					x={label.x}
					y={label.y - ((lines.length - 1) * 13) / 2}
					textAnchor="middle"
					// A halo in the canvas colour keeps a label legible over a line.
					paintOrder="stroke"
					strokeWidth={4}
					className="fill-text-muted stroke-card"
				>
					{lines.map((line, i) => (
						<tspan
							key={line}
							x={label.x}
							dy={i === 0 ? 0 : 13}
							data-testid="catalog-agent-edge-label"
						>
							{line}
						</tspan>
					))}
				</text>
			) : null}
		</g>
	);
}
