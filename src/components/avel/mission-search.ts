import {
	MISSION_STATUSES,
	type MissionStatus,
	missionSort,
} from "avel-server/contract";
import { z } from "zod";
import type { DataPanelTone } from "./data-panel";

/**
 * The Missions page's state, kept in the URL so every view is a link someone
 * can share. Each key has a default and falls back to it on any value it
 * does not know, so a stale or hand-edited link still opens a page.
 */

/**
 * Where a mission came from (avel-server's contract, missionOrigin). There
 * is deliberately no "all": internal and client missions are never listed
 * together, because internal runs are benchmarks and would flatter client
 * delivery (DATA-CONTRACTS-V2.md, Mission). The list route requires it.
 */
export const ORIGINS = ["client", "internal"] as const;
export type Origin = (typeof ORIGINS)[number];

export const ORIGIN_LABEL: Record<Origin, string> = {
	client: "Client",
	internal: "Internal",
};

/** A panel's look and default, per mission status. */
type StatusPanel = { label: string; tone: DataPanelTone; defaultOpen: boolean };

/**
 * One panel per mission status (contract MISSION_STATUSES). Keyed on the
 * contract's union, so a status the server adds fails this build until it
 * has a panel. Halted means the runner stopped the mission (a ceiling, for
 * instance), so it is never called "failed".
 */
export const STATUS_PANEL = {
	draft: { label: "Draft", tone: "neutral", defaultOpen: true },
	active: { label: "Active", tone: "pending", defaultOpen: true },
	halted: { label: "Halted", tone: "block", defaultOpen: true },
	shipped: { label: "Shipped", tone: "pass", defaultOpen: false },
	archived: { label: "Archived", tone: "neutral", defaultOpen: false },
} as const satisfies Record<MissionStatus, StatusPanel>;

/**
 * Panels in the order an operator acts on them. Needs you comes first and
 * cuts across statuses: the server derives it from the last export.
 * Archived shows only when "Show archived" is on.
 */
export const STATUS_ORDER = [
	"active",
	"halted",
	"draft",
	"shipped",
	"archived",
] as const satisfies readonly MissionStatus[];

export const NEEDS_YOU = {
	label: "Needs you",
	tone: "warn",
	defaultOpen: true,
} as const satisfies StatusPanel;

/** The status filter: everything, the needs-you lens, or one status. */
export const STATUS_FILTERS = [
	"all",
	"needs-you",
	...MISSION_STATUSES,
] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

/** Sort keys are the contract's, each with the one direction the server sorts in. */
export const SORTS = missionSort.options;
export type Sort = (typeof SORTS)[number];

export const SORT_LABEL: Record<Sort, string> = {
	lastActivity: "Last activity",
	sprint: "Sprint",
	client: "Client",
};

/** avel-server's order per key (contract missionSort): it takes no direction. */
export const SORT_DIRECTION: Record<Sort, "asc" | "desc"> = {
	lastActivity: "desc",
	sprint: "desc",
	client: "asc",
};

/** A sort's direction, when the URL overrides the sort's default. */
export const DIRECTIONS = ["asc", "desc"] as const;
export type Direction = (typeof DIRECTIONS)[number];

/**
 * Grouped or Tree. "table" was a view once; a stale link or a stored choice
 * of it falls back to grouped, through the schema's .catch.
 */
export const VIEWS = ["grouped", "tree"] as const;
export type View = (typeof VIEWS)[number];

export const MISSION_SEARCH_DEFAULTS = {
	q: "",
	origin: "client",
	status: "all",
	sort: "lastActivity",
	view: "grouped",
	archived: false,
} as const satisfies {
	q: string;
	origin: Origin;
	status: StatusFilter;
	sort: Sort;
	view: View;
	archived: boolean;
};

/**
 * `.default` makes each key optional in a link, so `<Link to="/missions">`
 * needs no search at all. `.catch` turns an unknown value into the default.
 * `mission` names the mission open in the details panel.
 */
export const missionSearch = z.object({
	q: z
		.string()
		.trim()
		.max(200)
		.default(MISSION_SEARCH_DEFAULTS.q)
		.catch(MISSION_SEARCH_DEFAULTS.q),
	origin: z
		.enum(ORIGINS)
		.default(MISSION_SEARCH_DEFAULTS.origin)
		.catch(MISSION_SEARCH_DEFAULTS.origin),
	status: z
		.enum(STATUS_FILTERS)
		.default(MISSION_SEARCH_DEFAULTS.status)
		.catch(MISSION_SEARCH_DEFAULTS.status),
	sort: z
		.enum(SORTS)
		.default(MISSION_SEARCH_DEFAULTS.sort)
		.catch(MISSION_SEARCH_DEFAULTS.sort),
	view: z
		.enum(VIEWS)
		.default(MISSION_SEARCH_DEFAULTS.view)
		.catch(MISSION_SEARCH_DEFAULTS.view),
	archived: z
		.boolean()
		.default(MISSION_SEARCH_DEFAULTS.archived)
		.catch(MISSION_SEARCH_DEFAULTS.archived),
	mission: z.string().uuid().optional().catch(undefined),
	/** Absent means the sort's own direction (SORT_DIRECTION). */
	direction: z.enum(DIRECTIONS).optional().catch(undefined),
});

export type MissionSearch = z.output<typeof missionSearch>;

/**
 * Whether archived missions are fetched. The server hides archived rows
 * unless asked, even when status=archived is the filter, so asking for the
 * Archived status turns it on too.
 */
export function includesArchived(
	search: Pick<MissionSearch, "archived" | "status">,
) {
	return search.archived || search.status === "archived";
}

/** The status panels shown for a filter, in order. Archived only when included. */
export function visibleStatuses(
	search: Pick<MissionSearch, "archived" | "status">,
): readonly MissionStatus[] {
	if (search.status === "needs-you") return [];
	if (search.status !== "all") return [search.status];
	return STATUS_ORDER.filter(
		(status) => status !== "archived" || includesArchived(search),
	);
}

/** Whether the Needs you panel shows for a filter. */
export function showsNeedsYou(status: StatusFilter): boolean {
	return status === "all" || status === "needs-you";
}
