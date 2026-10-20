import { Link } from "@tanstack/react-router";
import { type AgentTemplate, WAVES, type Wave } from "avel-server/contract";
import { ArrowUpRight, X } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ActorMark } from "./actor";
import { CanvasHint, CanvasSurface, useCanvasHint } from "./canvas";
import {
	AGENT_MISSING,
	artifactLabel,
	firstWave,
	isFirmAgent,
	type SampleEdge,
	sampleEdges,
	sideOf,
} from "./catalog-agent-placeholders";
import { SampleRegion } from "./catalog-sample";

/*
 * The artifact graph: agents as nodes in wave columns A to D, Operate (E)
 * set apart, and firm agents (who work between missions and join no wave) in
 * a band of their own below, with an arrow from each producer to each
 * consumer, labelled with the artifacts it carries and their short hashes. Inline SVG coloured
 * by token classes (fill-*, stroke-*), no chart library; each node is a v3
 * card in HTML within it. On the builders' canvas: a node chosen (click,
 * Enter or Space) lights its handoffs and docks them beside the graph, with
 * a link on to the agent's page.
 */

const GRAPH_HINT =
	"Select an agent to light up its handoffs and show them beside the graph. An arrow runs from the agent that makes a file to each agent that reads it. Esc closes them.";

/**
 * The graph on the canvas, with the chosen agent's handoffs docked on it.
 * Nothing slides over the list (the agents ruling): the handoffs are an
 * inline panel, as pre-flight is docked on the Playbook canvas. It sits
 * beside the graph at 2xl; narrower, the graph needs the whole width to keep
 * wave E in view, so the panel docks above it instead.
 */
export function AgentGraphCanvas({
	agents,
	initialSelected,
}: {
	agents: readonly AgentTemplate[];
	/** For a test: start with this agent chosen and its handoffs shown. */
	initialSelected?: string;
}) {
	const [selected, setSelected] = useState(initialSelected);
	const [hintShown, dismissHint] = useCanvasHint("avel.agents.graph-hint");
	const agent = agents.find((a) => a.slug === selected);
	const edges = sampleEdges(agents);
	const nameOf = (slug: string) =>
		agents.find((a) => a.slug === slug)?.name ?? slug;
	return (
		<CanvasSurface
			data-testid="catalog-agent-graph-canvas"
			onKeyDown={(event) => {
				if (event.key === "Escape" && selected !== undefined) {
					event.preventDefault();
					setSelected(undefined);
				}
			}}
		>
			{hintShown ? (
				<CanvasHint
					data-testid="catalog-agent-graph-hint"
					onDismiss={dismissHint}
				>
					{GRAPH_HINT}
				</CanvasHint>
			) : null}
			<div
				className={cn(
					"grid items-start gap-3",
					agent && "2xl:grid-cols-[minmax(0,1fr)_18rem]",
				)}
			>
				<div className="min-w-0 rounded-card border border-border bg-app-panel p-3 shadow-card">
					<AgentGraph
						agents={agents}
						selected={selected}
						onOpen={setSelected}
					/>
				</div>
				{agent ? (
					<aside
						aria-label={`${agent.name}: handoffs`}
						data-testid="catalog-agent-graph-details"
						className="order-first flex flex-col gap-3 rounded-card border border-border bg-app-panel p-3 shadow-card 2xl:order-none"
					>
						<header className="flex items-start gap-2">
							<div className="flex min-w-0 flex-1 flex-col">
								<h3 className="truncate type-title text-text">{agent.name}</h3>
								<p className="type-caption text-text-muted">
									{`${isFirmAgent(agent) ? "Firm agent, between missions" : `Wave ${firstWave(agent)}`}, v${agent.version}`}
								</p>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label="Close the handoffs"
								data-testid="catalog-agent-graph-close"
								onClick={() => setSelected(undefined)}
							>
								<X aria-hidden="true" />
							</Button>
						</header>
						<Button asChild variant="outline" size="sm" className="self-start">
							<Link
								to="/catalog/agents/$slug"
								params={{ slug: agent.slug }}
								data-testid="catalog-agent-graph-open"
							>
								Open its page
								<ArrowUpRight aria-hidden="true" />
							</Link>
						</Button>
						<SampleRegion
							missing={AGENT_MISSING.edges}
							title="Handoffs"
							what="What this agent hands on and what it reads, each file with its hash."
							data-testid="catalog-agent-graph-handoffs"
						>
							{(["makes", "reads"] as const).map((way) => {
								const list = edges.filter((e) =>
									way === "makes" ? e.from === agent.slug : e.to === agent.slug,
								);
								return (
									<section key={way} className="flex flex-col gap-1.5">
										<h4 className="type-eyebrow">
											{way === "makes" ? "Hands on to" : "Reads from"}
										</h4>
										{list.length === 0 ? (
											<p className="type-small text-text-subtle">
												{way === "makes"
													? "No agent here reads what it makes."
													: "It reads nothing these agents make."}
											</p>
										) : (
											<ul
												data-testid={`catalog-agent-graph-${way}`}
												className="flex flex-col gap-1.5"
											>
												{list.map((e) => {
													const other = way === "makes" ? e.to : e.from;
													return (
														<li
															key={other}
															className="flex flex-col gap-0.5 rounded-control border border-border bg-app-well px-2.5 py-2"
														>
															<span className="type-small font-medium text-text">
																{nameOf(other)}
															</span>
															<span className="type-mono break-all text-text-muted">
																{e.artifacts.map(artifactLabel).join(", ")}
															</span>
														</li>
													);
												})}
											</ul>
										)}
									</section>
								);
							})}
						</SampleRegion>
					</aside>
				) : null}
			</div>
		</CanvasSurface>
	);
}

// The geometry is held to the canvas at 1280 and up, as every canvas is:
// columns 180 apart and Operate's gap 32 make the drawing 1010 wide, which
// the canvas holds at 1280 with no sideways scroll.
const NODE_W = 148;
const NODE_H = 48;
const COL_W = 180;
/** A row: the 48px card and room for the edges between rows, no more. */
const ROW_H = 80;
const PAD = 24;
/** Room left of wave A for an edge that loops within one column. */
const LOOP = 40;
const HEADER = 36;
/** Extra room before E: Operate runs after the ship decision, apart. */
const E_GAP = 32;
/** Room above the firm band, for its rule and its label. */
const FIRM_GAP = 40;
/** The E column's width: its label, 20 mono characters, runs past a node. */
export const E_LABEL_W = 170;
/**
 * How far the graph may shrink to fit its column before it scrolls: 0.7
 * keeps the cards' text legible, and is reached only below 1280.
 */
const MIN_SCALE = 0.7;

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
	/** The agent whose edges print their artifacts; none until one is chosen. */
	selected?: string;
	/** A node chosen, by click, Enter or Space. */
	onOpen: (slug: string) => void;
}) {
	const placed = layoutGraph(agents);
	const at = new Map(placed.map((p) => [p.agent.slug, p]));
	const edges = sampleEdges(agents);
	const hasFirm = placed.some((p) => p.lane === "firm");
	// E's label, "wave E, after launch", is wider than a node.
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
			aria-label="Handoff graph: agents by wave, with an arrow from each agent that makes a file to each agent that reads it"
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
				className="type-mono"
			>
				<title>Handoff graph</title>
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
						{wave === "E" ? "wave E, after launch" : `wave ${wave}`}
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
							firm agents, between missions
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
							aria-pressed={isSelected}
							aria-label={`${agent.name}, ${lane === "firm" ? "firm agent, between missions" : `wave ${lane}`}. Show its handoffs and details`}
							transform={`translate(${x} ${y})`}
							onClick={() => onOpen(agent.slug)}
							onKeyDown={open(agent.slug)}
							className="group cursor-pointer outline-none"
						>
							{/* A v3 card, drawn in HTML inside the drawing so it takes the
							    card's radius, shadow and the one selected state (R10);
							    it scales with the graph. */}
							<foreignObject width={NODE_W} height={NODE_H}>
								<div
									data-slot="graph-card"
									className={cn(
										"flex size-full items-center gap-2 rounded-card border px-2 font-sans transition-colors duration-(--duration-micro) ease-avel group-focus-visible:outline-2 group-focus-visible:outline-focus-ring",
										isSelected
											? "border-selected-border bg-selected"
											: "border-border bg-app-panel shadow-card group-hover:border-border-strong group-hover:bg-app-raised",
									)}
								>
									<ActorMark kind="agent" name={agent.name} />
									<span className="flex min-w-0 flex-col leading-tight">
										<span className="truncate type-small font-medium text-text">
											{agent.name}
										</span>
										{/* Two facts, two elements with a gap: no middle dot (ruling 4). */}
										<span className="flex gap-2 type-caption text-text-subtle">
											<span>{sideOf(agent) ?? "firm"}</span>
											<span className="type-mono">{`v${agent.version}`}</span>
										</span>
									</span>
								</div>
							</foreignObject>
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
