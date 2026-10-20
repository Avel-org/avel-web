import { Link } from "@tanstack/react-router";
import type { Gate, Playbook, Wave } from "avel-server/contract";
import {
	ArrowUpRight,
	GitCommitVertical,
	History,
	PanelRightOpen,
	Plus,
	Upload,
	Workflow,
	X,
} from "lucide-react";
import {
	Fragment,
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
import { isNotFound } from "@/lib/api/catalog";
import type { ApiError } from "@/lib/api/errors";
import { usePlaybook } from "@/lib/api/playbooks";
import { cn } from "@/lib/utils";
import {
	CanvasHint,
	CanvasSurface,
	DetailsSheet,
	useCanvasHint,
} from "./canvas";
import { GatePolicyGlyph } from "./gate-policy-glyph";
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
import { ErrorState, type ErrorStateProps, Surface } from "./surface";
import { TeamName } from "./template-links";
import { type ViewOption, ViewToggle } from "./view-toggle";
import { WhatChanges } from "./what-changes";

/*
 * The playbook builder (ruling 36): one playbook as a working surface, on
 * the canvas Teams uses. The pipeline in three lanes (waves A to E, gates,
 * the deliverable) with pre-flight docked beside it, and the selected step's
 * properties in the Details sheet. Edits are live in the page as a draft:
 * the canvas and the dirty banner follow them, and nothing is sent until
 * Publish. The keyboard walks the pipeline: arrows move, Enter opens the
 * step's details, Esc clears the selection.
 */

export function PlaybookBuilder({
	missionType,
	preflight,
	sections = true,
	linkOut = false,
}: {
	missionType: string;
	/** The name links out to the list of playbooks. */
	linkOut?: boolean;
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
					linkOut={linkOut}
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

const VIEWS = [
	{ id: "builder", label: "Builder", icon: Workflow },
	{ id: "runs", label: "Runs", icon: History },
	{ id: "versions", label: "Versions", icon: GitCommitVertical },
] as const satisfies readonly ViewOption<string>[];

type View = (typeof VIEWS)[number]["id"];

export const BUILDER_HINT =
	"Select a wave or gate to edit it in Details. Arrows move along the pipeline, Enter opens a step's details, Esc clears the selection.";

/**
 * The loaded builder. `initialDraft` starts it from a draft other than the
 * stored playbook (a test, or a draft kept across a reload),
 * `initialSelected` with a node already selected, and `initialDetails` with
 * Details open (it is, when a node starts selected: choosing one opens it).
 */
export function PlaybookBuilderBody({
	playbook,
	preflight,
	initialDraft,
	initialSelected = null,
	initialDetails = initialSelected !== null,
	sections = false,
	linkOut = false,
}: {
	playbook: Playbook;
	preflight: ReactNode;
	initialDraft?: PlaybookDraft;
	initialSelected?: NodeId | null;
	initialDetails?: boolean;
	sections?: boolean;
	/** The name links out to the list of playbooks, where another is chosen. */
	linkOut?: boolean;
}) {
	const [draft, dispatch] = useReducer(
		draftReducer,
		playbook,
		(stored) => initialDraft ?? draftOf(stored),
	);
	const [selected, setSelected] = useState<NodeId | null>(initialSelected);
	const [details, setDetails] = useState(initialDetails);
	const [view, setView] = useState<View>("builder");
	const [publishing, setPublishing] = useState(false);
	const [hintShown, dismissHint] = useCanvasHint("avel.playbooks.hint");
	const panelHeading = useRef<HTMLHeadingElement>(null);
	const nodes = pipelineOf(draft);
	const node = nodes.find((n) => n.id === selected) ?? null;
	const changes = draftChanges(playbook, draft);
	const edit = (action: DraftAction) => {
		dispatch(action);
	};

	return (
		<div data-testid="playbook-builder-content" className="flex flex-col gap-4">
			<header
				data-testid="playbook-canvas-header"
				className="flex flex-wrap items-center gap-2"
			>
				<PlaybookIdentity playbook={playbook} linkOut={linkOut} />
				<ViewToggle
					options={VIEWS}
					view={view}
					onChange={setView}
					testIdPrefix="playbook-tab"
				/>
				<div className="ml-auto flex items-center gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						data-testid="playbook-details"
						onClick={() => setDetails(true)}
					>
						<PanelRightOpen aria-hidden="true" />
						Details
					</Button>
					{/* The one primary, and only once there is something to publish. */}
					{changes.length > 0 ? (
						<Button
							type="button"
							size="sm"
							data-testid="playbook-publish"
							onClick={() => setPublishing(true)}
						>
							<Upload aria-hidden="true" />
							Publish playbook
						</Button>
					) : null}
				</div>
			</header>
			{view === "builder" ? (
				<>
					{changes.length > 0 ? (
						<DirtyBanner
							version={playbook.version}
							count={changes.length}
							onDiscard={() => {
								// The stored playbook, again: every edit undone.
								dispatch({ type: "reset", to: draftOf(playbook) });
							}}
						>
							<WhatChanges
								changes={changes}
								data-testid="playbook-dirty-changes"
							/>
						</DirtyBanner>
					) : null}
					{/* The pipeline on the band, pre-flight docked beside it: the
					    check is read while the process is edited. */}
					<CanvasSurface data-testid="playbook-canvas">
						{hintShown ? (
							<CanvasHint data-testid="playbook-hint" onDismiss={dismissHint}>
								{BUILDER_HINT}
							</CanvasHint>
						) : null}
						<div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
							<Pipeline
								nodes={nodes}
								selected={selected}
								onSelect={setSelected}
								onOpen={(id) => {
									setSelected(id);
									setDetails(true);
								}}
							/>
							<section
								aria-labelledby="playbook-preflight-title"
								data-testid="playbook-preflight"
								className="flex flex-col gap-3 rounded-card border border-border bg-app-panel p-3 shadow-card"
							>
								<h3
									id="playbook-preflight-title"
									className="type-small font-medium text-text"
								>
									Pre-flight checks
								</h3>
								{preflight}
							</section>
						</div>
					</CanvasSurface>
					{sections ? (
						<PlaybookSections playbook={playbook} draft={draft} />
					) : null}
				</>
			) : view === "runs" ? (
				<Surface
					data-testid="playbook-runs"
					notBuilt={{
						title: "Runs",
						what: "Every mission that ran this playbook, with where each one stopped.",
						needs: [],
					}}
				/>
			) : (
				<PlaybookVersions missionType={playbook.missionType} />
			)}
			<DetailsSheet
				open={details}
				onOpenChange={setDetails}
				data-testid="playbook-panel"
				title={node ? nodeLabel(node) : playbook.name}
				titleRef={panelHeading}
				titleTestId="playbook-panel-heading"
				description={
					node
						? "This step, in the draft. Publish makes it the next version."
						: "The whole playbook, in the draft. Publish makes it the next version."
				}
				headerAction={
					node ? (
						<Button
							variant="outline"
							size="sm"
							className="self-start"
							data-testid="playbook-panel-clear"
							onClick={() => setSelected(null)}
						>
							Whole playbook
						</Button>
					) : null
				}
			>
				{/* Keyed by node: each node's properties mount fresh. */}
				<div key={node?.id ?? "playbook"}>
					{node === null ? (
						<PlaybookProperties
							playbook={playbook}
							draft={draft}
							onEdit={edit}
						/>
					) : (
						<NodeProperties node={node} draft={draft} onEdit={edit} />
					)}
				</div>
			</DetailsSheet>
			<PublishModal
				open={publishing}
				onOpenChange={setPublishing}
				playbook={playbook}
				draft={draft}
				changes={changes}
			/>
		</div>
	);
}

/**
 * The canvas header's name, as the team switcher's button reads: the name
 * and its version. It links out to the list only where there is one to
 * choose from; on a mission's page the playbook is the mission's.
 */
function PlaybookIdentity({
	playbook,
	linkOut,
}: {
	playbook: Playbook;
	linkOut: boolean;
}) {
	const body = (
		<>
			<span className="min-w-0 truncate type-title text-text">
				{playbook.name}
			</span>
			<Badge variant="tag" className="type-mono">
				{playbook.missionType}
			</Badge>
			<Badge variant="tag" data-testid="playbook-version-pill">
				{`v${playbook.version}`}
			</Badge>
		</>
	);
	const box =
		"field-surface inline-flex h-control-lg min-w-0 max-w-full items-center gap-2 rounded-control px-3";
	return linkOut ? (
		<Link
			to="/playbooks"
			data-testid="playbook-identity"
			title="All playbooks"
			className={cn(
				box,
				"transition-[border-color,box-shadow] duration-(--duration-micro) ease-avel hover:border-border-strong",
			)}
		>
			{body}
			<ArrowUpRight
				aria-hidden="true"
				className="size-3.5 shrink-0 text-text-subtle"
			/>
			<span className="sr-only">, all playbooks</span>
		</Link>
	) : (
		<div data-testid="playbook-identity" className={box}>
			{body}
		</div>
	);
}

function DirtyBanner({
	count,
	version,
	onDiscard,
	children,
}: {
	count: number;
	/** The stored version: publishing makes the next one. */
	version: number;
	onDiscard: () => void;
	children: ReactNode;
}) {
	return (
		<section
			aria-label="Unpublished changes"
			data-testid="playbook-dirty"
			className="flex flex-col gap-2 rounded-card border border-gate-warn-line bg-gate-warn-banner p-3"
		>
			<div className="flex flex-wrap items-center gap-2">
				<p className="mr-auto type-small font-medium text-foreground">
					{`Unpublished changes (${count})`}
				</p>
				<span
					data-testid="playbook-next-version"
					className="inline-flex items-center gap-1 type-mono text-text-muted"
				>
					<span>{`v${version}`}</span>
					<span aria-hidden="true">→</span>
					<span className="sr-only">publishes as</span>
					<span className="text-foreground">{`v${version + 1}`}</span>
				</span>
				{/* Publish is the header's primary; the banner undoes. */}
				<Button
					variant="ghost"
					size="sm"
					data-testid="playbook-revert"
					onClick={onDiscard}
				>
					Discard
				</Button>
			</div>
			{children}
		</section>
	);
}

// ---------------------------------------------------------------------------
// The canvas.

const SEGMENTS = ["wave", "gate", "deliverable"] as const;

const SEGMENT_LABEL = {
	wave: "Waves",
	gate: "Gates",
	deliverable: "Delivers",
} as const;

/** A segment's one fact, under its label. */
function segmentLine(kind: PipelineNode["kind"], nodes: PipelineNode[]) {
	switch (kind) {
		case "wave": {
			const runs = nodes.filter((n) => n.kind === "wave" && n.applicable);
			return `${runs.length} of ${nodes.length} run`;
		}
		case "gate": {
			const mandatory = nodes.filter(
				(n) => n.kind === "gate" && n.policy === "mandatory",
			).length;
			return nodes.length === 0
				? "None declared"
				: `${mandatory} mandatory, ${nodes.length - mandatory} warn`;
		}
		case "deliverable":
			return "Where a run ends";
	}
}

const skippedWave = (node: PipelineNode | undefined) =>
	node?.kind === "wave" && !node.applicable;

/**
 * The pipeline in three lanes, as Teams lays out its waves: waves, then
 * gates, then the deliverable, each a column of cards joined by arrows, and
 * an arrow from one lane to the next. Below lg the lanes stack and the
 * arrows between them turn down. A skipped wave's way out is dashed.
 */
function Pipeline({
	nodes,
	selected,
	onSelect,
	onOpen,
}: {
	nodes: PipelineNode[];
	selected: NodeId | null;
	onSelect: (id: NodeId | null) => void;
	onOpen: (id: NodeId) => void;
}) {
	const refs = useRef(new Map<NodeId, HTMLButtonElement>());
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
				onOpen(id as NodeId);
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
		<div
			role="toolbar"
			aria-label="Waves, gates and deliverable, in order"
			data-testid="playbook-pipeline"
			onKeyDown={onKeyDown}
			className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)_1.5rem_minmax(0,1fr)]"
		>
			{SEGMENTS.map((kind, s) => {
				const lane = nodes.filter((n) => n.kind === kind);
				// What feeds this lane: the last node of the lanes before it.
				const feeder = nodes.filter((n) => SEGMENTS.indexOf(n.kind) < s).at(-1);
				return (
					<Fragment key={kind}>
						{s > 0 ? <Connector between dashed={skippedWave(feeder)} /> : null}
						<section
							aria-label={SEGMENT_LABEL[kind]}
							data-testid={`playbook-segment-${kind}`}
							className="flex min-w-0 flex-col gap-2 rounded-card border border-border bg-app-panel p-2.5 shadow-card"
						>
							<header className="flex flex-col px-0.5">
								<h3 className="type-small font-medium text-text">
									{SEGMENT_LABEL[kind]}
								</h3>
								<p className="truncate type-caption text-text-subtle">
									{segmentLine(kind, lane)}
								</p>
							</header>
							{lane.length === 0 ? (
								<p
									data-testid={`playbook-segment-${kind}-empty`}
									className="flex min-h-16 items-center justify-center rounded-control border border-dashed border-border-strong p-2 text-center type-caption text-text-muted"
								>
									No gates. Add one in Details.
								</p>
							) : (
								<ol className="flex flex-col">
									{lane.map((node, i) => (
										<li key={node.id} className="flex flex-col">
											<PipelineCard
												node={node}
												selected={node.id === selected}
												focusable={node.id === focusable}
												cardRef={(el) => {
													if (el) refs.current.set(node.id, el);
													else refs.current.delete(node.id);
												}}
												onClick={() => onOpen(node.id)}
											/>
											{i < lane.length - 1 ? (
												<Connector dashed={skippedWave(node)} />
											) : null}
										</li>
									))}
								</ol>
							)}
						</section>
					</Fragment>
				);
			})}
		</div>
	);
}

/**
 * An arrow down a lane, or across from one lane to the next (`between`),
 * which turns down where the lanes stack.
 */
function Connector({
	dashed,
	between = false,
}: {
	dashed: boolean;
	between?: boolean;
}) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 12 16"
			className={cn(
				"mx-auto h-4 w-3 shrink-0",
				// Level with the lanes' first cards: past the padding and header.
				between && "lg:mt-17 lg:-rotate-90",
			)}
		>
			<line
				x1={6}
				x2={6}
				y1={0}
				y2={11}
				strokeDasharray={dashed ? "3 3" : undefined}
				className="stroke-border-strong"
			/>
			<path d="M 2 10 L 6 16 L 10 10 z" className="fill-text-subtle" />
		</svg>
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

function PipelineCard({
	node,
	selected,
	focusable,
	cardRef,
	onClick,
}: {
	node: PipelineNode;
	selected: boolean;
	focusable: boolean;
	cardRef: (el: HTMLButtonElement | null) => void;
	onClick: () => void;
}) {
	const skipped = node.kind === "wave" && !node.applicable;
	return (
		<button
			ref={cardRef}
			type="button"
			tabIndex={focusable ? 0 : -1}
			aria-pressed={selected}
			aria-label={nodeLabel(node)}
			data-node={node.id}
			data-testid={`playbook-node-${node.id}`}
			data-kind={node.kind}
			data-state={skipped ? "skipped" : "live"}
			onClick={onClick}
			className={cn(
				// v3 cards: waves and the deliverable at the card radius, gates as
				// pills. Selected is v3's one selected state (R10); a skipped wave
				// is dashed on the band, v3's absent look at full contrast (UX 6),
				// never translucent; the deliverable, the end, sits on the well.
				"flex h-10 w-full min-w-0 items-center gap-2.5 border px-3 text-left transition-colors duration-(--duration-state) ease-avel",
				node.kind === "gate" ? "rounded-full" : "rounded-card",
				selected
					? "border-selected-border bg-selected"
					: skipped
						? "border-dashed border-border-strong bg-app-band hover:bg-app-raised"
						: node.kind === "deliverable"
							? "border-border-strong bg-app-well hover:bg-app-raised"
							: "border-border bg-app-panel shadow-card hover:bg-app-raised",
			)}
		>
			<NodeGlyph node={node} />
			{/* Two facts, two lines: no middle dot (ruling 4), and the name
			    keeps the card's width. */}
			<span className="flex min-w-0 flex-1 flex-col leading-tight">
				<span
					className={cn(
						"truncate type-small font-medium",
						skipped ? "text-text-muted" : "text-text",
					)}
				>
					{node.kind === "wave"
						? `Wave ${node.wave}`
						: node.kind === "gate"
							? node.gate
							: DELIVERABLE_LABEL[node.deliverable]}
				</span>
				<span className="truncate type-caption text-text-subtle">
					{node.kind === "wave"
						? node.applicable
							? "runs"
							: "skipped"
						: node.kind === "gate"
							? POLICY_LABEL[node.policy].toLowerCase()
							: "terminal"}
				</span>
			</span>
		</button>
	);
}

/**
 * A node's glyph, at its left: a wave's letter on a tile, a gate's policy
 * (mandatory must pass, a filled neutral diamond; warn may pass with a
 * warning, a hollow chevron in the warn tone) and the deliverable's end bar.
 */
function NodeGlyph({ node }: { node: PipelineNode }) {
	if (node.kind === "wave") {
		return (
			<span
				aria-hidden="true"
				className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm border border-border bg-app-well type-caption font-semibold text-text-muted"
			>
				{node.wave}
			</span>
		);
	}
	if (node.kind === "gate") return <GatePolicyGlyph policy={node.policy} />;
	return (
		<svg aria-hidden="true" viewBox="0 0 24 24" className="size-6 shrink-0">
			<rect
				x={5}
				y={10}
				width={14}
				height={4}
				rx={1}
				className="fill-text-subtle"
			/>
		</svg>
	);
}

// ---------------------------------------------------------------------------
// Details.

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
					className="type-mono text-foreground"
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
						data-testid="playbook-preset-name"
						className="type-small text-foreground"
						title={playbook.defaultPresetId}
					>
						<TeamName id={playbook.defaultPresetId} />
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
					<li
						key={wave}
						// 24px a row, so each switch keeps its whole 24px hit area (v3
						// UX 1) without its neighbour's overlapping it.
						className="flex min-h-6 items-center justify-between gap-2"
					>
						<span className="type-mono text-foreground">{`Wave ${wave}`}</span>
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
							<span className="type-mono">{gate}</span>
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
			<span className="mr-auto type-mono text-foreground">{gate}</span>
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
			className="flex flex-col gap-4"
		>
			<Skeleton className="h-control-lg w-80 rounded-control" />
			<CanvasSurface aria-hidden="true">
				<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
					<div className="grid gap-3 lg:grid-cols-3">
						{[5, 3, 1].map((cards, lane) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholders
								key={lane}
								className="flex flex-col gap-2 rounded-card border border-border bg-app-panel p-2.5"
							>
								<Skeleton className="h-4 w-16" />
								{Array.from({ length: cards }, (_, i) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholders
									<Skeleton key={i} className="h-10 w-full rounded-card" />
								))}
							</div>
						))}
					</div>
					<Skeleton className="h-40 rounded-card" />
				</div>
			</CanvasSurface>
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
				className="type-mono"
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
