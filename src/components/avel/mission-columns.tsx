import type { MissionListItem, MissionStatus } from "avel-server/contract";
import { relativeTime } from "@/lib/api/clients";
import type { DataColumn } from "./data-table";
import { NEEDS_YOU_COPY } from "./mission-data";
import { STATUS_PANEL } from "./mission-search";
import { exportStatusTone, StatusPill, type StatusTone } from "./status-pill";

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

/** The first eight characters of a mission id, with the whole id on hover. */
export function MissionId({ id }: { id: string }) {
	return (
		<span title={id} data-testid="mission-id" className="type-mono-small">
			{id.slice(0, 8)}
		</span>
	);
}

export function ClientName({ mission }: { mission: MissionListItem }) {
	// Internal missions belong to no client or engagement.
	return mission.client ? (
		<span className="truncate">{mission.client.name}</span>
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
			label={mission.lastExport.status}
			data-testid="mission-last-export"
		/>
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
 * Every column a mission row can show, ROUTES.md's row: id, client, type,
 * sprint, status, last export, last activity. Three sort, each by the
 * contract's key of the same name.
 */
export type MissionColumnId =
	| "id"
	| "client"
	| "type"
	| "sprint"
	| "status"
	| "lastExport"
	| "lastActivity";

export const MISSION_COLUMN_LABEL: Record<MissionColumnId, string> = {
	id: "Mission",
	client: "Client",
	type: "Type",
	sprint: "Sprint",
	status: "Status",
	lastExport: "Last export",
	lastActivity: "Last activity",
};

export function missionColumns(now: number): DataColumn<MissionListItem>[] {
	return [
		{
			id: "id",
			header: MISSION_COLUMN_LABEL.id,
			cell: (m) => <MissionId id={m.id} />,
			mono: true,
			width: "6.5rem",
		},
		{
			id: "client",
			header: MISSION_COLUMN_LABEL.client,
			cell: (m) => <ClientName mission={m} />,
			sortable: true,
		},
		{
			id: "type",
			header: MISSION_COLUMN_LABEL.type,
			cell: (m) => m.type,
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
				<MissionId id={mission.id} />
				<span>{mission.type}</span>
				<span className="type-mono-small">sprint {mission.sprintN}</span>
				<LastExport mission={mission} />
				<LastActivity at={mission.lastActivityAt} now={now} />
			</div>
		</div>
	);
}

/*
 * One mission row's geometry, shared by the watch strips and the tree's
 * leaves so they read as one column (ruling 30): 36px rows, a fixed id
 * column, the row's subject, its badges, and a fixed, right-aligned time
 * column. The tree indents its leaves; their right-hand columns still land
 * on the strips' because both end 16px in from the panel's edge.
 */
export const MISSION_ROW = "flex h-9 w-full min-w-0 items-center gap-3";
export const MISSION_ROW_ID = "w-24 shrink-0";
export const MISSION_ROW_SUBJECT =
	"min-w-0 flex-1 truncate type-small text-foreground";
export const MISSION_ROW_TIME =
	"w-40 shrink-0 truncate text-right type-caption text-text-muted";
