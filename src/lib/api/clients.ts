import {
	infiniteQueryOptions,
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
 * name and primary contact; meta.total counts the matches.
 */
export function clientsQuery(api: ApiClient, search?: string) {
	const q = clientSearchText(search);
	return infiniteQueryOptions({
		queryKey: queryKeys.clients.list(CLIENTS_PAGE_SIZE, q),
		queryFn: ({ pageParam }) =>
			callPage(contract.clients.list, () =>
				api.clients.list({
					query: {
						limit: CLIENTS_PAGE_SIZE,
						...(q === undefined ? {} : { q }),
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

export function useClients(search?: string) {
	return useInfiniteQuery(clientsQuery(useApiClient(), search));
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
		onSuccess: () => invalidateClients(queryClient),
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
		onSuccess: () => invalidateClients(queryClient),
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
		onSuccess: () => invalidateBoth(queryClient),
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
		onSuccess: () => invalidateBoth(queryClient),
	});
}

/**
 * Every client write adds a row to the activity log, so the log refreshes
 * with the lists: otherwise /activity serves a cached page without it.
 */
function invalidateClients(queryClient: ReturnType<typeof useQueryClient>) {
	return Promise.all([
		queryClient.invalidateQueries({ queryKey: queryKeys.clients.all() }),
		queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
	]);
}

/** Engagement writes change both lists and add an activity row. */
function invalidateBoth(queryClient: ReturnType<typeof useQueryClient>) {
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
 * match", since meta.total then counts only the matches.
 */
export function clientCountLabel(total: number, searching: boolean): string {
	if (!searching) return clientCount(total);
	return total === 1 ? "1 client matches" : `${total} clients match`;
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
