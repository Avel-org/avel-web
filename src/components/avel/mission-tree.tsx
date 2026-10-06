import type { MissionListItem, MissionStatus } from "avel-server/contract";
import { ChevronRight } from "lucide-react";
import {
	type KeyboardEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";
import {
	LastActivity,
	MISSION_ROW,
	MISSION_ROW_ID,
	MISSION_ROW_SUBJECT,
	MISSION_ROW_TIME,
	MISSION_STATUS_TONE,
	MissionId,
	MissionStatusPill,
} from "./mission-columns";
import {
	asSurface,
	type MissionList,
	type MissionListParams,
	NEEDS_YOU_COPY,
	totalOf,
	useMissionList,
} from "./mission-data";
import { LoadMore, MissionRowsSkeleton } from "./mission-panels";
import { STATUS_ORDER, STATUS_PANEL } from "./mission-search";
import { StatusGlyph, StatusPill } from "./status-pill";
import { ErrorState, Surface } from "./surface";

/*
 * The Missions tree: client, then engagement, then missions; or, for
 * internal missions, which have neither, mission type then missions. It
 * groups the pages loaded so far, so a group's count is what has loaded,
 * and says so until every page is in.
 */

export type TreeGroup = {
	kind: "client" | "engagement" | "type";
	id: string;
	name: string;
	/** Every mission under the group, at any depth. */
	missions: MissionListItem[];
	groups: TreeGroup[];
};

/** A group's node id: kind and key, so a client and a type never collide. */
const nodeId = (kind: TreeGroup["kind"], key: string) => `${kind}:${key}`;
const leafId = (mission: MissionListItem) => `mission:${mission.id}`;

/**
 * Groups loaded missions into the tree, in the order the list returned them
 * (the URL's sort): a group appears where its first mission did. The shape
 * follows the data: missions with a client nest client then engagement;
 * missions without one, which are internal, nest by type.
 */
export function buildTree(rows: MissionListItem[]): TreeGroup[] {
	const top = new Map<string, TreeGroup>();
	const groupFor = (
		parent: Map<string, TreeGroup>,
		kind: TreeGroup["kind"],
		key: string,
		name: string,
	) => {
		const id = nodeId(kind, key);
		let group = parent.get(id);
		if (!group) {
			group = { kind, id, name, missions: [], groups: [] };
			parent.set(id, group);
		}
		return group;
	};
	const children = new Map<string, Map<string, TreeGroup>>();

	for (const mission of rows) {
		if (!mission.client) {
			// No client means an internal mission (the contract: both client and
			// engagement are null for internal, and the server hides a client
			// mission whose client is gone), so it groups by type.
			groupFor(top, "type", mission.type, mission.type).missions.push(mission);
			continue;
		}
		const client = groupFor(
			top,
			"client",
			mission.client.id,
			mission.client.name,
		);
		client.missions.push(mission);
		const key = mission.engagement?.id ?? "none";
		let engagements = children.get(client.id);
		if (!engagements) {
			engagements = new Map();
			children.set(client.id, engagements);
		}
		groupFor(
			engagements,
			"engagement",
			`${mission.client.id}/${key}`,
			mission.engagement?.name ?? "No engagement",
		).missions.push(mission);
	}
	for (const group of top.values()) {
		group.groups = [...(children.get(group.id)?.values() ?? [])];
	}
	return [...top.values()];
}

/** Missions per status present, in STATUS_ORDER: a group's rollup. */
export function rollup(
	missions: MissionListItem[],
): { status: MissionStatus; count: number }[] {
	return STATUS_ORDER.map((status) => ({
		status,
		count: missions.filter((mission) => mission.status === status).length,
	})).filter(({ count }) => count > 0);
}

/** One visible row of the tree, in the order the keyboard walks it. */
export type TreeItem = {
	id: string;
	level: number;
	parentId: string | null;
	/** Groups only. */
	expanded?: boolean;
	/** Leaves only. */
	mission?: MissionListItem;
};

/** The rows on screen: every group, and children only of expanded groups. */
export function visibleItems(
	groups: TreeGroup[],
	collapsed: ReadonlySet<string>,
): TreeItem[] {
	const items: TreeItem[] = [];
	const walk = (group: TreeGroup, level: number, parentId: string | null) => {
		const expanded = !collapsed.has(group.id);
		items.push({ id: group.id, level, parentId, expanded });
		if (!expanded) return;
		if (group.groups.length > 0) {
			for (const child of group.groups) walk(child, level + 1, group.id);
		} else {
			for (const mission of group.missions) {
				items.push({
					id: leafId(mission),
					level: level + 1,
					parentId: group.id,
					mission,
				});
			}
		}
	};
	for (const group of groups) walk(group, 1, null);
	return items;
}

export type TreeAction =
	| { type: "focus"; id: string }
	| { type: "expand"; id: string }
	| { type: "collapse"; id: string }
	| { type: "open"; mission: MissionListItem }
	| null;

/**
 * The WAI-ARIA tree pattern's keys, over the visible rows: Up and Down move;
 * Right opens a closed group or steps into an open one; Left closes an open
 * group or steps out to the parent; Home and End go to the ends; Enter opens
 * a mission.
 */
export function treeKey(
	key: string,
	items: TreeItem[],
	activeId: string,
): TreeAction {
	const index = items.findIndex((item) => item.id === activeId);
	const item = items[index];
	if (!item) return null;
	const next = items[index + 1];
	const previous = items[index - 1];
	switch (key) {
		case "ArrowDown":
			return next ? { type: "focus", id: next.id } : null;
		case "ArrowUp":
			return previous ? { type: "focus", id: previous.id } : null;
		case "Home":
			return items[0] ? { type: "focus", id: items[0].id } : null;
		case "End":
			return { type: "focus", id: items[items.length - 1]?.id ?? activeId };
		case "ArrowRight":
			if (item.mission) return null;
			if (!item.expanded) return { type: "expand", id: item.id };
			return next?.parentId === item.id ? { type: "focus", id: next.id } : null;
		case "ArrowLeft":
			if (!item.mission && item.expanded)
				return { type: "collapse", id: item.id };
			return item.parentId ? { type: "focus", id: item.parentId } : null;
		case "Enter":
			return item.mission ? { type: "open", mission: item.mission } : null;
		default:
			return null;
	}
}

const COLLAPSED_KEY = "avel.missions.tree.collapsed";
const NODE_ID = /^(client|engagement|type):.+$/;

/**
 * The groups this viewer has closed, remembered in localStorage. Stored as
 * the closed set because groups start open: a group seen for the first time
 * opens, which a stored open set could not do. Read defensively: storage can
 * be missing or throw, and only well-formed node ids are kept.
 */
export function useCollapsedGroups(): [
	ReadonlySet<string>,
	(id: string, collapse: boolean) => void,
] {
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
		() => new Set(),
	);
	useEffect(() => {
		try {
			const stored = JSON.parse(
				window.localStorage.getItem(COLLAPSED_KEY) ?? "[]",
			);
			if (Array.isArray(stored)) {
				setCollapsed(
					new Set(
						stored.filter(
							(id): id is string => typeof id === "string" && NODE_ID.test(id),
						),
					),
				);
			}
		} catch {
			// Storage unavailable or unreadable: every group is open.
		}
	}, []);
	const set = useCallback((id: string, collapse: boolean) => {
		setCollapsed((current) => {
			const next = new Set(current);
			if (collapse) next.add(id);
			else next.delete(id);
			try {
				window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
			} catch {
				// Storage unavailable: the choice lasts for this page only.
			}
			return next;
		});
	}, []);
	return [collapsed, set];
}

/** "2 active", "1 halted": a glyph and a word per status, never colour alone. */
function Rollup({ missions }: { missions: MissionListItem[] }) {
	return (
		<span
			data-testid="mission-tree-rollup"
			className="flex flex-wrap items-center gap-3"
		>
			{rollup(missions).map(({ status, count }) => (
				<span
					key={status}
					data-testid={`mission-tree-rollup-${status}`}
					className="inline-flex items-center gap-1 type-caption text-text-muted tabular-nums"
				>
					<StatusGlyph tone={MISSION_STATUS_TONE[status]} />
					{`${count} ${STATUS_PANEL[status].label.toLowerCase()}`}
				</span>
			))}
		</span>
	);
}

/**
 * Missions as a tree, beside the Grouped view. Every row is a treeitem with
 * one tab stop for the whole tree (the roving tabindex); arrows move within
 * it, and J and K still step between missions.
 */
/**
 * A ruler tick on a child row: 4px off the line (8px left of the row, past
 * the ruler's padding) at the row's middle; 6px and accent for the mission
 * open in the details panel. The nav's ruler, in the tree.
 */
const TICK =
	"relative before:pointer-events-none before:absolute before:top-[1.125rem] before:-left-2 before:h-px before:w-1 before:bg-border-strong data-[selected]:before:w-1.5 data-[selected]:before:bg-accent";

export function MissionTree({
	params,
	now,
	selectedId,
	onOpen,
}: {
	params: MissionListParams;
	now: number;
	/** The mission open in the details panel (?mission), shown on a plate. */
	selectedId?: string;
	onOpen: (mission: MissionListItem) => void;
}) {
	const list = useMissionList(params);
	return (
		<section
			data-testid="missions-tree-view"
			aria-label="Missions"
			className="flex flex-col"
		>
			<div className="surface-steel overflow-clip rounded-md border border-border bg-card">
				<Surface
					data-testid="missions-tree-list"
					query={asSurface(list)}
					loading={
						<MissionRowsSkeleton rows={6} testId="missions-tree-skeleton" />
					}
					empty={
						<p
							data-testid="missions-tree-empty"
							className="px-4 py-10 text-center type-small text-text-subtle"
						>
							No missions match these filters.
						</p>
					}
					error={ErrorState}
				>
					{(rows) => (
						<>
							<Tree
								rows={rows}
								list={list}
								now={now}
								selectedId={selectedId}
								onOpen={onOpen}
							/>
							<LoadMore list={list} testId="missions-tree-more" />
						</>
					)}
				</Surface>
			</div>
		</section>
	);
}

function Tree({
	rows,
	list,
	now,
	selectedId,
	onOpen,
}: {
	rows: MissionListItem[];
	list: MissionList;
	now: number;
	selectedId?: string;
	onOpen: (mission: MissionListItem) => void;
}) {
	const groups = useMemo(() => buildTree(rows), [rows]);
	const [collapsed, setCollapsed] = useCollapsedGroups();
	const items = useMemo(
		() => visibleItems(groups, collapsed),
		[groups, collapsed],
	);
	const [active, setActive] = useState<string | null>(null);
	const activeId = items.some((item) => item.id === active)
		? active
		: items[0]?.id;
	const tree = useRef<HTMLDivElement>(null);
	// Counts are loaded counts until every page is in; then they are exact.
	const complete = !list.hasNextPage;
	const total = totalOf(list);

	const focus = (id: string) => {
		setActive(id);
		tree.current
			?.querySelector<HTMLElement>(`[data-tree-id="${CSS.escape(id)}"]`)
			?.focus();
	};

	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (!activeId) return;
		const action = treeKey(event.key, items, activeId);
		if (!action) return;
		event.preventDefault();
		if (action.type === "focus") focus(action.id);
		else if (action.type === "expand") setCollapsed(action.id, false);
		else if (action.type === "collapse") setCollapsed(action.id, true);
		else onOpen(action.mission);
	};

	const renderGroup = (group: TreeGroup, level: number): ReactNode => {
		// Empty groups are never shown: a group exists for its missions.
		if (group.missions.length === 0) return null;
		const expanded = !collapsed.has(group.id);
		const count = group.missions.length;
		// Top-level groups (a client, or an internal mission's type) are
		// steel header plates; an engagement is one step quieter.
		const top = level === 1;
		return (
			<div
				key={group.id}
				role="treeitem"
				aria-level={level}
				aria-expanded={expanded}
				aria-selected={false}
				tabIndex={group.id === activeId ? 0 : -1}
				data-tree-id={group.id}
				data-testid={`mission-tree-${group.id}`}
				onFocus={(event) => {
					if (event.target === event.currentTarget) setActive(group.id);
				}}
				className={cn(
					"outline-none",
					// The ring sits on the row, not around its children.
					"focus-visible:[&>[data-tree-row]]:outline-2 focus-visible:[&>[data-tree-row]]:outline-offset-2 focus-visible:[&>[data-tree-row]]:outline-focus-ring",
					!top && TICK,
				)}
			>
				{/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: the treeitem above carries the keyboard; this is its pointer target */}
				<div
					data-tree-row=""
					data-testid="mission-tree-group-row"
					onClick={() => {
						setActive(group.id);
						setCollapsed(group.id, expanded);
					}}
					className={cn(
						"flex cursor-pointer items-center gap-2 rounded-sm border px-2 transition-colors duration-(--duration-micro) ease-avel",
						top
							? "surface-steel h-10 border-border bg-app-band hover:bg-app-raised"
							: "h-9 border-transparent hover:bg-state-hover",
					)}
				>
					<ChevronRight
						aria-hidden="true"
						className={cn(
							"size-3.5 shrink-0 text-text-subtle transition-transform duration-(--duration-state) ease-avel",
							expanded && "rotate-90",
						)}
					/>
					<span
						className={cn(
							"min-w-0 truncate",
							group.kind === "type"
								? "type-mono text-foreground"
								: top
									? "type-panel-title text-foreground"
									: "type-body font-medium text-text-muted",
						)}
					>
						{group.name}
					</span>
					<span
						data-testid="mission-tree-count"
						title={complete ? undefined : "Loaded so far"}
						className={cn(
							"shrink-0 rounded-full px-2 type-mono-small tabular-nums",
							top
								? "border border-border-strong bg-app-field text-text-muted"
								: "text-text-subtle",
						)}
					>
						{complete ? count : `${count} loaded`}
					</span>
					<span className="ml-auto">
						<Rollup missions={group.missions} />
					</span>
				</div>
				{expanded ? (
					// The ruler (ruling 30): a 1px line under the chevron, a tick
					// at each child (TICK, on each child treeitem).
					// biome-ignore lint/a11y/useSemanticElements: a tree's group is role="group" by the WAI-ARIA tree pattern; a fieldset is for forms
					<div
						role="group"
						data-testid="mission-tree-ruler"
						className="mt-0.5 mb-1 ml-4 flex flex-col gap-0.5 border-l border-border-strong pl-2"
					>
						{group.groups.length > 0
							? group.groups.map((child) => renderGroup(child, level + 1))
							: group.missions.map((mission) => renderLeaf(mission, level + 1))}
					</div>
				) : null}
			</div>
		);
	};

	const renderLeaf = (mission: MissionListItem, level: number) => {
		const id = leafId(mission);
		const selected = mission.id === selectedId;
		return (
			<div
				key={id}
				role="treeitem"
				aria-level={level}
				aria-selected={selected}
				tabIndex={id === activeId ? 0 : -1}
				data-tree-id={id}
				data-mission-leaf=""
				data-selected={selected || undefined}
				data-testid={`mission-tree-leaf-${mission.id}`}
				onFocus={() => setActive(id)}
				onClick={() => {
					setActive(id);
					onOpen(mission);
				}}
				onKeyDown={(event) => {
					// Space as well as Enter, as a row with onRowClick does.
					if (event.key === " ") {
						event.preventDefault();
						onOpen(mission);
					}
				}}
				className={cn(
					MISSION_ROW,
					TICK,
					// pr 7px + its 1px border + the tree's 8px = the strips' 16px: the
					// time columns end on one line.
					"cursor-pointer rounded-sm border pr-[7px] pl-2 outline-none transition-colors duration-(--duration-micro) ease-avel",
					"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
					selected
						? "surface-steel border-border bg-app-raised"
						: "border-transparent hover:bg-state-hover",
				)}
			>
				<span className={MISSION_ROW_ID}>
					<MissionId id={mission.id} />
				</span>
				<span className={MISSION_ROW_SUBJECT}>{mission.type}</span>
				<span className="shrink-0 type-mono-small text-text-muted">
					sprint {mission.sprintN}
				</span>
				<MissionStatusPill status={mission.status} />
				{mission.needsYou ? (
					<StatusPill
						size="sm"
						tone="warn"
						label={NEEDS_YOU_COPY[mission.needsYou.reason]}
						data-testid="mission-tree-needs-you"
					/>
				) : null}
				<span className={MISSION_ROW_TIME}>
					<LastActivity at={mission.lastActivityAt} now={now} />
				</span>
			</div>
		);
	};

	return (
		<div
			ref={tree}
			role="tree"
			aria-label={
				complete
					? "Missions"
					: `Missions, ${rows.length} of ${total ?? "—"} loaded`
			}
			data-testid="missions-tree"
			onKeyDown={onKeyDown}
			className="flex flex-col gap-1.5 p-2"
		>
			{groups.map((group) => renderGroup(group, 1))}
		</div>
	);
}
