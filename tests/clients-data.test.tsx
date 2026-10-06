import type { QueryFunctionContext } from "@tanstack/react-query";
import type { Client } from "avel-server/contract";
import { describe, expect, it } from "vitest";
import {
	activeEngagementsLine,
	CLIENT_SEARCH_MAX,
	CLIENTS_PAGE_SIZE,
	changedFields,
	clientCount,
	clientCountLabel,
	clientEngagementsQuery,
	clientSearchText,
	clientsQuery,
	closedEngagementCopy,
	createBodyOf,
	dateInputToIso,
	draftOf,
	engagementSummary,
	fieldErrors,
	isoDate,
	listTotal,
	type Page,
	preconditionReason,
	relativeTime,
	statusTone,
} from "../src/lib/api/clients";
import { queryKeys } from "../src/lib/api/keys";
import { client, contractError, engagement, fakeApi } from "./clients-fixtures";

/** Runs an infinite query's queryFn for one page, as TanStack Query would. */
function runPage<T>(
	options: { queryFn?: unknown; queryKey: readonly unknown[] },
	pageParam: string | undefined,
): Promise<T> {
	const fn = options.queryFn as (ctx: QueryFunctionContext) => Promise<T>;
	return fn({
		queryKey: options.queryKey,
		pageParam,
		signal: new AbortController().signal,
		meta: undefined,
		direction: "forward",
	} as unknown as QueryFunctionContext);
}

describe("mapping a client for display", () => {
	it("tones active as pass and closed as stale, never block", () => {
		expect(statusTone("active")).toBe("pass");
		expect(statusTone("closed")).toBe("stale");
	});

	it("summarises engagements from the row's own counts", () => {
		expect(
			engagementSummary({ engagementCount: 3, activeEngagementCount: 1 }),
		).toBe("3 engagements, 1 active");
		expect(
			engagementSummary({ engagementCount: 2, activeEngagementCount: 0 }),
		).toBe("2 engagements, 0 active");
		expect(
			engagementSummary({ engagementCount: 1, activeEngagementCount: 1 }),
		).toBe("1 engagement, 1 active");
		expect(
			engagementSummary({ engagementCount: 0, activeEngagementCount: 0 }),
		).toBe("0 engagements");
	});

	it("counts clients in words", () => {
		expect(clientCount(1)).toBe("1 client");
		expect(clientCount(0)).toBe("0 clients");
		expect(clientCount(12)).toBe("12 clients");
	});

	it("says how long ago, from a given now", () => {
		const now = Date.parse("2026-10-05T12:00:00.000Z");
		expect(relativeTime("2026-10-05T11:59:40.000Z", now)).toBe("just now");
		expect(relativeTime("2026-10-05T09:00:00.000Z", now)).toBe("3 hours ago");
		expect(relativeTime("2026-10-04T12:00:00.000Z", now)).toBe("yesterday");
		expect(relativeTime("2026-09-05T12:00:00.000Z", now)).toBe("last month");
	});

	it("handles dates as the contract writes them", () => {
		expect(isoDate("2026-09-01T00:00:00.000Z")).toBe("2026-09-01");
		expect(dateInputToIso("2026-10-05")).toBe("2026-10-05T00:00:00.000Z");
	});
});

describe("building request bodies", () => {
	it("creates with the name trimmed and blank optionals left out", () => {
		expect(
			createBodyOf({ name: "  Acme  ", primaryContact: " ", notesMd: "" }),
		).toEqual({
			name: "Acme",
		});
		expect(
			createBodyOf({
				name: "Acme",
				primaryContact: "ada@acme.test",
				notesMd: "Notes",
			}),
		).toEqual({
			name: "Acme",
			primaryContact: "ada@acme.test",
			notesMd: "Notes",
		});
	});

	it("patches only what changed, and nothing when nothing did", () => {
		const c = client(1, { primaryContact: "a@b.test", notesMd: null });
		expect(changedFields(c, draftOf(c))).toBeNull();
		expect(changedFields(c, { ...draftOf(c), name: `${c.name}  ` })).toBeNull();
		expect(changedFields(c, { ...draftOf(c), name: "New name" })).toEqual({
			name: "New name",
		});
		// Clearing an optional field sends null, never "".
		expect(changedFields(c, { ...draftOf(c), primaryContact: "" })).toEqual({
			primaryContact: null,
		});
		expect(
			changedFields(c, { ...draftOf(c), notesMd: "Now has notes" }),
		).toEqual({
			notesMd: "Now has notes",
		});
	});

	it("starts the form from the client, blanks for nulls", () => {
		expect(draftOf(client(1, { primaryContact: null, notesMd: null }))).toEqual(
			{
				name: "Client 1",
				primaryContact: "",
				notesMd: "",
			},
		);
		expect(draftOf()).toEqual({ name: "", primaryContact: "", notesMd: "" });
	});
});

describe("reading server errors", () => {
	// A precondition with an unknown reason, or details on the wrong code,
	// cannot be built: the contract types details per code, and the client
	// checks every error body against it before it reaches a screen.
	it("names the precondition from the typed details.reason", () => {
		expect(
			preconditionReason(
				contractError(422, "PRECONDITION_FAILED", { reason: "client_closed" }),
			),
		).toBe("client_closed");
		expect(
			preconditionReason(
				contractError(422, "PRECONDITION_FAILED", {
					reason: "client_has_active_engagements",
				}),
			),
		).toBe("client_has_active_engagements");
	});

	it("names no precondition for any other failure", () => {
		expect(preconditionReason(contractError(409, "CONFLICT"))).toBeNull();
		expect(
			preconditionReason(contractError(400, "VALIDATION_FAILED")),
		).toBeNull();
		expect(preconditionReason(new Error("x"))).toBeNull();
		expect(preconditionReason(null)).toBeNull();
	});

	it("counts the active engagements, the one fact the error map cannot know", () => {
		expect(activeEngagementsLine(1)).toBe("1 engagement is active.");
		expect(activeEngagementsLine(3)).toBe("3 engagements are active.");
	});

	it("maps validation issues onto the fields they name, with this app's copy", () => {
		const error = contractError(400, "VALIDATION_FAILED", {
			body: [
				{
					path: ["name"],
					message: "String must contain at least 1 character(s)",
				},
				{ path: ["primaryContact"], message: "too long" },
				{ path: ["unknownField"], message: "x" },
				{ path: [0], message: "an index, not a field" },
			],
		});
		const errors = fieldErrors(error);
		expect(Object.keys(errors).sort()).toEqual(["name", "primaryContact"]);
		expect(errors.name).toBe("Give it a name of 1 to 200 characters.");
		// The server's message is for logs, never shown.
		expect(Object.values(errors).join(" ")).not.toMatch(/String must contain/);
		// Issues in another part of the request, or none at all, map to nothing.
		expect(
			fieldErrors(
				contractError(400, "VALIDATION_FAILED", {
					// "name" here is a query parameter, not the form's field: it must
					// not land on the name input.
					query: [{ path: ["name"], message: "Invalid query" }],
				}),
			),
		).toEqual({});
		expect(fieldErrors(contractError(400, "VALIDATION_FAILED"))).toEqual({});
		expect(
			fieldErrors(
				contractError(422, "PRECONDITION_FAILED", { reason: "client_closed" }),
			),
		).toEqual({});
	});
});

describe("the list queries", () => {
	it("pages clients by cursor, reading the next cursor from meta", async () => {
		const items = [client(1), client(2)];
		const { client: api, calls } = fakeApi(() => ({
			status: 200,
			body: { success: true, data: items, meta: { nextCursor: "c2" } },
		}));
		const options = clientsQuery(api);
		expect(options.queryKey).toEqual(queryKeys.clients.list(CLIENTS_PAGE_SIZE));

		const first = await runPage<Page<Client>>(options, undefined);
		expect(first.data).toHaveLength(2);
		expect(first.meta.nextCursor).toBe("c2");
		expect(calls[0]?.path).toBe(
			`http://avel.test/api/clients?limit=${CLIENTS_PAGE_SIZE}`,
		);

		await runPage(options, "c2");
		expect(calls[1]?.path).toContain("cursor=c2");
		expect(
			options.getNextPageParam?.(first, [first], undefined, [undefined]),
		).toBe("c2");
		expect(
			options.getNextPageParam?.(
				{ data: [], meta: { nextCursor: null } },
				[],
				undefined,
				[],
			),
		).toBeUndefined();
	});

	it("lists one client's engagements, by its id", async () => {
		const c = client(1);
		const { client: api, calls } = fakeApi(() => ({
			status: 200,
			body: {
				success: true,
				data: [engagement(1, c.id)],
				meta: { nextCursor: null },
			},
		}));
		const options = clientEngagementsQuery(api, c.id);
		expect(options.queryKey[0]).toBe("engagements");
		const page = await runPage<Page<unknown>>(options, undefined);
		expect(page.data).toHaveLength(1);
		expect(page.meta.nextCursor).toBeNull();
		expect(calls[0]?.path).toContain(`clientId=${c.id}`);
		expect(calls[0]?.path).toContain("/api/engagements?");
	});

	it("keeps the list's exact total when the route gives one, and nothing when not", async () => {
		const answer = (meta: object) =>
			fakeApi(() => ({
				status: 200,
				body: { success: true, data: [client(1)], meta },
			})).client;
		const withTotal = await runPage<Page<Client>>(
			clientsQuery(answer({ nextCursor: "c1", total: 120 })),
			undefined,
		);
		expect(withTotal.meta.total).toBe(120);
		const without = await runPage<Page<Client>>(
			clientsQuery(answer({ nextCursor: null })),
			undefined,
		);
		expect(without.meta).not.toHaveProperty("total");
	});

	it("reads the total from the first page, never from the rows loaded", () => {
		expect(
			listTotal({
				pages: [
					{ data: [client(1)], meta: { nextCursor: "c1", total: 120 } },
					// Totals can differ by page if rows change between requests; the
					// first page, always present, is the one the list started from.
					{ data: [client(2)], meta: { nextCursor: null, total: 121 } },
				],
			}),
		).toBe(120);
		// A page as the data layer builds it when the route sends no total.
		const untotalled: Page<Client> = {
			data: [client(1)],
			meta: { nextCursor: null },
		};
		expect(listTotal({ pages: [untotalled] })).toBeUndefined();
		expect(listTotal(undefined)).toBeUndefined();
		expect(listTotal({ pages: [{ meta: { total: 0 } }] })).toBe(0);
	});

	it("filters a client's engagements by status only when asked, in its own cache entry", async () => {
		const c = client(1);
		const { client: api, calls } = fakeApi(() => ({
			status: 200,
			body: { success: true, data: [], meta: { nextCursor: null } },
		}));
		const all = clientEngagementsQuery(api, c.id);
		const active = clientEngagementsQuery(api, c.id, "active");
		await runPage(all, undefined);
		await runPage(active, undefined);
		expect(calls[0]?.path).not.toContain("status=");
		expect(calls[1]?.path).toContain("status=active");
		expect(calls[1]?.path).toContain(`clientId=${c.id}`);
		expect(active.queryKey).not.toEqual(all.queryKey);
		expect(JSON.stringify(active.queryKey)).toContain('"status":"active"');
		expect(JSON.stringify(all.queryKey)).not.toContain("status");
	});

	it("says what closing an engagement revoked", () => {
		expect(closedEngagementCopy(0)).toBe(
			"Engagement closed. It had no live connections.",
		);
		expect(closedEngagementCopy(1)).toBe(
			"Engagement closed. 1 connection was revoked.",
		);
		expect(closedEngagementCopy(4)).toBe(
			"Engagement closed. 4 connections were revoked.",
		);
	});

	it("sends a search only when there is one, trimmed and within 200 characters", async () => {
		const { client: api, calls } = fakeApi(() => ({
			status: 200,
			body: { success: true, data: [], meta: { nextCursor: null, total: 0 } },
		}));
		await runPage(clientsQuery(api), undefined);
		await runPage(clientsQuery(api, "   "), undefined);
		await runPage(clientsQuery(api, "  acme co  "), undefined);
		await runPage(clientsQuery(api, "y".repeat(250)), undefined);
		expect(calls[0]?.path).not.toContain("q=");
		expect(calls[1]?.path).not.toContain("q=");
		expect(calls[2]?.path).toContain("q=acme%20co");
		const long = new URL(calls[3]?.path ?? "").searchParams.get("q");
		expect(long).toHaveLength(200);
	});

	it("keys each search separately from the unsearched list", () => {
		const { client: api } = fakeApi();
		expect(clientsQuery(api).queryKey).toEqual(
			queryKeys.clients.list(CLIENTS_PAGE_SIZE),
		);
		expect(JSON.stringify(clientsQuery(api).queryKey)).not.toContain('"q"');
		expect(clientsQuery(api, " acme ").queryKey).toEqual(
			queryKeys.clients.list(CLIENTS_PAGE_SIZE, "acme"),
		);
		expect(clientsQuery(api, "acme").queryKey).not.toEqual(
			clientsQuery(api).queryKey,
		);
	});

	it("normalises search text the way the server requires", () => {
		expect(clientSearchText(undefined)).toBeUndefined();
		expect(clientSearchText("  ")).toBeUndefined();
		expect(clientSearchText("  acme ")).toBe("acme");
		expect(clientSearchText("z".repeat(201))).toHaveLength(CLIENT_SEARCH_MAX);
		expect(CLIENT_SEARCH_MAX).toBe(200);
	});

	it("counts matches as matches under a search", () => {
		expect(clientCountLabel(12, false)).toBe("12 clients");
		expect(clientCountLabel(3, true)).toBe("3 clients match");
		expect(clientCountLabel(1, true)).toBe("1 client matches");
	});

	it("nests keys, so invalidating all clients reaches every list", () => {
		const list = queryKeys.clients.list(50);
		expect(list.slice(0, queryKeys.clients.all().length)).toEqual(
			queryKeys.clients.all(),
		);
		const byClient = queryKeys.engagements.byClient("x", 50);
		expect(byClient.slice(0, 1)).toEqual(queryKeys.engagements.all());
	});
});
