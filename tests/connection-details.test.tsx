import { QueryClient } from "@tanstack/react-query";
import type { Connection } from "avel-server/contract";
import { describe, expect, it, vi } from "vitest";
import {
	CONNECTIONS_PAGE_SIZE,
	cachedConnection,
	connectionQuery,
} from "@/lib/api/connections";
import { queryKeys } from "@/lib/api/keys";
import {
	CONNECTIONS,
	connection,
	notFoundError,
	renderSeeded,
	seededClient,
} from "./catalog-fixtures";
import { fakeApi } from "./clients-fixtures";
import { tagOf } from "./render-page";
import { visibleText } from "./visible-text";

// The sheet portals in a browser; drawn in place so the server render shows it.
vi.mock("@/components/ui/sheet", () => import("./missions-sheet-inline"));

/*
 * One connection's details (GET /api/connections/:id), a sheet named by the
 * Connections page's `connection` search param: seeded from the list so it
 * opens at once, read on its own so a deep link works, and the token never
 * shown, only the variable's name.
 */

const PATH = "/settings/connections";
const first = CONNECTIONS[0] as Connection;
const revoked = CONNECTIONS[1] as Connection;
const own = CONNECTIONS[3] as Connection;

const infinite = (rows: readonly Connection[]) => ({
	pages: [{ data: [...rows], meta: { nextCursor: null, total: rows.length } }],
	pageParams: [undefined],
});

describe("one connection, read alone", () => {
	it("reads GET /api/connections/:id", async () => {
		const { client, calls } = fakeApi(() => ({
			status: 200,
			body: { success: true, data: first },
		}));
		const data = await new QueryClient().fetchQuery(
			connectionQuery(client, first.id),
		);
		expect(data).toEqual(first);
		expect(calls).toEqual([
			{
				method: "GET",
				path: `http://avel.test/api/connections/${first.id}`,
				body: undefined,
			},
		]);
	});

	it("is seeded from any list that holds it, as old as that list's read", () => {
		const qc = new QueryClient();
		// The counts hold a page or a number, never rows to search.
		qc.setQueryData(queryKeys.connections.statusCount("active"), {
			data: [first],
			meta: { nextCursor: null, total: 1 },
		});
		qc.setQueryData(queryKeys.connections.activeCount(first.id), 3);
		expect(cachedConnection(qc, first.id)).toBeUndefined();
		qc.setQueryData(
			queryKeys.connections.byStatus(CONNECTIONS_PAGE_SIZE, "revoked"),
			infinite([revoked]),
			{ updatedAt: 1_000 },
		);
		expect(cachedConnection(qc, revoked.id)).toEqual({
			connection: revoked,
			readAt: 1_000,
		});
		expect(cachedConnection(qc, first.id)).toBeUndefined();
	});

	it("sits under connections, so a create or an engagement close reads it again", () => {
		expect(queryKeys.connections.detail(first.id).slice(0, 1)).toEqual(
			queryKeys.connections.all(),
		);
	});
});

describe("the details sheet", () => {
	it("opens at once from the list: every field, and the variable's name only", async () => {
		const html = await renderSeeded(
			`${PATH}?connection=${first.id}`,
			seededClient({ connections: CONNECTIONS }),
		);
		expect(tagOf(html, "connection-details")).toContain(
			'data-sheet-side="right"',
		);
		expect(tagOf(html, "connection-details-body")).toContain(
			'data-state="success"',
		);
		const text = visibleText(html);
		expect(text).toContain(first.label);
		expect(html).toContain(
			`data-testid="connection-details-scope" class="break-all type-mono text-text">${first.scopeValue}<`,
		);
		expect(html).toContain(
			`data-testid="connection-details-credential" class="break-all type-mono text-text">${first.credentialRef}<`,
		);
		expect(text).toContain(
			"The environment variable on the server that holds the token.",
		);
		expect(tagOf(html, "connection-details-status")).toContain(
			'data-tone="pass"',
		);
		expect(tagOf(html, "connection-details-created")).toContain(
			`dateTime="${first.createdAt}"`,
		);
		// Its engagement, read by id (unseeded here, so still loading).
		expect(html).toContain(
			'data-testid="connection-details-engagement-loading"',
		);
		expect(text).toContain(`Each use is limited to ${first.scopeValue}.`);
	});

	it("says a revoked one refuses every use, and when it was revoked", async () => {
		const html = await renderSeeded(
			`${PATH}?connection=${revoked.id}`,
			seededClient({ connections: CONNECTIONS }),
		);
		expect(tagOf(html, "connection-details-status")).toContain(
			'data-tone="stale"',
		);
		expect(tagOf(html, "connection-details-revoked")).toContain(
			`dateTime="${revoked.revokedAt}"`,
		);
		expect(visibleText(html)).toContain(
			"It is not active, so any use of it is refused.",
		);
	});

	it("names AVEL's own work for a connection with no engagement", async () => {
		const html = await renderSeeded(
			`${PATH}?connection=${own.id}`,
			seededClient({ connections: CONNECTIONS }),
		);
		expect(visibleText(html)).toContain(
			"AVEL's own work".replaceAll("'", "&#x27;"),
		);
		expect(visibleText(html)).toContain(
			"AVEL&#x27;s internal missions read and deliver through it.",
		);
	});

	it("reads alone when deep-linked with no list: loading, then its own answer", async () => {
		const other = connection(9, { label: "Deep linked" });
		const loading = await renderSeeded(
			`${PATH}?connection=${other.id}`,
			seededClient({ connections: CONNECTIONS }),
		);
		expect(tagOf(loading, "connection-details-body")).toContain(
			'data-state="loading"',
		);
		expect(loading).toContain('data-testid="connection-details-skeleton"');

		const qc = seededClient({ connections: CONNECTIONS });
		qc.setQueryData(queryKeys.connections.detail(other.id), other);
		const html = await renderSeeded(`${PATH}?connection=${other.id}`, qc);
		expect(tagOf(html, "connection-details-title")).toBeDefined();
		expect(visibleText(html)).toContain("Deep linked");
	});

	it("shows the error state for a connection that is gone", async () => {
		const gone = connection(8);
		const qc = seededClient({ connections: CONNECTIONS });
		qc.getQueryCache()
			.build(qc, { queryKey: queryKeys.connections.detail(gone.id) })
			.setState({
				status: "error",
				fetchStatus: "idle",
				error: notFoundError(`/api/connections/${gone.id}`),
			});
		const html = await renderSeeded(`${PATH}?connection=${gone.id}`, qc);
		expect(tagOf(html, "connection-details-body")).toContain(
			'data-state="error"',
		);
		expect(html).toContain('data-testid="surface-error"');
	});

	it("is closed without the param, and a bad id is dropped", async () => {
		const closed = await renderSeeded(
			PATH,
			seededClient({ connections: CONNECTIONS }),
		);
		expect(closed).not.toContain('data-testid="connection-details"');
		const bad = await renderSeeded(
			`${PATH}?connection=not-a-uuid`,
			seededClient({ connections: CONNECTIONS }),
		);
		expect(bad).not.toContain('data-testid="connection-details"');
	});
});

describe("what opens it", () => {
	it("each card's name is a button that opens its details", async () => {
		const html = await renderSeeded(
			PATH,
			seededClient({ connections: CONNECTIONS }),
		);
		for (const c of CONNECTIONS) {
			const open = tagOf(html, `connection-open-${c.id}`);
			expect(open).toContain('type="button"');
			expect(open).toContain('aria-haspopup="dialog"');
		}
	});

	it("each table row opens it, by pointer and by keyboard", async () => {
		const html = await renderSeeded(
			`${PATH}?view=table`,
			seededClient({ connections: CONNECTIONS }),
		);
		for (const c of CONNECTIONS) {
			expect(tagOf(html, `connection-table-row-${c.id}`)).toContain(
				'tabindex="0"',
			);
		}
	});
});
