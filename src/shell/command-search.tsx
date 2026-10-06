import { useInfiniteQuery } from "@tanstack/react-query";
import type { Client, MissionListItem } from "avel-server/contract";
import { Building2, Target } from "lucide-react";
import { useEffect, useState } from "react";
import { MISSION_STATUS_TONE } from "@/components/avel/mission-columns";
import {
	type MissionListParams,
	missionListQuery,
	rowsOf,
} from "@/components/avel/mission-data";
import {
	ORIGIN_LABEL,
	ORIGINS,
	type Origin,
	STATUS_PANEL,
} from "@/components/avel/mission-search";
import { StatusPill } from "@/components/avel/status-pill";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { useApiClient } from "@/lib/api";
import { clientsQuery, statusTone } from "@/lib/api/clients";

/** Search waits this long after the last keystroke before asking the server. */
export const SEARCH_DEBOUNCE_MS = 200;
/** At most this many results per group. */
export const RESULTS_PER_GROUP = 5;

/** `value`, once it has held still for `ms`. Starts at the first value. */
export function useDebounced<T>(value: T, ms: number): T {
	const [settled, setSettled] = useState(value);
	useEffect(() => {
		const timer = window.setTimeout(() => setSettled(value), ms);
		return () => window.clearTimeout(timer);
	}, [value, ms]);
	return settled;
}

/**
 * The query a search sends: the Missions page's own list, so a search shares
 * its cache. Newest activity first, archived left out, like the page's
 * default.
 */
export function missionSearchParams(
	origin: Origin,
	q: string,
): MissionListParams {
	return { origin, q, sort: "lastActivity", includeArchived: false };
}

/**
 * How a mission reads in a list of results: its client and type, or its type
 * alone for an internal mission, then its sprint. A mission has no name in
 * the contract, so this is the line the Missions page leads with too.
 */
export function missionLabel(mission: MissionListItem): string {
	const what = mission.client
		? `${mission.client.name}, ${mission.type}`
		: mission.type;
	return `${what}, sprint ${mission.sprintN}`;
}

/**
 * Missions matching the search, one group per origin. Client and internal
 * missions are never listed together (DATA-CONTRACTS-V2.md, Mission): each is
 * its own request and its own labelled group. Clients are searched by
 * ClientResults, below.
 *
 * Results come from the server's match, not the menu's own filter, so they
 * are force-mounted and stay while the typed text runs ahead of the debounce.
 */
export function MissionResults({
	query,
	onOpen,
}: {
	/** The settled, trimmed search text. Empty shows nothing. */
	query: string;
	onOpen: (mission: MissionListItem) => void;
}) {
	if (query === "") return null;
	return (
		<>
			{ORIGINS.map((origin) => (
				<OriginResults
					key={origin}
					origin={origin}
					query={query}
					onOpen={onOpen}
				/>
			))}
		</>
	);
}

function OriginResults({
	origin,
	query,
	onOpen,
}: {
	origin: Origin;
	query: string;
	onOpen: (mission: MissionListItem) => void;
}) {
	const api = useApiClient();
	const result = useInfiniteQuery(
		missionListQuery(api, missionSearchParams(origin, query)),
	);
	const heading = `${ORIGIN_LABEL[origin]} missions`;
	const testid = `command-results-${origin}`;

	if (result.status === "pending") {
		return (
			<CommandGroup heading={heading} forceMount data-testid={testid}>
				<Quiet testid={`${testid}-loading`}>Searching</Quiet>
			</CommandGroup>
		);
	}
	if (result.status === "error") {
		return (
			<CommandGroup heading={heading} forceMount data-testid={testid}>
				<Quiet testid={`${testid}-error`}>
					{`Could not search ${ORIGIN_LABEL[origin].toLowerCase()} missions.`}
				</Quiet>
			</CommandGroup>
		);
	}
	const missions = rowsOf(result).slice(0, RESULTS_PER_GROUP);
	return (
		<CommandGroup heading={heading} forceMount data-testid={testid}>
			{missions.length === 0 ? (
				<Quiet testid={`${testid}-empty`}>No matches.</Quiet>
			) : (
				missions.map((mission) => (
					<CommandItem
						key={mission.id}
						forceMount
						value={`mission ${mission.id}`}
						data-testid={`command-mission-${mission.id}`}
						onSelect={() => onOpen(mission)}
					>
						<Target aria-hidden="true" />
						<span className="min-w-0 flex-1 truncate">
							{missionLabel(mission)}
						</span>
						<StatusPill
							size="sm"
							tone={MISSION_STATUS_TONE[mission.status]}
							label={STATUS_PANEL[mission.status].label}
						/>
					</CommandItem>
				))
			)}
		</CommandGroup>
	);
}

/** A state line inside the list: quiet, and not selectable. */
function Quiet({ testid, children }: { testid: string; children: string }) {
	return (
		<p data-testid={testid} className="type-small px-2 py-2 text-text-subtle">
			{children}
		</p>
	);
}

/**
 * Clients matching the search: contract.clients.list's `q`, over the name and
 * primary contact. Its own query, keyed by the search, so a typed search never
 * reuses the page's unsearched list.
 */
export function ClientResults({
	query,
	onOpen,
}: {
	query: string;
	onOpen: (client: Client) => void;
}) {
	const api = useApiClient();
	const result = useInfiniteQuery({
		...clientsQuery(api, query),
		enabled: query !== "",
	});
	if (query === "") return null;
	const heading = "Clients";
	const testid = "command-results-clients";

	if (result.status === "pending") {
		return (
			<CommandGroup heading={heading} forceMount data-testid={testid}>
				<Quiet testid={`${testid}-loading`}>Searching</Quiet>
			</CommandGroup>
		);
	}
	if (result.status === "error") {
		return (
			<CommandGroup heading={heading} forceMount data-testid={testid}>
				<Quiet testid={`${testid}-error`}>Could not search clients.</Quiet>
			</CommandGroup>
		);
	}
	const clients = result.data.pages
		.flatMap((page) => page.data)
		.slice(0, RESULTS_PER_GROUP);
	return (
		<CommandGroup heading={heading} forceMount data-testid={testid}>
			{clients.length === 0 ? (
				<Quiet testid={`${testid}-empty`}>No matches.</Quiet>
			) : (
				clients.map((client) => (
					<CommandItem
						key={client.id}
						forceMount
						value={`client ${client.id}`}
						data-testid={`command-client-${client.id}`}
						onSelect={() => onOpen(client)}
					>
						<Building2 aria-hidden="true" />
						<span className="min-w-0 flex-1 truncate">{client.name}</span>
						<StatusPill
							size="sm"
							tone={statusTone(client.status)}
							label={client.status === "active" ? "Active" : "Closed"}
						/>
					</CommandItem>
				))
			)}
		</CommandGroup>
	);
}
