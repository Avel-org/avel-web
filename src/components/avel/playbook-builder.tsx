import { Link } from "@tanstack/react-router";
import type { Gate, Playbook, Wave } from "avel-server/contract";
import { ArrowUpRight, Plus, X } from "lucide-react";
import {
	type CSSProperties,
	type KeyboardEvent,
	type ReactNode,
	useId,
	useReducer,
	useRef,
	useState,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isNotFound } from "@/lib/api/catalog";
import type { ApiError } from "@/lib/api/errors";
import { usePlaybook } from "@/lib/api/playbooks";
import { cn } from "@/lib/utils";
import { DELIVERABLE_LABEL, POLICY_LABEL } from "./playbook-list";
import {
	addableGates,
	type DraftAction,
	draftChanges,
	draftOf,
	draftReducer,
	moveSelection,
	type NodeId,
	type PipelineNode,
	type PlaybookDraft,
	pipelineOf,
} from "./playbook-pipeline";
import { PublishModal } from "./playbook-publish";
import { PlaybookSections } from "./playbook-sections";
import { PlaybookVersions } from "./playbook-versions";
import { SectionPanel } from "./section-panel";
import { ErrorState, type ErrorStateProps, Surface } from "./surface";
import { WhatChanges } from "./what-changes";

/*
 * The playbook builder (ruling 36): one playbook as a working surface. A
 * vertical pipeline on the canvas (waves A to E, then gates, then the
 * deliverable), a Properties panel for the selected node, and pre-flight
 * beside it. Edits are live in the page as a draft: the canvas and the dirty
 * banner follow them, and nothing is sent until Publish. The keyboard walks
 * the rail:
 * arrows move, Enter opens the node's properties, Esc clears the selection.
 */

export function PlaybookBuilder({
	missionType,
	preflight,
	sections = true,
}: {
	missionType: string;
	/** The panel's pre-flight block: coherence on a mission's page. */
	preflight?: ReactNode;
	/** The sections below the canvas; a mission's page has its own. */
	sections?: boolean;
}) {
	const playbook = usePlaybook(missionType);
	return (
		<Surface
			data-testid="playbook-builder"
			query={playbook}
			loading={<BuilderSkeleton />}
			// A playbook is never "empty": it exists, or the type has none.
			empty={null}
			isEmpty={() => false}
			error={BuilderError}
		>
			{(data) => (
				<PlaybookBuilderBody
					// A newer version starts a fresh draft.
					key={`${data.id}:${data.version}`}
					playbook={data}
					preflight={preflight ?? <TypePreflight missionType={missionType} />}
					sections={sections}
				/>
			)}
		</Surface>
	);
}

/** The error map's copy, and a way back for a type with no live playbook. */
function BuilderError(props: ErrorStateProps<ApiError>) {
	return (
		<div className="flex flex-col gap-3">
			<ErrorState {...props} />
			{isNotFound(props.error) ? (
				<Button asChild variant="outline" size="sm" className="self-start">
					<Link to="/playbooks" data-testid="playbook-builder-back">
						Back to playbooks
					</Link>
				</Button>
			) : null}
		</div>
	);
}

/** On the type's own page, pre-flight is per mission: say so, and link them. */
function TypePreflight({ missionType }: { missionType: string }) {
	return (
		<div data-testid="playbook-preflight-type" className="flex flex-col gap-2">
			<p className="type-small text-text-muted">
				Pre-flight runs per mission, against each mission's roster.
			</p>
			<Button asChild variant="outline" size="sm" className="self-start">
				<Link
					to="/missions"
					search={(prev) => ({ ...prev, q: missionType })}
					data-testid="playbook-preflight-missions"
				>
					{`Missions of type ${missionType}`}
					<ArrowUpRight aria-hidden="true" />
				</Link>
			</Button>
		</div>
	);
}

/**
 * The loaded builder. `initialDraft` starts it from a draft other than the
 * stored playbook (a test, or a draft kept across a reload), and
 * `initialSelected` with a node already selected.
 */
export function PlaybookBuilderBody({
	playbook,
	preflight,
	initialDraft,
	initialSelected = null,
	sections = false,
}: {
	playbook: Playbook;
	preflight: ReactNode;
	initialDraft?: PlaybookDraft;
	initialSelected?: NodeId | null;
	sections?: boolean;
}) {
	const [draft, dispatch] = useReducer(
		draftReducer,
		playbook,
		(stored) => initialDraft ?? draftOf(stored),
	);
	const [selected, setSelected] = useState<NodeId | null>(initialSelected);
	const [publishing, setPublishing] = useState(false);
	const panelHeading = useRef<HTMLHeadingElement>(null);
	const nodes = pipelineOf(draft);
	const changes = draftChanges(playbook, draft);
	const edit = (action: DraftAction) => {
		dispatch(action);
	};

	return (
		<Tabs
			defaultValue="builder"
			data-testid="playbook-builder-content"
			className="flex flex-col gap-4"
		>
			<TabsList aria-label="Playbook">
				{(
					[
						["builder", "Builder"],
						["runs", "Runs"],
						["versions", "Versions"],
					] as const
				).map(([id, label]) => (
					<TabsTrigger key={id} value={id} data-testid={`playbook-tab-${id}`}>
						{label}
					</TabsTrigger>
				))}
			</TabsList>
			<TabsContent value="builder" className="flex flex-col gap-4">
				{changes.length > 0 ? (
					<DirtyBanner
						version={playbook.version}
						count={changes.length}
						onRevert={() => {
							// The stored playbook, again: every edit undone.
							dispatch({ type: "reset", to: draftOf(playbook) });
						}}
						onPublish={() => setPublishing(true)}
					>
						<WhatChanges
							changes={changes}
							data-testid="playbook-dirty-changes"
						/>
					</DirtyBanner>
				) : null}
				<div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
					<PipelineCanvas
						nodes={nodes}
						selected={selected}
						onSelect={setSelected}
						onOpen={() => panelHeading.current?.focus()}
					/>
					<PropertiesPanel
						playbook={playbook}
						draft={draft}
						node={nodes.find((n) => n.id === selected) ?? null}
						headingRef={panelHeading}
						onEdit={edit}
						onClear={() => setSelected(null)}
						preflight={preflight}
					/>
				</div>
				{sections ? (
					<PlaybookSections playbook={playbook} draft={draft} />
				) : null}
			</TabsContent>
			<TabsContent value="runs">
				<Surface
					data-testid="playbook-runs"
					notBuilt={{
						title: "Runs",
						what: "Every mission that ran this playbook, with where each one stopped.",
						needs: [],
					}}
				/>
			</TabsContent>
			<TabsContent value="versions">
				<PlaybookVersions missionType={playbook.missionType} />
			</TabsContent>
			<PublishModal
				open={publishing}
				onOpenChange={setPublishing}
				playbook={playbook}
				draft={draft}
				changes={changes}
			/>
		</Tabs>
	);
}

function DirtyBanner({
	count,
	version,
	onRevert,
	onPublish,
	children,
}: {
	count: number;
	/** The stored version: publishing makes the next one. */
	version: number;
	onRevert: () => void;
	onPublish: () => void;
	children: ReactNode;
}) {
	return (
		<section
			aria-label="Unpublished changes"
			data-testid="playbook-dirty"
			className="animate-slide-down flex flex-col gap-2 rounded-md border border-gate-warn-line bg-gate-warn-soft p-3"
		>
			<div className="flex flex-wrap items-center gap-2">
				<p className="mr-auto type-small font-medium text-foreground">
					{`Unpublished changes (${count})`}
				</p>
				<span
					data-testid="playbook-next-version"
					className="inline-flex items-center gap-1 overflow-hidden type-mono-small text-text-muted"
				>
					<span>{`v${version}`}</span>
					<span aria-hidden="true">→</span>
					<span className="sr-only">publishes as</span>
					<span className="inline-block animate-tick-up text-foreground">
						{`v${version + 1}`}
					</span>
				</span>
				<Button
					variant="ghost"
					size="sm"
					data-testid="playbook-revert"
					onClick={onRevert}
				>
					Revert
				</Button>
				<Button size="sm" data-testid="playbook-publish" onClick={onPublish}>
					Publish playbook
				</Button>
			</div>
			{children}
		</section>
	);
}

// ---------------------------------------------------------------------------
// The canvas.

const NODE_W = 248;
const NODE_H = 44;
const ROW = 64;
const PAD = 16;
/** Room for a segment's label above its first node. */
const LABEL = 24;
const WIDTH = NODE_W + PAD * 2;

const SEGMENT_LABEL = {
	wave: "Waves",
	gate: "Gates",
	deliverable: "Delivers",
} as const;

/** Each node's top edge: a row apiece, plus a label row where a segment starts. */
export function nodeTops(nodes: readonly PipelineNode[]): number[] {
	let y = PAD;
	return nodes.map((node, i) => {
		if (i === 0 || nodes[i - 1]?.kind !== node.kind) y += LABEL;
		const top = y;
		y += ROW;
		return top;
	});
}

function PipelineCanvas({
	nodes,
	selected,
	onSelect,
	onOpen,
}: {
	nodes: PipelineNode[];
	selected: NodeId | null;
	onSelect: (id: NodeId | null) => void;
	onOpen: () => void;
}) {
	const markerId = useId();
	const refs = useRef(new Map<NodeId, SVGGElement>());
	const tops = nodeTops(nodes);
	const height = (tops.at(-1) ?? 0) + NODE_H + PAD;
	// Roving focus: the selected node, else the first, takes Tab.
	const focusable = selected ?? nodes[0]?.id ?? null;

	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "Escape") {
			if (selected !== null) {
				event.preventDefault();
				onSelect(null);
			}
			return;
		}
		if (event.key === "Enter" || event.key === " ") {
			const id = (event.target as Element).getAttribute("data-node");
			if (id) {
				event.preventDefault();
				onSelect(id as NodeId);
				onOpen();
			}
			return;
		}
		const next = moveSelection(nodes, selected, event.key);
		if (next === null) return;
		event.preventDefault();
		onSelect(next);
		refs.current.get(next)?.focus();
	};

	return (
		<section
			aria-label="Pipeline"
			data-testid="playbook-canvas"
			className="plate overflow-x-auto rounded-md p-2"
		>
			<p className="px-2 pt-1 type-caption text-text-subtle">
				Arrows move along the rail. Enter opens a step's properties. Esc clears.
			</p>
			<div
				role="toolbar"
				aria-orientation="vertical"
				aria-label="Waves, gates and deliverable, in order"
				onKeyDown={onKeyDown}
			>
				<svg
					viewBox={`0 0 ${WIDTH} ${height}`}
					width={WIDTH}
					height={height}
					className="mx-auto block type-small"
				>
					<title>The playbook's pipeline</title>
					<defs>
						<marker
							id={markerId}
							viewBox="0 0 8 8"
							refX="7"
							refY="4"
							markerWidth="8"
							markerHeight="8"
							// Drawn pointing along +x; auto turns it down the rail.
							orient="auto"
						>
							<path d="M 0 0 L 8 4 L 0 8 z" className="fill-text-subtle" />
						</marker>
					</defs>
					{nodes.map((node, i) => {
						const top = tops[i] ?? 0;
						const next = tops[i + 1];
						const startsSegment = i === 0 || nodes[i - 1]?.kind !== node.kind;
						return (
							<g key={node.id}>
								{startsSegment ? (
									<text
										x={PAD}
										y={top - 8}
										className="fill-text-subtle type-caption"
										data-testid={`playbook-segment-${node.kind}`}
									>
										{SEGMENT_LABEL[node.kind]}
									</text>
								) : null}
								{next !== undefined ? (
									<line
										x1={WIDTH / 2}
										x2={WIDTH / 2}
										y1={top + NODE_H}
										y2={next - 2}
										markerEnd={`url(#${markerId})`}
										strokeDasharray={
											node.kind === "wave" && !node.applicable
												? "3 3"
												: undefined
										}
										// The playbook family's signature: the rail draws on.
										className={cn(
											"stroke-border-strong",
											!(node.kind === "wave" && !node.applicable) &&
												"animate-draw-on",
										)}
										style={
											{
												"--draw-length": `${next - 2 - (top + NODE_H)}px`,
											} as CSSProperties
										}
									/>
								) : null}
								<PipelineNodeView
									node={node}
									index={i}
									top={top}
									selected={node.id === selected}
									focusable={node.id === focusable}
									nodeRef={(el) => {
										if (el) refs.current.set(node.id, el);
										else refs.current.delete(node.id);
									}}
									onClick={() =>
										onSelect(node.id === selected ? null : node.id)
									}
								/>
							</g>
						);
					})}
				</svg>
			</div>
		</section>
	);
}

/** How a node names itself to a screen reader. */
export function nodeLabel(node: PipelineNode): string {
	switch (node.kind) {
		case "wave":
			return `Wave ${node.wave}, ${node.applicable ? "runs" : "skipped"}`;
		case "gate":
			return `Gate ${node.gate}, ${node.policy === "mandatory" ? "mandatory, a hard stop" : "warn, passes through"}`;
		case "deliverable":
			return `Delivers ${DELIVERABLE_LABEL[node.deliverable]}`;
	}
}

function PipelineNodeView({
	node,
	index,
	top,
	selected,
	focusable,
	nodeRef,
	onClick,
}: {
	node: PipelineNode;
	top: number;
	index: number;
	selected: boolean;
	focusable: boolean;
	nodeRef: (el: SVGGElement | null) => void;
	onClick: () => void;
}) {
	const skipped = node.kind === "wave" && !node.applicable;
	return (
		// biome-ignore lint/a11y/useSemanticElements: an SVG node cannot be a button element; role and keys make it one
		<g
			ref={nodeRef}
			role="button"
			tabIndex={focusable ? 0 : -1}
			aria-pressed={selected}
			aria-label={nodeLabel(node)}
			data-node={node.id}
			data-testid={`playbook-node-${node.id}`}
			data-kind={node.kind}
			data-state={skipped ? "skipped" : "live"}
			transform={`translate(${PAD} ${top})`}
			onClick={onClick}
			className={cn(
				"group cursor-pointer outline-none",
				skipped && "opacity-50",
			)}
		>
			<g className="animate-node-in" style={{ "--i": index } as CSSProperties}>
				<rect
					width={NODE_W}
					height={NODE_H}
					// Waves are cards, gates are pills, the deliverable is the end.
					rx={node.kind === "gate" ? NODE_H / 2 : 6}
					strokeDasharray={skipped ? "4 3" : undefined}
					strokeWidth={selected ? 2 : node.kind === "deliverable" ? 1.5 : 1}
					className={cn(
						"transition-colors duration-(--duration-state) ease-avel group-hover:fill-state-hover group-focus-visible:stroke-accent",
						selected
							? "fill-state-selected"
							: node.kind === "deliverable"
								? "fill-accent-soft"
								: "fill-app-panel",
						selected ? "stroke-accent" : "stroke-border-strong",
					)}
				/>
				<g
					key={node.kind === "gate" ? node.policy : node.kind}
					className="animate-node-in"
				>
					<NodeGlyph node={node} />
				</g>
				<text x={40} y={27} className="fill-foreground font-medium">
					{node.kind === "wave"
						? `Wave ${node.wave}`
						: node.kind === "gate"
							? node.gate
							: DELIVERABLE_LABEL[node.deliverable]}
				</text>
				{/* Two facts, two elements with a gap: no middle dot (ruling 4). */}
				<text
					x={NODE_W - 12}
					y={27}
					textAnchor="end"
					className="fill-text-subtle"
				>
					{node.kind === "wave"
						? node.applicable
							? "runs"
							: "skipped"
						: node.kind === "gate"
							? POLICY_LABEL[node.policy].toLowerCase()
							: "terminal"}
				</text>
			</g>
		</g>
	);
}

/**
 * A node's glyph, at its left: a wave's letter, a gate's policy (mandatory
 * is a hard stop, a filled square; warn passes through, an open chevron)
 * and the deliverable's end bar.
 */
function NodeGlyph({ node }: { node: PipelineNode }) {
	const cx = 20;
	const cy = NODE_H / 2;
	if (node.kind === "gate") {
		return node.policy === "mandatory" ? (
			<rect
				data-glyph="stop"
				x={cx - 6}
				y={cy - 6}
				width={12}
				height={12}
				rx={2}
				className="fill-gate-block"
			/>
		) : (
			<path
				data-glyph="pass"
				d={`M ${cx - 6} ${cy - 6} L ${cx + 2} ${cy} L ${cx - 6} ${cy + 6} M ${cx} ${cy - 6} L ${cx + 8} ${cy} L ${cx} ${cy + 6}`}
				fill="none"
				strokeWidth={1.75}
				className="stroke-gate-warn"
			/>
		);
	}
	if (node.kind === "deliverable") {
		return (
			<rect
				x={cx - 7}
				y={cy - 2}
				width={14}
				height={4}
				rx={1}
				className="fill-accent"
			/>
		);
	}
	return (
		<text
			x={cx}
			y={cy + 5}
			textAnchor="middle"
			className="type-mono fill-text-muted"
		>
			{node.wave}
		</text>
	);
}

// ---------------------------------------------------------------------------
// The panel.

function PropertiesPanel({
	playbook,
	draft,
	node,
	headingRef,
	onEdit,
	onClear,
	preflight,
}: {
	playbook: Playbook;
	draft: ReturnType<typeof draftOf>;
	node: PipelineNode | null;
	headingRef: React.Ref<HTMLHeadingElement>;
	onEdit: (action: DraftAction) => void;
	onClear: () => void;
	preflight: ReactNode;
}) {
	return (
		<aside
			aria-label="Properties"
			data-testid="playbook-panel"
			className="flex flex-col gap-4"
		>
			<Tabs defaultValue="properties" className="flex flex-col gap-3">
				<TabsList aria-label="Panel">
					<TabsTrigger
						value="properties"
						data-testid="playbook-panel-tab-properties"
					>
						Properties
					</TabsTrigger>
					<TabsTrigger
						value="versions"
						data-testid="playbook-panel-tab-versions"
					>
						Versions
					</TabsTrigger>
				</TabsList>
				<TabsContent value="properties">
					<section className="plate flex flex-col gap-4 rounded-md p-4">
						<header className="flex items-start gap-2">
							<h2
								ref={headingRef}
								tabIndex={-1}
								data-testid="playbook-panel-heading"
								className="mr-auto type-panel-title text-foreground outline-none"
							>
								{node ? nodeLabel(node) : playbook.name}
							</h2>
							{node ? (
								<Button
									variant="ghost"
									size="sm"
									data-testid="playbook-panel-clear"
									onClick={onClear}
								>
									Whole playbook
								</Button>
							) : null}
						</header>
						<div key={node?.id ?? "playbook"} className="animate-page-in">
							{node === null ? (
								<PlaybookProperties
									playbook={playbook}
									draft={draft}
									onEdit={onEdit}
								/>
							) : (
								<NodeProperties node={node} draft={draft} onEdit={onEdit} />
							)}
						</div>
					</section>
				</TabsContent>
				<TabsContent value="versions">
					<PlaybookVersions missionType={playbook.missionType} compact />
				</TabsContent>
			</Tabs>
			<SectionPanel title="Pre-flight checks" data-testid="playbook-preflight">
				{preflight}
			</SectionPanel>
		</aside>
	);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-1.5">
			<span className="type-caption text-text-subtle">{label}</span>
			{children}
		</div>
	);
}

function PlaybookProperties({
	playbook,
	draft,
	onEdit,
}: {
	playbook: Playbook;
	draft: ReturnType<typeof draftOf>;
	onEdit: (action: DraftAction) => void;
}) {
	const nameId = useId();
	return (
		<div data-testid="playbook-properties" className="flex flex-col gap-4">
			<div className="flex flex-col gap-1.5">
				<label htmlFor={nameId} className="type-caption text-text-subtle">
					Name
				</label>
				<Input
					id={nameId}
					data-testid="playbook-prop-name"
					value={draft.name}
					onChange={(e) => onEdit({ type: "setName", name: e.target.value })}
				/>
			</div>
			<Row label="Mission type">
				<span
					data-testid="playbook-prop-type"
					className="type-mono-small text-foreground"
				>
					{playbook.missionType}
				</span>
			</Row>
			<Row label="Deliverable">
				<DeliverableChoice draft={draft} onEdit={onEdit} />
			</Row>
			<Row label="Waves">
				<WaveSwitches draft={draft} onEdit={onEdit} />
			</Row>
			<Row label="Gates">
				<GateList draft={draft} onEdit={onEdit} />
			</Row>
			<Row label="Required fields">
				<ul
					data-testid="playbook-prop-fields"
					className="flex flex-wrap gap-1.5"
				>
					{draft.requiredFields.length === 0 ? (
						<li className="type-small text-text-subtle">None required.</li>
					) : (
						draft.requiredFields.map((field) => (
							<li key={field} className="inline-flex items-center gap-0.5">
								<Badge variant="tag">{field}</Badge>
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label={`Remove ${field}`}
									data-testid={`playbook-prop-remove-field-${field}`}
									onClick={() => onEdit({ type: "removeField", field })}
								>
									<X aria-hidden="true" />
								</Button>
							</li>
						))
					)}
				</ul>
				<AddField
					existing={draft.requiredFields}
					onAdd={(field) => onEdit({ type: "addField", field })}
				/>
			</Row>
			<Row label="Default team">
				<div className="flex flex-wrap items-center gap-2">
					<span
						className="type-mono-small text-text-muted"
						title={playbook.defaultPresetId}
					>
						{playbook.defaultPresetId.slice(0, 8)}
					</span>
					<Button asChild variant="outline" size="sm">
						<Link
							to="/presets"
							search={{ preset: playbook.defaultPresetId }}
							data-testid="playbook-preset-link"
						>
							Open team
							<ArrowUpRight aria-hidden="true" />
						</Link>
					</Button>
				</div>
			</Row>
		</div>
	);
}

function DeliverableChoice({
	draft,
	onEdit,
}: {
	draft: ReturnType<typeof draftOf>;
	onEdit: (action: DraftAction) => void;
}) {
	return (
		<fieldset
			data-testid="playbook-prop-deliverable"
			className="flex flex-wrap gap-1"
		>
			<legend className="sr-only">Deliverable</legend>
			{(["pr", "report", "recommendation"] as const).map((d) => (
				<Button
					key={d}
					size="sm"
					variant={draft.deliverable === d ? "secondary" : "ghost"}
					aria-pressed={draft.deliverable === d}
					data-testid={`playbook-prop-deliverable-${d}`}
					onClick={() => onEdit({ type: "setDeliverable", deliverable: d })}
				>
					{DELIVERABLE_LABEL[d]}
				</Button>
			))}
		</fieldset>
	);
}

function WaveSwitches({
	draft,
	onEdit,
}: {
	draft: ReturnType<typeof draftOf>;
	onEdit: (action: DraftAction) => void;
}) {
	return (
		<ul data-testid="playbook-prop-waves" className="flex flex-col gap-1.5">
			{(["A", "B", "C", "D", "E"] as const satisfies readonly Wave[]).map(
				(wave) => (
					<li key={wave} className="flex items-center justify-between gap-2">
						<span className="type-mono-small text-foreground">{`Wave ${wave}`}</span>
						<Switch
							aria-label={`Wave ${wave} runs`}
							data-testid={`playbook-prop-wave-${wave}`}
							checked={draft.wavesApplicable.includes(wave)}
							onCheckedChange={() => onEdit({ type: "toggleWave", wave })}
						/>
					</li>
				),
			)}
		</ul>
	);
}

function GateList({
	draft,
	onEdit,
}: {
	draft: ReturnType<typeof draftOf>;
	onEdit: (action: DraftAction) => void;
}) {
	const addable = addableGates(draft.gates);
	return (
		<div className="flex flex-col gap-2">
			{draft.gates.length === 0 ? (
				<p className="type-small text-text-subtle">No gates declared.</p>
			) : (
				<ul data-testid="playbook-prop-gates" className="flex flex-col gap-1.5">
					{draft.gates.map((g) => (
						<GateRow
							key={g.gate}
							gate={g.gate}
							mandatory={g.policy === "mandatory"}
							onEdit={onEdit}
						/>
					))}
				</ul>
			)}
			{addable.length > 0 ? (
				<div
					data-testid="playbook-prop-add-gates"
					className="flex flex-wrap gap-1"
				>
					{addable.map((gate) => (
						<Button
							key={gate}
							variant="ghost"
							size="sm"
							data-testid={`playbook-prop-add-gate-${gate}`}
							onClick={() => onEdit({ type: "addGate", gate })}
						>
							<Plus aria-hidden="true" />
							<span className="type-mono-small">{gate}</span>
						</Button>
					))}
				</div>
			) : null}
		</div>
	);
}

function GateRow({
	gate,
	mandatory,
	onEdit,
}: {
	gate: Gate;
	mandatory: boolean;
	onEdit: (action: DraftAction) => void;
}) {
	return (
		<li
			data-testid={`playbook-prop-gate-${gate}`}
			data-policy={mandatory ? "mandatory" : "warn"}
			className="flex items-center gap-2"
		>
			<span className="mr-auto type-mono-small text-foreground">{gate}</span>
			<span className="type-caption text-text-muted">
				{mandatory ? "Mandatory" : "Warn"}
			</span>
			<Switch
				aria-label={`${gate} is mandatory`}
				checked={mandatory}
				onCheckedChange={(on) =>
					onEdit({ type: "setPolicy", gate, policy: on ? "mandatory" : "warn" })
				}
			/>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label={`Remove ${gate}`}
				data-testid={`playbook-prop-remove-${gate}`}
				onClick={() => onEdit({ type: "removeGate", gate })}
			>
				<X aria-hidden="true" />
			</Button>
		</li>
	);
}

function NodeProperties({
	node,
	draft,
	onEdit,
}: {
	node: PipelineNode;
	draft: ReturnType<typeof draftOf>;
	onEdit: (action: DraftAction) => void;
}) {
	switch (node.kind) {
		case "wave":
			return (
				<div data-testid="playbook-node-props" className="flex flex-col gap-3">
					<div className="flex items-center justify-between gap-2">
						<span className="type-small text-foreground">
							Runs in this playbook
						</span>
						<Switch
							aria-label={`Wave ${node.wave} runs`}
							data-testid="playbook-node-wave-switch"
							checked={node.applicable}
							onCheckedChange={() =>
								onEdit({ type: "toggleWave", wave: node.wave })
							}
						/>
					</div>
					<p className="type-small text-text-muted">
						{node.applicable
							? "Agents in this wave are dispatched when the mission runs."
							: "Skipped: no agent is dispatched in this wave."}
					</p>
				</div>
			);
		case "gate":
			return (
				<div data-testid="playbook-node-props" className="flex flex-col gap-3">
					<ul className="flex flex-col">
						<GateRow
							gate={node.gate}
							mandatory={node.policy === "mandatory"}
							onEdit={onEdit}
						/>
					</ul>
					<p className="type-small text-text-muted">
						The policy as stored. What it means at ship time is the gate's own
						business.
					</p>
				</div>
			);
		case "deliverable":
			return (
				<div data-testid="playbook-node-props" className="flex flex-col gap-3">
					<DeliverableChoice draft={draft} onEdit={onEdit} />
				</div>
			);
	}
}

function BuilderSkeleton() {
	return (
		<div
			data-testid="playbook-builder-skeleton"
			className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]"
		>
			<div className="flex flex-col items-center gap-4 rounded-md border border-border p-4">
				{[0, 1, 2, 3, 4].map((i) => (
					<Skeleton key={i} className="h-11 w-60" />
				))}
			</div>
			<div className="flex flex-col gap-3 rounded-md border border-border p-4">
				<Skeleton className="h-5 w-40" />
				<Skeleton className="h-9 w-full" />
				<Skeleton className="h-24 w-full" />
			</div>
		</div>
	);
}

/** A required field's name, added on Enter or Add. Duplicates are refused. */
function AddField({
	existing,
	onAdd,
}: {
	existing: readonly string[];
	onAdd: (field: string) => void;
}) {
	const [value, setValue] = useState("");
	const inputId = useId();
	const field = value.trim();
	const taken = existing.includes(field);
	const add = () => {
		if (field === "" || taken) return;
		onAdd(field);
		setValue("");
	};
	return (
		<div className="flex items-center gap-2">
			<label htmlFor={inputId} className="sr-only">
				New required field
			</label>
			<Input
				id={inputId}
				data-testid="playbook-prop-field-input"
				placeholder="field_name"
				className="type-mono-small"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						add();
					}
				}}
			/>
			<Button
				variant="ghost"
				size="sm"
				data-testid="playbook-prop-add-field"
				disabledReason={
					field === ""
						? "Type a field name first."
						: taken
							? "Already required."
							: undefined
				}
				onClick={add}
			>
				<Plus aria-hidden="true" />
				Add
			</Button>
		</div>
	);
}
