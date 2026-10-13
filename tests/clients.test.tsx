import { isRedirect } from "@tanstack/react-router";
import type { Client, Engagement } from "avel-server/contract";
import { describe, expect, it } from "vitest";
import { CARD_ENGAGEMENTS } from "@/components/avel/client-board";
import {
	byStatus,
	clientFacts,
	clientInitials,
	engagementMeter,
	METER_SEGMENTS,
	type Page,
} from "@/lib/api/clients";
import { clientsSearch, Route } from "../src/routes/clients";
import {
	type ClientsSeed,
	client,
	engagement,
	renderClientsRoute,
} from "./clients-fixtures";
import { renderPage, tagOf } from "./render-page";

const render = () => renderPage("/clients");

const seeded = async (
	page: Page<Client>,
	{
		path = "/clients",
		q,
		...rest
	}: { path?: string; q?: string } & Omit<ClientsSeed, "list"> = {},
) => renderClientsRoute(path, { list: { page, q }, ...rest });

describe("the Clients page", () => {
	it("is a construction route, so a phone sees the device boundary", () => {
		expect(Route.options.staticData?.device).toBe("construction");
	});

	it("is titled from the sidebar", async () => {
		expect(await render()).toContain("<title>Clients · AVEL</title>");
	});

	it("prints no heading of its own beyond the top bar's", async () => {
		expect((await render()).match(/<h1[\s>]/g)).toHaveLength(1);
	});

	it("offers New client, enabled now that the contract can create one", async () => {
		const html = await render();
		const button = tagOf(html, "clients-new");
		expect(button).not.toMatch(/\sdisabled=""/);
		expect(button).toContain('data-size="sm"');
	});

	it("loads the real board: three cards in the card's shape, never the not-built state", async () => {
		const html = await render();
		expect(tagOf(html, "client-board")).toContain('data-state="loading"');
		// Few cards: with only a handful of clients, a long skeleton would lie.
		expect(
			html.match(/data-testid="client-board-skeleton-card"/g),
		).toHaveLength(3);
		expect(html).not.toContain('data-state="not-built"');
	});

	it("keeps the definition as the subtitle until a count is known", async () => {
		const html = await render();
		expect(html).toContain('data-testid="topbar-definition"');
		expect(html).not.toContain('data-testid="topbar-subtitle"');
	});
});

describe("the Clients page's count", () => {
	it("shows the list's exact total from the first page, in tabular numerals", async () => {
		// One row loaded, 120 in the list: the count is the total, not the rows.
		const html = await seeded({
			data: [client(1)],
			meta: { nextCursor: "c1", total: 120 },
		});
		const subtitle = html.match(
			/<p[^>]*data-testid="topbar-subtitle"[^>]*>([^<]*)</,
		);
		expect(subtitle?.[1]).toBe("120 clients");
		expect(subtitle?.[0]).toMatch(/\btabular-nums\b/);
	});

	it("says 1 client in the singular", async () => {
		const html = await seeded({
			data: [client(1)],
			meta: { nextCursor: null, total: 1 },
		});
		expect(html).toMatch(/data-testid="topbar-subtitle"[^>]*>1 client</);
	});

	it("keeps the definition when the route gives no total, never counting rows", async () => {
		const html = await seeded({
			data: [client(1), client(2)],
			meta: { nextCursor: null },
		});
		expect(html).not.toContain('data-testid="topbar-subtitle"');
		expect(html).not.toContain(">2 clients<");
	});
});

describe("searching the Clients page", () => {
	it("lists the search's matches and counts them as matches", async () => {
		const html = await seeded(
			{
				data: [client(1), client(2), client(3)],
				meta: { nextCursor: null, total: 3 },
			},
			{ path: "/clients?q=acme", q: "acme" },
		);
		expect(html).toMatch(/data-testid="topbar-subtitle"[^>]*>3 clients match</);
		expect(tagOf(html, "clients-search")).toContain('value="acme"');
		expect(tagOf(html, "client-board")).toContain('data-state="success"');
	});

	it("says nothing matched, rather than offering a first client", async () => {
		const html = await seeded(
			{ data: [], meta: { nextCursor: null, total: 0 } },
			{ path: "/clients?q=zzz", q: "zzz" },
		);
		expect(html).toContain('data-testid="clients-no-match"');
		expect(html).toContain('data-testid="clients-clear-search"');
		expect(html).not.toContain("Add your first client");
	});

	it("labels its search field", async () => {
		const html = await seeded({
			data: [client(1)],
			meta: { nextCursor: null, total: 1 },
		});
		const input = tagOf(html, "clients-search");
		const id = input.match(/\sid="([^"]+)"/)?.[1];
		expect(html).toMatch(
			new RegExp(`<label[^>]*for="${id}"[^>]*>Search clients</label>`),
		);
		expect(input).toMatch(/maxlength="200"/i);
	});

	it("reads its URL strictly: q trimmed and capped, status and view only as known words", () => {
		expect(clientsSearch.parse({ q: "  acme  " }).q).toBe("acme");
		expect(clientsSearch.parse({ q: "   " }).q).toBeUndefined();
		expect(clientsSearch.parse({ q: "x".repeat(300) }).q).toHaveLength(200);
		expect(clientsSearch.parse({ status: "closed" }).status).toBe("closed");
		expect(clientsSearch.parse({ status: "gone" }).status).toBeUndefined();
		expect(clientsSearch.parse({ view: "table" }).view).toBe("table");
		expect(clientsSearch.parse({ view: "board" }).view).toBeUndefined();
		expect(clientsSearch.parse({ client: "not-an-id" }).client).toBeUndefined();
	});
});

describe("an old link to a client", () => {
	// beforeLoad, as the router calls it: on the server a redirect becomes a
	// 307 (checked live), in the browser a replace navigation.
	const beforeLoad = (search: Record<string, unknown>) =>
		(Route.options.beforeLoad as (ctx: { search: unknown }) => void)({
			search: clientsSearch.parse(search),
		});

	it("redirects to the client's page, replacing the old entry", () => {
		let thrown: unknown;
		try {
			beforeLoad({ client: client(1).id });
		} catch (error) {
			thrown = error;
		}
		expect(isRedirect(thrown)).toBe(true);
		const { options } = thrown as { options: Record<string, unknown> };
		expect(options.to).toBe("/clients/$id");
		expect(options.params).toEqual({ id: client(1).id });
		expect(options.replace).toBe(true);
	});

	it("leaves the board alone when it names no client, or no real id", () => {
		expect(() => beforeLoad({ q: "acme" })).not.toThrow();
		expect(() => beforeLoad({ client: "not-an-id" })).not.toThrow();
	});
});

const THREE: Page<Client> = {
	data: [
		client(1),
		client(2, {
			status: "closed",
			engagementCount: 1,
			activeEngagementCount: 0,
		}),
		client(3, {
			name: "Halvorsen & Pike",
			engagementCount: 0,
			activeEngagementCount: 0,
			primaryContact: null,
		}),
	],
	meta: { nextCursor: null, total: 3 },
};
const [ONE, TWO, THREE_C] = THREE.data as [Client, Client, Client];

/** The markup of one card, from its opening tag to its closing </article>. */
const cardOf = (html: string, c: Client) => {
	const start = html.lastIndexOf(
		"<article",
		html.indexOf(`data-testid="client-card-${c.id}"`),
	);
	return html.slice(start, html.indexOf("</article>", start));
};

/** The markup of one board section. */
const sectionOf = (html: string, status: string) => {
	const start = html.indexOf(`data-testid="client-section-${status}"`);
	return html.slice(start, html.indexOf("</section>", start));
};

describe("the client board", () => {
	it("puts Active first and Closed after, each counting its cards", async () => {
		const html = await seeded(THREE);
		const active = html.indexOf('data-testid="client-section-active"');
		const closed = html.indexOf('data-testid="client-section-closed"');
		expect(active).toBeGreaterThan(-1);
		expect(closed).toBeGreaterThan(active);
		expect(html).toMatch(/data-testid="client-section-active-count"[^>]*>2</);
		expect(html).toMatch(/data-testid="client-section-closed-count"[^>]*>1</);
		expect(sectionOf(html, "active")).toContain(`client-card-${ONE.id}`);
		expect(sectionOf(html, "active")).not.toContain(`client-card-${TWO.id}`);
		expect(sectionOf(html, "closed")).toContain(`client-card-${TWO.id}`);
	});

	it("draws no Closed section when nothing is closed", async () => {
		const html = await seeded({
			data: [ONE],
			meta: { nextCursor: null, total: 1 },
		});
		expect(html).not.toContain('data-testid="client-section-closed"');
	});

	it("makes each card's name a link to the client's page", async () => {
		const html = await seeded(THREE);
		expect(tagOf(html, `client-card-open-${ONE.id}`)).toContain(
			`href="/clients/${ONE.id}"`,
		);
	});

	it("heads each card with its tile, name, contact and status", async () => {
		const html = await seeded(THREE);
		const one = cardOf(html, ONE);
		expect(one).toContain(">Client 1<");
		expect(one).toContain(">contact1@example.com<");
		expect(tagOf(one, `client-status-${ONE.id}`)).toContain('data-tone="pass"');
		expect(tagOf(cardOf(html, TWO), `client-status-${TWO.id}`)).toContain(
			'data-tone="stale"',
		);
		expect(cardOf(html, THREE_C)).toContain(">No primary contact<");
		expect(cardOf(html, THREE_C)).toMatch(/data-testid="client-tile"[^>]*>HP</);
		expect(tagOf(cardOf(html, TWO), "client-tile")).toContain(
			'data-closed="true"',
		);
	});

	it("meters engagements from the row's own counts, active first", async () => {
		const html = await seeded(THREE);
		const one = cardOf(html, ONE);
		expect(one).toMatch(
			/data-testid="client-meter-label-[^"]+"[^>]*>3 engagements, 1 active</,
		);
		const segments = [...one.matchAll(/data-segment="(\w+)"/g)].map(
			(m) => m[1],
		);
		expect(segments).toEqual(["active", "closed", "closed"]);
		expect(cardOf(html, THREE_C)).not.toContain("data-segment=");
	});

	it("stacks the latest engagements, active first, and says how many more", async () => {
		const many = client(4, { engagementCount: 5, activeEngagementCount: 1 });
		const rows: Engagement[] = [
			engagement(1, many.id, { status: "closed", name: "Old work" }),
			engagement(2, many.id, { name: "Live work" }),
			engagement(3, many.id, { status: "closed" }),
			engagement(4, many.id, { status: "closed" }),
		];
		const html = await seeded(
			{ data: [many], meta: { nextCursor: null, total: 1 } },
			{ engagements: [{ clientId: many.id, rows }] },
		);
		const card = cardOf(html, many);
		const lines = [
			...card.matchAll(/data-testid="client-card-engagement-([^"]+)"/g),
		].map((m) => m[1]);
		expect(lines).toHaveLength(CARD_ENGAGEMENTS);
		expect(lines[0]).toBe(rows[1]?.id);
		expect(card).toMatch(
			/data-testid="client-card-more-[^"]+"[^>]*>and 2 more</,
		);
	});

	it("offers a first engagement on an active client with none, and not on a closed one", async () => {
		const closedEmpty = client(5, {
			status: "closed",
			engagementCount: 0,
			activeEngagementCount: 0,
		});
		const html = await seeded({
			data: [THREE_C, closedEmpty],
			meta: { nextCursor: null, total: 2 },
		});
		expect(cardOf(html, THREE_C)).toContain(
			`client-card-new-engagement-${THREE_C.id}`,
		);
		expect(cardOf(html, closedEmpty)).not.toContain(
			"client-card-new-engagement-",
		);
	});

	it("ends the Active section with a place for the next client", async () => {
		const html = await seeded(THREE);
		expect(sectionOf(html, "active")).toContain(
			'data-testid="client-card-new"',
		);
		expect(sectionOf(html, "closed")).not.toContain("client-card-new");
	});

	it("filters to one status, pressed in the filter", async () => {
		const html = await seeded(THREE, { path: "/clients?status=closed" });
		expect(html).not.toContain('data-testid="client-section-active"');
		expect(sectionOf(html, "closed")).toContain(`client-card-${TWO.id}`);
		expect(tagOf(html, "clients-status-closed")).toContain(
			'aria-pressed="true"',
		);
		expect(tagOf(html, "clients-status-all")).toContain('aria-pressed="false"');
	});

	it("says a filtered section is empty among those loaded when more remain", async () => {
		const html = await seeded(
			{ data: [ONE], meta: { nextCursor: "c1", total: 40 } },
			{ path: "/clients?status=closed" },
		);
		expect(html).toContain(
			"No closed clients among those loaded. Load more to look further.",
		);
	});

	it("says how many of how many are loaded, and offers more", async () => {
		const html = await seeded({
			data: THREE.data,
			meta: { nextCursor: "c1", total: 120 },
		});
		expect(html).toMatch(
			/data-testid="clients-showing"[^>]*>Showing 3 of 120</,
		);
		expect(html).toContain('data-testid="clients-load-more"');
		const all = await seeded(THREE);
		expect(all).not.toContain("clients-load-more");
	});

	it("lays its cards out in columns that shrink to the canvas", async () => {
		const html = await seeded(THREE);
		expect(tagOf(html, "client-cards-active")).toContain(
			"grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))]",
		);
	});

	it("shows onboarding on first run, instead of the board", async () => {
		const html = await seeded({
			data: [],
			meta: { nextCursor: null, total: 0 },
		});
		expect(html).toContain('data-testid="clients-empty"');
		expect(html).toContain("Add your first client");
		expect(html).not.toContain('data-testid="client-board"');
	});
});

describe("the Board | Table toggle (ruling 36)", () => {
	it("shows the board by default, Board pressed", async () => {
		const html = await seeded(THREE);
		expect(tagOf(html, "clients-view-board")).toContain('aria-pressed="true"');
		expect(html).toContain('data-testid="client-board"');
		expect(html).not.toContain('data-testid="client-table"');
	});

	it("shows the table under ?view=table, each row linking to the client's page", async () => {
		const html = await seeded(THREE, { path: "/clients?view=table" });
		expect(tagOf(html, "clients-view-table")).toContain('aria-pressed="true"');
		expect(html).not.toContain('data-testid="client-board"');
		expect(tagOf(html, "client-table")).toBeTruthy();
		expect(tagOf(html, `client-row-link-${ONE.id}`)).toContain(
			`href="/clients/${ONE.id}"`,
		);
		const row = html.slice(html.indexOf(`client-row-${ONE.id}`));
		expect(row.slice(0, row.indexOf("</tr>"))).toContain(
			">3 engagements, 1 active<",
		);
	});

	it("keeps the status filter in the table", async () => {
		const html = await seeded(THREE, {
			path: "/clients?view=table&status=active",
		});
		expect(html).toContain(`client-row-${ONE.id}`);
		expect(html).not.toContain(`client-row-${TWO.id}`);
	});
});

describe("the board's arithmetic", () => {
	it("splits by status, keeping the list's order", () => {
		const groups = byStatus(THREE.data);
		expect(groups.active.map((c) => c.id)).toEqual([ONE.id, THREE_C.id]);
		expect(groups.closed.map((c) => c.id)).toEqual([TWO.id]);
	});

	it("takes two initials from words that start with a letter or digit", () => {
		expect(clientInitials("Acme Corp")).toBe("AC");
		expect(clientInitials("Halvorsen & Pike")).toBe("HP");
		expect(clientInitials("Meridian")).toBe("ME");
		expect(clientInitials("  ")).toBe("");
	});

	it("caps the meter, active first, and counts what it leaves out", () => {
		expect(
			engagementMeter({ engagementCount: 3, activeEngagementCount: 1 }),
		).toEqual({ active: 1, closed: 2, more: 0 });
		expect(
			engagementMeter({ engagementCount: 20, activeEngagementCount: 4 }),
		).toEqual({
			active: 4,
			closed: METER_SEGMENTS - 4,
			more: 20 - METER_SEGMENTS,
		});
		expect(
			engagementMeter({ engagementCount: 0, activeEngagementCount: 0 }),
		).toEqual({ active: 0, closed: 0, more: 0 });
	});

	it("states the banner's facts in one line", () => {
		const now = Date.parse("2026-10-08T09:00:00.000Z");
		expect(clientFacts(ONE, now)).toBe(
			"Client since October 2026 · contact1@example.com · updated 3 days ago",
		);
		expect(clientFacts(THREE_C, now)).toContain("No primary contact");
	});
});
