import type { QueryClient } from "@tanstack/react-query";
import type { Connection } from "avel-server/contract";
import { describe, expect, it } from "vitest";
import { connectionDates } from "@/components/avel/connection-list";
import {
	CONNECTION_STATUS,
	CONNECTIONS_PAGE_SIZE,
	type ConnectionStatus,
} from "@/lib/api/connections";
import { queryKeys } from "@/lib/api/keys";
import {
	CONNECTIONS,
	connection,
	renderSeeded,
	seededClient,
} from "./catalog-fixtures";
import { tagOf } from "./render-page";

/*
 * /settings/connections as the connectors grid: one v3 card per connection,
 * the Connected / Revoked / All filter with exact counts, the expired banner,
 * the dashed New connection card, and the Board | Table toggle (ruling 36).
 */

const PATH = "/settings/connections";
const CLIENT_ID = "11111111-1111-4111-8111-111111111111";

/** The element from its opening tag to its matching close. */
function element(html: string, testid: string): string {
	const at = html.indexOf(`data-testid="${testid}"`);
	expect(at, testid).toBeGreaterThan(-1);
	const start = html.lastIndexOf("<", at);
	const tag = /^<([a-z0-9]+)/.exec(html.slice(start))?.[1] ?? "";
	const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, "g");
	re.lastIndex = start;
	let depth = 0;
	for (let m = re.exec(html); m; m = re.exec(html)) {
		depth += m[0].startsWith("</") ? -1 : 1;
		if (depth === 0) return html.slice(start, re.lastIndex);
	}
	throw new Error(`unclosed ${testid}`);
}

const text = (html: string) =>
	html
		.replace(/<[^>]+>/g, "")
		.replaceAll("&#x27;", "'")
		.replaceAll("&amp;", "&");

const countPage = (total: number) => ({
	data: [],
	meta: { nextCursor: null, total },
});

/** The page's seed: the list, each status's count, and each card's engagement. */
function seed({
	rows = CONNECTIONS,
	counts = { active: 4, revoked: 1, expired: 0 },
	byStatus,
}: {
	rows?: readonly Connection[];
	counts?: Partial<Record<ConnectionStatus, number>>;
	byStatus?: { status: ConnectionStatus; rows: Connection[] };
} = {}): QueryClient {
	const client = seededClient({ connections: [...rows] });
	for (const [status, total] of Object.entries(counts)) {
		if (total === undefined) continue;
		client.setQueryData(
			queryKeys.connections.statusCount(status),
			countPage(total),
		);
	}
	for (const c of rows) {
		if (c.engagementId === null) continue;
		client.setQueryData(
			[...queryKeys.engagements.all(), "detail", c.engagementId],
			{
				id: c.engagementId,
				clientId: CLIENT_ID,
				name: `Engagement for ${c.label}`,
			},
		);
	}
	if (byStatus) {
		client.setQueryData(
			queryKeys.connections.byStatus(CONNECTIONS_PAGE_SIZE, byStatus.status),
			{
				pages: [
					{
						data: byStatus.rows,
						meta: { nextCursor: null, total: byStatus.rows.length },
					},
				],
				pageParams: [undefined],
			},
		);
	}
	return client;
}

describe("the connectors grid", () => {
	it("is the default view: one card per connection, then the dashed New connection card", async () => {
		const html = await renderSeeded(PATH, seed());
		const board = element(html, "connection-board");
		expect(board.match(/data-testid="connection-card-/g)).toHaveLength(
			CONNECTIONS.length,
		);
		expect(html).not.toContain('data-testid="connection-table"');
		expect(tagOf(html, "connections-view-board")).toContain(
			'aria-pressed="true"',
		);
	});

	it("shows each card's service, scope, status and only the credential's name", async () => {
		const html = await renderSeeded(PATH, seed());
		for (const c of CONNECTIONS) {
			const card = element(html, `connection-card-${c.id}`);
			expect(card).toContain(`>${c.label}<`);
			expect(text(element(card, `connection-kind-${c.id}`))).toBe("GitHub");
			expect(text(element(card, `connection-scope-${c.id}`))).toBe(
				c.scopeValue,
			);
			expect(text(element(card, `connection-credential-${c.id}`))).toBe(
				c.credentialRef,
			);
			expect(tagOf(card, `connection-status-${c.id}`)).toContain(
				`data-tone="${CONNECTION_STATUS[c.status].tone}"`,
			);
			expect(text(element(card, `connection-status-${c.id}`))).toBe(
				CONNECTION_STATUS[c.status].label,
			);
		}
		// Nothing shaped like a token anywhere on the page.
		expect(html).not.toMatch(/\bgh[pousr]_[A-Za-z0-9]{8,}/);
	});

	it("links each card to its engagement's client, and names AVEL's own work", async () => {
		const own = connection(9, { engagementId: null, label: "AVEL internal" });
		const html = await renderSeeded(
			PATH,
			seed({ rows: [CONNECTIONS[0] as Connection, own] }),
		);
		const first = CONNECTIONS[0] as Connection;
		const link = tagOf(html, `connection-engagement-${first.id}`);
		expect(link).toContain(`href="/clients/${CLIENT_ID}"`);
		expect(text(element(html, `connection-engagement-${first.id}`))).toBe(
			`Engagement for ${first.label}`,
		);
		expect(text(element(html, `connection-engagement-${own.id}`))).toBe(
			"AVEL's own work",
		);
	});

	it("closes the grid with New connection, which opens the form", async () => {
		const html = await renderSeeded(PATH, seed());
		const card = tagOf(html, "connections-card-new");
		expect(card).not.toMatch(/\sdisabled=""/);
		expect(card).toContain('aria-haspopup="dialog"');
		expect(text(element(html, "connections-card-new"))).toContain(
			"New connection",
		);
	});

	it("dates each card in the order that matters: revoked, expiry, or the last update", () => {
		const now = Date.parse("2026-10-19T12:00:00.000Z");
		const base = {
			status: "active" as const,
			createdAt: "2026-10-12T12:00:00.000Z",
			updatedAt: "2026-10-12T12:00:00.000Z",
			expiresAt: null,
			revokedAt: null,
		};
		expect(connectionDates(base, now)).toBe("Created last week");
		expect(
			connectionDates(
				{ ...base, status: "revoked", revokedAt: "2026-10-18T12:00:00.000Z" },
				now,
			),
		).toBe("Created last week, revoked yesterday");
		expect(
			connectionDates(
				{ ...base, status: "expired", expiresAt: "2026-10-17T12:00:00.000Z" },
				now,
			),
		).toBe("Created last week, expired 2 days ago");
		expect(
			connectionDates({ ...base, expiresAt: "2026-10-22T12:00:00.000Z" }, now),
		).toBe("Created last week, expires in 3 days");
	});
});

describe("the status filter", () => {
	it("counts Connected and Revoked from their own meta.total, and All from the list's", async () => {
		const html = await renderSeeded(
			PATH,
			seed({ counts: { active: 4, revoked: 1 } }),
		);
		expect(text(element(html, "connections-filter-connected-count"))).toBe("4");
		expect(text(element(html, "connections-filter-revoked-count"))).toBe("1");
		expect(text(element(html, "connections-filter-all-count"))).toBe(
			String(CONNECTIONS.length),
		);
		expect(tagOf(html, "connections-filter-all")).toContain(
			'aria-pressed="true"',
		);
	});

	it("says a count is not known yet rather than inventing a zero", async () => {
		const html = await renderSeeded(
			PATH,
			seededClient({ connections: [...CONNECTIONS] }),
		);
		expect(element(html, "connections-filter-revoked-count")).toContain(
			"count not available",
		);
	});

	it("reads the revoked list when Revoked is chosen", async () => {
		const revoked = CONNECTIONS.filter((c) => c.status === "revoked");
		const html = await renderSeeded(
			`${PATH}?status=revoked`,
			seed({ byStatus: { status: "revoked", rows: [...revoked] } }),
		);
		expect(tagOf(html, "connections-filter-revoked")).toContain(
			'aria-pressed="true"',
		);
		const board = element(html, "connection-board");
		expect(board.match(/data-testid="connection-card-/g)).toHaveLength(
			revoked.length,
		);
	});
});

describe("the expired banner", () => {
	it("says how many expired and what that means, in the contract's terms", async () => {
		const html = await renderSeeded(PATH, seed({ counts: { expired: 2 } }));
		expect(text(element(html, "connections-expired-banner"))).toBe(
			"2 connections expired. Deliveries that use them will be refused.",
		);
		const one = await renderSeeded(PATH, seed({ counts: { expired: 1 } }));
		expect(text(element(one, "connections-expired-banner"))).toBe(
			"1 connection expired. Deliveries that use it will be refused.",
		);
		// Nothing waits on a connection: no runs or dispatches "waiting".
		expect(text(element(html, "connections-expired-banner"))).not.toMatch(
			/waiting|runs?\b/i,
		);
	});

	it("is absent when nothing has expired", async () => {
		expect(
			await renderSeeded(PATH, seed({ counts: { expired: 0 } })),
		).not.toContain("connections-expired-banner");
	});
});

describe("Board | Table", () => {
	it("keeps the table as the second view (ruling 36)", async () => {
		const html = await renderSeeded(`${PATH}?view=table`, seed());
		expect(html).toContain('data-testid="connection-table"');
		expect(html).not.toContain('data-testid="connection-board"');
		expect(tagOf(html, "connections-view-table")).toContain(
			'aria-pressed="true"',
		);
	});
});
