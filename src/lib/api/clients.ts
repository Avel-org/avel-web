import {
	infiniteQueryOptions,
	type QueryClient,
	queryOptions,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	type Client,
	type ClientStatus,
	contract,
	type createClientBody,
	type createEngagementBody,
	type EngagementStatus,
	type PageMeta,
	type PreconditionReason,
	type updateClientBody,
} from "avel-server/contract";
import type { z } from "zod";
import type { StatusTone } from "@/components/avel/status-pill";
import { type ApiClient, call, callPage } from "./client";
import { ApiError } from "./errors";
import { queryKeys } from "./keys";
import { useApiClient } from "./provider";

export const CLIENTS_PAGE_SIZE = 50;
export const ENGAGEMENTS_PAGE_SIZE = 50;

export type CreateClientBody = z.input<typeof createClientBody>;
export type UpdateClientBody = z.input<typeof updateClientBody>;
export type CreateEngagementBody = z.input<typeof createEngagementBody>;

/**
 * One page of a list route: the success envelope's `data` and `meta`, as the
 * shared callPage() returns them. `meta.total` is the list's exact total when
 * the route gives one; it is optional in the contract.
 */
export type Page<T> = { data: T[]; meta: PageMeta };

/** The longest search contract.clients.list accepts. */
export const CLIENT_SEARCH_MAX = 200;

/**
 * The search to send, or undefined to send none. The server answers 400 to
 * an empty or over-long `q`, so the text is trimmed, left out when empty,
 * and cut to the limit.
 */
export function clientSearchText(text: string | undefined): string | undefined {
	const trimmed = (text ?? "").trim().slice(0, CLIENT_SEARCH_MAX).trim();
	return trimmed === "" ? undefined : trimmed;
}

/**
 * contract.clients.list, newest first, a page at a time. `q` searches the
 * name and primary contact and `status` keeps one status, both on the
 * server; meta.total counts what they keep.
 */
export function clientsQuery(
	api: ApiClient,
	search?: string,
	status?: ClientStatus,
) {
	const q = clientSearchText(search);
	return infiniteQueryOptions({
		queryKey: queryKeys.clients.list(CLIENTS_PAGE_SIZE, q, status),
		queryFn: ({ pageParam }) =>
			callPage(contract.clients.list, () =>
				api.clients.list({
					query: {
						limit: CLIENTS_PAGE_SIZE,
						...(q === undefined ? {} : { q }),
						...(status === undefined ? {} : { status }),
						...(pageParam ? { cursor: pageParam } : {}),
					},
				}),
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
	});
}

/**
 * contract.engagements.list for one client. Used only when its row opens.
 * `status` narrows it, such as to the active engagements blocking a close.
 */
export function clientEngagementsQuery(
	api: ApiClient,
	clientId: string,
	status?: EngagementStatus,
) {
	return infiniteQueryOptions({
		queryKey: queryKeys.engagements.byClient(
			clientId,
			ENGAGEMENTS_PAGE_SIZE,
			status,
		),
		queryFn: ({ pageParam }) =>
			callPage(contract.engagements.list, () =>
				api.engagements.list({
					query: {
						clientId,
						...(status ? { status } : {}),
						limit: ENGAGEMENTS_PAGE_SIZE,
						...(pageParam ? { cursor: pageParam } : {}),
					},
				}),
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
	});
}

/**
 * One clients list. `enabled` is false for a list the page does not show,
 * so the board and the table each read only their own lists.
 */
export function useClients(
	search?: string,
	status?: ClientStatus,
	{ enabled = true }: { enabled?: boolean } = {},
) {
	return useInfiniteQuery({
		...clientsQuery(useApiClient(), search, status),
		enabled,
	});
}

export function useClientEngagements(
	clientId: string,
	status?: EngagementStatus,
) {
	return useInfiniteQuery(
		clientEngagementsQuery(useApiClient(), clientId, status),
	);
}

/**
 * contract.clients.get: the selected client, fetched by id, so a selected
 * client is a link that works whatever the list's search or paging. A client
 * that is gone answers 404 NOT_FOUND.
 */
export function clientQuery(api: ApiClient, id: string) {
	return queryOptions({
		queryKey: queryKeys.clients.detail(id),
		queryFn: () =>
			call(contract.clients.get, () => api.clients.get({ params: { id } })),
	});
}

export function useClient(id: string) {
	return useQuery(clientQuery(useApiClient(), id));
}

/** Creates a client, then refreshes every clients list. */
export function useCreateClient() {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: CreateClientBody) =>
			call(contract.clients.create, () => api.clients.create({ body })),
		onSuccess: () => afterClientWrite(queryClient),
	});
}

/** Patches a client. Send only what changed: an empty patch is a 400. */
export function useUpdateClient() {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, patch }: { id: string; patch: UpdateClientBody }) =>
			call(contract.clients.update, () =>
				api.clients.update({ params: { id }, body: patch }),
			),
		onSuccess: () => afterClientUpdated(queryClient),
	});
}

/**
 * Creates an engagement. Both lists refresh: the client's counts change with
 * its engagements.
 */
export function useCreateEngagement() {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: CreateEngagementBody) =>
			call(contract.engagements.create, () => api.engagements.create({ body })),
		onSuccess: () => afterEngagementWrite(queryClient),
	});
}

/** One engagement, for its name and the client it belongs to. */
export function engagementQuery(api: ApiClient, id: string) {
	return queryOptions({
		queryKey: queryKeys.engagements.detail(id),
		queryFn: () =>
			call(contract.engagements.get, () =>
				api.engagements.get({ params: { id } }),
			),
	});
}

export function useEngagement(id: string | null) {
	return useQuery({
		...engagementQuery(useApiClient(), id ?? ""),
		enabled: id !== null,
	});
}

/** Closes an engagement, which also revokes its live connections. */
export function useCloseEngagement() {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) =>
			call(contract.engagements.close, () =>
				api.engagements.close({ params: { id } }),
			),
		onSuccess: () => afterEngagementClosed(queryClient),
	});
}

/**
 * A close revokes the engagement's live connections in the same transaction,
 * so the connections list reads again with the engagement lists: otherwise
 * Settings > Connections shows a revoked connection as live.
 */
export function afterEngagementClosed(queryClient: QueryClient) {
	return Promise.all([
		afterEngagementWrite(queryClient),
		queryClient.invalidateQueries({ queryKey: queryKeys.connections.all() }),
		// Its missions can no longer start: their readiness reads it (audit F2).
		queryClient.invalidateQueries({ queryKey: queryKeys.missions.all() }),
	]);
}

/**
 * A client's missions show its name, and their readiness its status, so an
 * update reads them again with the lists (audit F2). A new client has no
 * missions, so a create does not.
 */
export function afterClientUpdated(queryClient: QueryClient) {
	return Promise.all([
		afterClientWrite(queryClient),
		queryClient.invalidateQueries({ queryKey: queryKeys.missions.all() }),
	]);
}

/**
 * Every client write adds a row to the activity log, so the log refreshes
 * with the lists: otherwise /activity serves a cached page without it.
 */
export function afterClientWrite(queryClient: QueryClient) {
	return Promise.all([
		queryClient.invalidateQueries({ queryKey: queryKeys.clients.all() }),
		queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
	]);
}

/** Engagement writes change both lists and add an activity row. */
export function afterEngagementWrite(queryClient: QueryClient) {
	return Promise.all([
		queryClient.invalidateQueries({ queryKey: queryKeys.clients.all() }),
		queryClient.invalidateQueries({ queryKey: queryKeys.engagements.all() }),
		queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
	]);
}

// Pure functions below: no React, no network, so they are tested directly.

/** Active is pass; closed is stale (ended, not failed). */
export function statusTone(
	status: ClientStatus | EngagementStatus,
): StatusTone {
	return status === "active" ? "pass" : "stale";
}

/**
 * "3 engagements, 1 active", from the row's own counts. A client with none
 * says "0 engagements", not "0 engagements, 0 active".
 */
export function engagementSummary(
	client: Pick<Client, "engagementCount" | "activeEngagementCount">,
): string {
	const n = client.engagementCount;
	const engagements = n === 1 ? "1 engagement" : `${n} engagements`;
	if (n === 0) return engagements;
	return `${engagements}, ${client.activeEngagementCount} active`;
}

/**
 * The list's total from its first page's meta, or undefined when the route
 * gave none. Never counted from the rows loaded so far: that is a guess.
 */
export function listTotal<P extends { meta: { total?: number } }>(
	data: { pages: P[] } | undefined,
): number | undefined {
	return data?.pages[0]?.meta.total;
}

/**
 * What closing an engagement did, from the close response's
 * revokedConnections. Zero is said plainly rather than as "0 connections".
 */
export function closedEngagementCopy(revokedConnections: number): string {
	if (revokedConnections === 0) {
		return "Engagement closed. It had no live connections.";
	}
	if (revokedConnections === 1) {
		return "Engagement closed. 1 connection was revoked.";
	}
	return `Engagement closed. ${revokedConnections} connections were revoked.`;
}

/**
 * The count for the top bar: "12 clients", or under a search "3 clients
 * match", since meta.total then counts only the matches. Under a status
 * alone it names the status: "2 active clients".
 */
export function clientCountLabel(
	total: number,
	searching: boolean,
	status?: ClientStatus,
): string {
	if (searching) {
		return total === 1 ? "1 client matches" : `${total} clients match`;
	}
	if (status) {
		return total === 1 ? `1 ${status} client` : `${total} ${status} clients`;
	}
	return clientCount(total);
}

/** "1 client", "12 clients". */
export function clientCount(n: number): string {
	return n === 1 ? "1 client" : `${n} clients`;
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	["year", 365 * 24 * 3600],
	["month", 30 * 24 * 3600],
	["week", 7 * 24 * 3600],
	["day", 24 * 3600],
	["hour", 3600],
	["minute", 60],
];
const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "3 hours ago", "yesterday", "just now". `now` is passed in, so it tests. */
export function relativeTime(iso: string, now: number): string {
	const seconds = Math.round((Date.parse(iso) - now) / 1000);
	for (const [unit, size] of UNITS) {
		if (Math.abs(seconds) >= size) {
			return RELATIVE.format(Math.trunc(seconds / size), unit);
		}
	}
	return "just now";
}

/** The date part of an ISO timestamp, for a machine-text date column. */
export function isoDate(iso: string): string {
	return iso.slice(0, 10);
}

/** A date input's "YYYY-MM-DD" as the ISO datetime the contract takes. */
export function dateInputToIso(date: string): string {
	return `${date}T00:00:00.000Z`;
}

/** The client form's fields, as typed. Optional fields may be blank. */
export type ClientDraft = {
	name: string;
	primaryContact: string;
	notesMd: string;
};

export function draftOf(client?: Client): ClientDraft {
	return {
		name: client?.name ?? "",
		primaryContact: client?.primaryContact ?? "",
		notesMd: client?.notesMd ?? "",
	};
}

/** A blank optional field is null on the wire, never an empty string. */
const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

/** The create body from the form: only what was given. */
export function createBodyOf(draft: ClientDraft): CreateClientBody {
	const primaryContact = orNull(draft.primaryContact);
	const notesMd = orNull(draft.notesMd);
	return {
		name: draft.name.trim(),
		...(primaryContact === null ? {} : { primaryContact }),
		...(notesMd === null ? {} : { notesMd }),
	};
}

/**
 * Only the fields that differ from the client. Returns null when nothing
 * changed, so the caller never sends an empty patch (the server answers 400).
 */
export function changedFields(
	client: Client,
	draft: ClientDraft,
): UpdateClientBody | null {
	const patch: UpdateClientBody = {};
	const name = draft.name.trim();
	if (name !== client.name) patch.name = name;
	const primaryContact = orNull(draft.primaryContact);
	if (primaryContact !== client.primaryContact) {
		patch.primaryContact = primaryContact;
	}
	const notesMd = orNull(draft.notesMd);
	if (notesMd !== client.notesMd) patch.notesMd = notesMd;
	return Object.keys(patch).length === 0 ? null : patch;
}

/**
 * The precondition a 422 named. The contract types it: narrowing on
 * PRECONDITION_FAILED gives `details.reason`, and the client has already
 * checked the body against the contract, so no guessing is needed here.
 * The words for each reason are the error map's (PRECONDITION_COPY); this
 * only says which one, for a screen that acts on it.
 */
export function preconditionReason(error: unknown): PreconditionReason | null {
	if (!(error instanceof ApiError)) return null;
	const { failure } = error;
	if (failure.kind === "contract" && failure.code === "PRECONDITION_FAILED") {
		return failure.details.reason;
	}
	return null;
}

/**
 * The one fact the error map cannot know when a close is refused: how many
 * engagements are active. It comes from the client's own row.
 */
export function activeEngagementsLine(count: number): string {
	return count === 1
		? "1 engagement is active."
		: `${count} engagements are active.`;
}

/**
 * Field errors from a VALIDATION_FAILED answer: the contract types
 * `details.body` as issues with a path. The server's message is for logs, so
 * each field gets copy written here; an issue on a field the form does not
 * show is left to the error map's general copy.
 */
const FIELD_COPY: Record<string, string> = {
	name: "Give it a name of 1 to 200 characters.",
	primaryContact: "Keep the contact to 200 characters.",
	notesMd: "Keep the notes to 20,000 characters.",
	scopeMd: "Keep the scope to 20,000 characters.",
	startedAt: "Give a valid start date.",
};

export function fieldErrors(error: unknown): Record<string, string> {
	if (!(error instanceof ApiError)) return {};
	const { failure } = error;
	if (failure.kind !== "contract" || failure.code !== "VALIDATION_FAILED") {
		return {};
	}
	const errors: Record<string, string> = {};
	for (const issue of failure.details?.body ?? []) {
		const field = issue.path[0];
		const copy = typeof field === "string" ? FIELD_COPY[field] : undefined;
		if (field !== undefined && copy) errors[field] = copy;
	}
	return errors;
}

// The client board and the client's page (ruling 45).

/** A client page's tabs, in order. Overview is the page with no parameter. */
export const CLIENT_TABS = [
	"overview",
	"engagements",
	"intakes",
	"drive",
	"activity",
] as const;

export type ClientTabId = (typeof CLIENT_TABS)[number];

/** "AC" for "Acme Corp", "ME" for "Meridian": two letters for a tile. */
export function clientInitials(name: string): string {
	// Words that start with a letter or digit: "Halvorsen & Pike" is "HP".
	const words = name
		.trim()
		.split(/\s+/)
		.filter((word) => /^[\p{L}\p{N}]/u.test(word));
	const [first, second] = words;
	if (first && second) return `${first[0]}${second[0]}`.toUpperCase();
	return (first ?? "").slice(0, 2).toUpperCase();
}

const MONTH = new Intl.DateTimeFormat("en-GB", {
	month: "long",
	year: "numeric",
	timeZone: "UTC",
});

/** "October 2026", in UTC, so every viewer reads the same month. */
export function monthLabel(iso: string): string {
	return MONTH.format(new Date(iso));
}

/**
 * When anything last happened to the client, its engagements or their
 * missions, from lastActivityAt: "Last activity 3 days ago", or "No activity
 * yet" when the log has nothing on it. Never updatedAt, which moves only when
 * the client's own fields change.
 */
export function lastActivityLabel(
	client: Pick<Client, "lastActivityAt">,
	now: number,
): string {
	return client.lastActivityAt === null
		? "No activity yet"
		: `Last activity ${relativeTime(client.lastActivityAt, now)}`;
}

/**
 * The banner's facts line: "Client since October 2026 · jane@acme.com ·
 * last activity 3 days ago".
 */
export function clientFacts(client: Client, now: number): string {
	const activity = lastActivityLabel(client, now);
	return [
		`Client since ${monthLabel(client.createdAt)}`,
		client.primaryContact ?? "No primary contact",
		// Mid-line, so it starts lower case.
		`${activity[0]?.toLowerCase() ?? ""}${activity.slice(1)}`,
	].join(" · ");
}

/** The most segments a card's engagement meter draws before it says "+n". */
export const METER_SEGMENTS = 12;

/**
 * A card's engagement meter, from the row's own counts: one segment per
 * engagement, active first, capped so a long history stays one line.
 */
export function engagementMeter(
	client: Pick<Client, "engagementCount" | "activeEngagementCount">,
): { active: number; closed: number; more: number } {
	const total = client.engagementCount;
	const active = Math.min(client.activeEngagementCount, METER_SEGMENTS);
	const closed = Math.min(
		total - client.activeEngagementCount,
		METER_SEGMENTS - active,
	);
	return { active, closed, more: Math.max(0, total - METER_SEGMENTS) };
}

// A client's missions (ruling 45, amended): contract.missions.list narrowed
// to the client with clientId, which meta.total and meta.counts follow.

/** How many of a client's missions its page loads at a time. */
export const CLIENT_MISSIONS_PAGE_SIZE = 20;

/**
 * contract.missions.list for one client, most recent activity first (the
 * list's default sort), a page at a time. meta.total is the client's mission
 * count and meta.counts.byStatus its status strip. Archived missions stay
 * hidden, as on Missions. `limit` 1 reads only the count.
 */
export function clientMissionsQuery(
	api: ApiClient,
	clientId: string,
	limit = CLIENT_MISSIONS_PAGE_SIZE,
) {
	return infiniteQueryOptions({
		queryKey: queryKeys.clientMissions.list(clientId, limit),
		queryFn: ({ pageParam }) =>
			callPage(contract.missions.list, () =>
				api.missions.list({
					query: {
						origin: "client",
						clientId,
						limit,
						...(pageParam ? { cursor: pageParam } : {}),
					},
				}),
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
	});
}

export function useClientMissions(clientId: string) {
	return useInfiniteQuery(clientMissionsQuery(useApiClient(), clientId));
}

/**
 * A client's mission count alone, for its card on the board: one row
 * requested, meta.total read. One small read per card.
 */
export function useClientMissionCount(clientId: string) {
	return useInfiniteQuery({
		...clientMissionsQuery(useApiClient(), clientId, 1),
		select: (data) => data.pages[0]?.meta.total,
	});
}

/** "1 mission", "4 missions". */
export function missionCount(n: number): string {
	return n === 1 ? "1 mission" : `${n} missions`;
}
