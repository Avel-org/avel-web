import type {
	CoherenceResult,
	MissionDetail,
	RosterEntry,
} from "avel-server/contract";
import {
	BookmarkPlus,
	LayoutGrid,
	OctagonX,
	Rocket,
	Rows3,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { entryName, rosterReadOnlyReason, useRoster } from "@/lib/api/roster";
import { LoadoutBoard } from "./loadout-board";
import { focusParam, LoadoutCoherence, parseFocus } from "./loadout-coherence";
import {
	EntryEditorModal,
	RemoveEntryModal,
	SaveRosterPresetModal,
} from "./loadout-entry";
import { useMission } from "./mission-data";
import { MissionRowsSkeleton } from "./mission-panels";
import { MissionSkillsPane } from "./mission-skills-pane";
import { blockCopy, useCoherence } from "./playbook-coherence";
import { ApplyToMissionModal } from "./preset-apply";
import { type Names, useAllTemplates } from "./preset-detail";
import { ErrorState, Surface } from "./surface";
import { type ViewOption, ViewToggle } from "./view-toggle";

export type LoadoutView = "board" | "table";

/** Board first (ruling 36): the loadout is built on the board; Table reads it. */
const LOADOUT_VIEWS = [
	{ id: "board", label: "Board", icon: LayoutGrid },
	{ id: "table", label: "Table", icon: Rows3 },
] as const satisfies readonly ViewOption<LoadoutView>[];

/** An id, a wave or a role: letters, digits and hyphens only. */
const FOCUS_VALUE = /^[a-z]+:[A-Za-z0-9-]+$/;

/**
 * The focus param as a marker the board can carry, or null: it must parse
 * (fd's parseFocus) and hold nothing a selector would choke on, so a
 * hand-typed `?focus=a\` matches nothing instead of throwing.
 */
export function landableFocus(value: string | undefined): string | null {
	if (!value || !FOCUS_VALUE.test(value)) return null;
	const focus = parseFocus(value);
	return focus ? focusParam(focus) : null;
}

/**
 * The element a focus marker names: data-loadout-focus holds one marker, or
 * several space-separated (a palette template first for two roles).
 */
export function focusSelector(focus: string): string {
	return `[data-loadout-focus~="${focus}"]`;
}

/** What landing touches on the element: a DOM element in the browser. */
type Landing = Pick<
	HTMLElement,
	| "tabIndex"
	| "hasAttribute"
	| "setAttribute"
	| "scrollIntoView"
	| "focus"
	| "classList"
	| "offsetWidth"
	| "addEventListener"
>;

/**
 * Lands on the element a marker names: scrolled into view, focused (made
 * focusable first when it is not), and briefly marked. False when nothing
 * on the page carries the marker yet.
 */
export function landOn(
	root: { querySelector: (selector: string) => Landing | null },
	focus: string,
): boolean {
	const el = root.querySelector(focusSelector(focus));
	if (!el) return false;
	if (el.tabIndex < 0 && !el.hasAttribute("tabindex"))
		el.setAttribute("tabindex", "-1");
	el.scrollIntoView({ block: "center", behavior: "smooth" });
	el.focus({ preventScroll: true });
	el.classList.remove("landed");
	// Read to restart the animation on an element that just landed.
	void el.offsetWidth;
	el.classList.add("landed");
	el.addEventListener("animationend", () => el.classList.remove("landed"), {
		once: true,
	});
	return true;
}

/**
 * Lands on the focus param's element once it is on the page, then hands the
 * param back (`onLanded`), so the next Resolve to the same place is a new
 * URL and lands again. The view is a dependency: a focus set while the
 * table shows lands when the board does.
 */
function useLandOnFocus(
	focus: string | undefined,
	ready: boolean,
	view: LoadoutView,
	onLanded: () => void,
) {
	const handBack = useRef(onLanded);
	handBack.current = onLanded;
	useEffect(() => {
		const marker = landableFocus(focus);
		if (marker === null || !ready || view !== "board") return;
		if (landOn(document, marker)) handBack.current();
	}, [focus, ready, view]);
}

/**
 * The loadout (/missions/$id/roster): available agents, the roster on a wave
 * board, and coherence with the mission's skills. Only a draft's roster can
 * change; any other mission's is shown with the reason and nothing to press.
 */
export function MissionLoadoutPage({
	id,
	focus,
	view,
	onView,
	onLanded,
}: {
	id: string;
	focus: string | undefined;
	view: LoadoutView;
	onView: (view: LoadoutView) => void;
	/** The focus param has landed: clear it from the URL. */
	onLanded: () => void;
}) {
	const mission = useMission(id);
	return (
		<Surface
			data-testid="loadout-mission"
			query={mission}
			loading={<MissionRowsSkeleton rows={4} testId="loadout-skeleton" />}
			// A mission is never "empty": it exists, or it is not found.
			empty={null}
			isEmpty={() => false}
			error={ErrorState}
		>
			{(detail) => (
				<LoadoutWorkspace
					mission={detail}
					focus={focus}
					view={view}
					onView={onView}
					onLanded={onLanded}
				/>
			)}
		</Surface>
	);
}

function LoadoutWorkspace({
	mission,
	focus,
	view,
	onView,
	onLanded,
}: {
	mission: MissionDetail;
	focus: string | undefined;
	view: LoadoutView;
	onView: (view: LoadoutView) => void;
	onLanded: () => void;
}) {
	const roster = useRoster(mission.id);
	const templates = useAllTemplates();
	const names: Names =
		templates.status === "success"
			? { status: "success", byId: templates.byId }
			: { status: templates.status };
	const coherence = useCoherence(mission, mission.type);
	const readOnlyReason = rosterReadOnlyReason(mission.status);
	const block =
		coherence.status === "success" ? (coherence.data.block ?? null) : null;
	const [editing, setEditing] = useState<RosterEntry | null>(null);
	const [editOpen, setEditOpen] = useState(false);
	const [removing, setRemoving] = useState<RosterEntry | null>(null);
	const [removeOpen, setRemoveOpen] = useState(false);
	const [applying, setApplying] = useState(false);
	const [saving, setSaving] = useState(false);
	const entries = roster.data ?? [];

	useLandOnFocus(
		focus,
		roster.status === "success" && templates.status !== "pending",
		view,
		onLanded,
	);

	return (
		<div data-testid="loadout" className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center gap-2">
				<Badge variant="tag" data-testid="loadout-status">
					{mission.status}
				</Badge>
				<Badge variant="tag">{`${mission.cut} cut`}</Badge>
				<ViewToggle
					options={LOADOUT_VIEWS}
					view={view}
					onChange={onView}
					testIdPrefix="loadout-view"
					className="ml-auto"
				/>
				<Button
					size="sm"
					variant="outline"
					data-testid="loadout-save-preset-open"
					disabledReason={
						roster.status !== "success"
							? "Reading the roster."
							: entries.every((e) => !e.active)
								? "No agent is active: a preset needs at least one."
								: undefined
					}
					onClick={() => setSaving(true)}
				>
					<BookmarkPlus aria-hidden="true" />
					Save as preset
				</Button>
				<Button
					size="sm"
					data-testid="loadout-apply-open"
					disabledReason={readOnlyReason ?? undefined}
					onClick={() => setApplying(true)}
				>
					<Rocket aria-hidden="true" />
					Apply preset
				</Button>
			</div>

			{readOnlyReason ? (
				<p
					data-testid="loadout-read-only"
					className="type-small rounded-md border border-border-strong bg-app-band px-3 py-2 text-foreground"
				>
					{readOnlyReason}
				</p>
			) : null}

			{block ? <BlockBanner block={block} /> : null}

			<div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]">
				<Surface
					data-testid="loadout-roster"
					query={roster}
					loading={<BoardSkeleton />}
					// An empty roster is the board with nothing on it yet.
					empty={null}
					isEmpty={() => false}
					error={ErrorState}
				>
					{(list) =>
						view === "table" ? (
							<LoadoutTable roster={list} />
						) : (
							<div className="flex min-w-0 flex-col gap-2">
								{list.length === 0 ? (
									<p
										data-testid="loadout-empty"
										className="type-small text-text-muted"
									>
										No agents yet. Add one from Available agents, or apply a
										preset.
									</p>
								) : null}
								<LoadoutBoard
									missionId={mission.id}
									roster={list}
									templates={templates}
									blockedWave={block?.wave ?? null}
									readOnlyReason={readOnlyReason}
									onEdit={(entry) => {
										setEditing(entry);
										setEditOpen(true);
									}}
									onRemove={(entry) => {
										setRemoving(entry);
										setRemoveOpen(true);
									}}
								/>
							</div>
						)
					}
				</Surface>
				<aside
					aria-label="Coherence and skills"
					data-testid="loadout-side"
					className="flex min-w-0 flex-col gap-4"
				>
					<LoadoutCoherence
						mission={mission}
						missionType={mission.type}
						readOnlyReason={readOnlyReason}
					/>
					<MissionSkillsPane
						missionId={mission.id}
						roster={entries}
						readOnlyReason={readOnlyReason}
					/>
				</aside>
			</div>

			<EntryEditorModal
				missionId={mission.id}
				entry={editing}
				open={editOpen}
				onOpenChange={setEditOpen}
				readOnlyReason={readOnlyReason}
			/>
			<RemoveEntryModal
				missionId={mission.id}
				entry={removing}
				open={removeOpen}
				onOpenChange={setRemoveOpen}
			/>
			<ApplyToMissionModal
				mission={mission}
				open={applying}
				onOpenChange={setApplying}
				names={names}
			/>
			<SaveRosterPresetModal
				roster={entries}
				cut={mission.cut}
				open={saving}
				onOpenChange={setSaving}
			/>
		</div>
	);
}

/**
 * The one hard block (ROUTES.md): no active agent in the playbook's
 * earliest wave. A block, not a warning: it is the only thing here that
 * stops an export. The words are the coherence panel's own.
 */
function BlockBanner({
	block,
}: {
	block: NonNullable<CoherenceResult["block"]>;
}) {
	return (
		<div
			role="alert"
			data-testid="loadout-block"
			data-wave={block.wave ?? undefined}
			className="flex items-start gap-3 rounded-md border border-gate-block-line bg-gate-block-soft px-4 py-3"
		>
			<OctagonX
				aria-hidden="true"
				className="mt-0.5 shrink-0 text-gate-block"
			/>
			<div className="flex flex-col gap-0.5">
				<p className="type-small font-medium text-foreground">
					Export is blocked
				</p>
				<p className="type-small text-foreground">{blockCopy(block)}</p>
			</div>
		</div>
	);
}

/** The roster for reading: one row per entry. */
function LoadoutTable({ roster }: { roster: readonly RosterEntry[] }) {
	if (roster.length === 0) {
		return (
			<p data-testid="loadout-empty" className="type-small text-text-muted">
				No agents yet.
			</p>
		);
	}
	const tokens = (n: number | null) => (n === null ? "—" : n.toLocaleString());
	return (
		<Table data-testid="loadout-table">
			<TableHeader>
				<TableRow>
					<TableHead>Agent</TableHead>
					<TableHead>Active</TableHead>
					<TableHead>Waves</TableHead>
					<TableHead className="text-right">Estimate</TableHead>
					<TableHead className="text-right">Soft</TableHead>
					<TableHead className="text-right">Hard</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{roster.map((e) => (
					<TableRow key={e.id} data-testid={`loadout-row-${e.id}`}>
						<TableCell className="type-small text-foreground">
							{entryName(e)}
						</TableCell>
						<TableCell className="type-small">
							{e.active ? "Active" : "Idle"}
						</TableCell>
						<TableCell className="type-mono-small">
							{e.waves.join(" · ")}
						</TableCell>
						<TableCell className="type-mono-small text-right tabular-nums">
							{tokens(e.estimatedTokens)}
						</TableCell>
						<TableCell className="type-mono-small text-right tabular-nums">
							{tokens(e.tokenSoftCeiling)}
						</TableCell>
						<TableCell className="type-mono-small text-right tabular-nums">
							{tokens(e.tokenHardCeiling)}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

function BoardSkeleton() {
	return (
		<div
			data-testid="loadout-roster-skeleton"
			className="grid grid-cols-5 gap-2"
		>
			{[0, 1, 2, 3, 4].map((i) => (
				<Skeleton key={i} className="h-48 w-full" />
			))}
		</div>
	);
}
