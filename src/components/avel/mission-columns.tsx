import type { MissionListItem, MissionStatus } from "avel-server/contract";
import { relativeTime } from "@/lib/api/clients";
import { shortStamp } from "./activity-audit";
import type { DataColumn } from "./data-table";
import { NEEDS_YOU_COPY } from "./mission-data";
import { STATUS_PANEL } from "./mission-search";
import {
	EXPORT_STATUS_LABEL,
	exportStatusTone,
	StatusPill,
	type StatusTone,
} from "./status-pill";

/**
 * A mission status as a pill tone. Keyed on the contract's union, so a new
 * status fails the build until it has one. StatusPill has no neutral tone,
 * so draft shares active's empty ring, and the word tells them apart.
 */
export const MISSION_STATUS_TONE = {
	draft: "pending",
	active: "pending",
	halted: "block",
	shipped: "pass",
	archived: "stale",
} as const satisfies Record<MissionStatus, StatusTone>;

/** An absence in a cell: a subtle dash, with the reason for screen readers. */
function Absent({ reason }: { reason: string }) {
	return (
		<span className="text-text-subtle">
			<span aria-hidden="true">—</span>
			<span className="sr-only">{reason}</span>
		</span>
	);
}

export function ClientName({ mission }: { mission: MissionListItem }) {
	// Internal missions belong to no client or engagement.
	return mission.client ? (
		<span className="truncate" title={mission.client.name}>
			{mission.client.name}
		</span>
	) : (
		<Absent reason="No client: an internal mission" />
	);
}

export function MissionStatusPill({ status }: { status: MissionStatus }) {
	return (
		<StatusPill
			size="sm"
			tone={MISSION_STATUS_TONE[status]}
			label={STATUS_PANEL[status].label}
			data-testid="mission-status"
		/>
	);
}

export function LastExport({ mission }: { mission: MissionListItem }) {
	if (!mission.lastExport) return <Absent reason="No export yet" />;
	return (
		<StatusPill
			size="sm"
			tone={exportStatusTone(mission.lastExport.status)}
			label={EXPORT_STATUS_LABEL[mission.lastExport.status]}
			data-testid="mission-last-export"
		/>
	);
}

/**
 * How long an export has been in its status: the relative age, with the
 * stamp on hover. One form wherever an export's status is shown.
 */
export function ExportSince({
	at,
	now,
	className = "type-caption text-text-muted",
	"data-testid": testId,
}: {
	at: string;
	now: number;
	/** The row's own type and colour, where the time sits in a styled column. */
	className?: string;
	"data-testid"?: string;
}) {
	return (
		<time
			dateTime={at}
			title={shortStamp(at)}
			data-testid={testId}
			className={className}
		>
			{relativeTime(at, now)}
		</time>
	);
}

export function LastActivity({ at, now }: { at: string | null; now: number }) {
	if (at === null) {
		return <span className="text-text-subtle">No activity yet</span>;
	}
	return (
		<time dateTime={at} title={at} className="tabular-nums">
			{relativeTime(at, now)}
		</time>
	);
}

/**
 * Every column a mission row can show, ROUTES.md's row: client, type,
 * sprint, status, last export, last activity. A mission has no name of its
 * own; its client, type and sprint say which it is, never its uuid. Three
 * sort, each by the contract's key of the same name.
 */
export type MissionColumnId =
	| "client"
	| "type"
	| "sprint"
	| "status"
	| "lastExport"
	| "lastActivity";

export const MISSION_COLUMN_LABEL: Record<MissionColumnId, string> = {
	client: "Client",
	type: "Type",
	sprint: "Sprint",
	status: "Status",
	lastExport: "Last export",
	lastActivity: "Last activity",
};

/**
 * The Missions panel draws one table per status group, and each table sized
 * its own columns to its rows, so Sprint and Last export moved from group to
 * group. Fixed shares line every group up; Last activity takes the rest.
 */
const MISSION_COLUMN_WIDTH = {
	client: "26%",
	type: "22%",
	lastExport: "20%",
} as const satisfies Partial<Record<MissionColumnId, string>>;

export function missionColumns(now: number): DataColumn<MissionListItem>[] {
	return [
		{
			id: "client",
			header: MISSION_COLUMN_LABEL.client,
			cell: (m) => <ClientName mission={m} />,
			width: MISSION_COLUMN_WIDTH.client,
			sortable: true,
		},
		{
			id: "type",
			header: MISSION_COLUMN_LABEL.type,
			cell: (m) => m.type,
			width: MISSION_COLUMN_WIDTH.type,
		},
		{
			id: "sprint",
			header: MISSION_COLUMN_LABEL.sprint,
			cell: (m) => m.sprintN,
			mono: true,
			align: "end",
			width: "5rem",
			sortable: true,
		},
		{
			id: "status",
			header: MISSION_COLUMN_LABEL.status,
			cell: (m) => <MissionStatusPill status={m.status} />,
		},
		{
			id: "lastExport",
			header: MISSION_COLUMN_LABEL.lastExport,
			cell: (m) => <LastExport mission={m} />,
			width: MISSION_COLUMN_WIDTH.lastExport,
		},
		{
			id: "lastActivity",
			header: MISSION_COLUMN_LABEL.lastActivity,
			cell: (m) => <LastActivity at={m.lastActivityAt} now={now} />,
			sortable: true,
		},
	];
}

/** The needs-you lens adds why. */
export function needsYouColumn(): DataColumn<MissionListItem> {
	return {
		id: "needsYou",
		header: "Why",
		cell: (m) =>
			m.needsYou ? (
				<StatusPill
					size="sm"
					tone="warn"
					label={NEEDS_YOU_COPY[m.needsYou.reason]}
					data-testid="mission-needs-you-reason"
				/>
			) : null,
	};
}

/** A mission on a phone: the row as a card. */
export function MissionCard({
	mission,
	now,
}: {
	mission: MissionListItem;
	now: number;
}) {
	return (
		<div
			data-testid={`mission-card-${mission.id}`}
			className="flex flex-col gap-2"
		>
			<div className="flex items-center justify-between gap-2">
				<span className="min-w-0 truncate type-body font-medium text-foreground">
					<ClientName mission={mission} />
				</span>
				<MissionStatusPill status={mission.status} />
			</div>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 type-small text-text-muted">
				<span>{mission.type}</span>
				<span className="type-mono">sprint {mission.sprintN}</span>
				<LastExport mission={mission} />
				<LastActivity at={mission.lastActivityAt} now={now} />
			</div>
		</div>
	);
}

/*
 * One mission row's geometry, shared by the watch strips and the tree's
 * leaves so they read as one column: 36px rows, the row's
 * subject, its badges, and a fixed, right-aligned time column. The tree indents its leaves; their right-hand columns still land
 * on the strips' because both end 16px in from the panel's edge.
 */
export const MISSION_ROW = "flex h-9 w-full min-w-0 items-center gap-3";
export const MISSION_ROW_SUBJECT =
	"min-w-0 flex-1 truncate type-small text-foreground";
export const MISSION_ROW_TIME =
	"w-40 shrink-0 truncate text-right type-caption text-text-muted";
