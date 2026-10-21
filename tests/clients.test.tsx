import { isRedirect } from "@tanstack/react-router";
import type { Client, Engagement } from "avel-server/contract";
import { describe, expect, it } from "vitest";
import { CARD_ENGAGEMENTS } from "@/components/avel/client-board";
import {
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
	mission,
	renderClientsRoute,
} from "./clients-fixtures";
import { renderPage, tagOf } from "./render-page";

const render = () => renderPage("/clients");

/**
 * A page of clients as the board reads it: one list per status, filtered on
 * the server. Active takes the active rows, the cursor and whatever the
 * total holds beyond the closed rows, so the two totals sum to the page's.
 * The page itself is the table's unfiltered list.
 */
function bySection(page: Page<Client>, q?: string) {
	const closed = page.data.filter((c) => c.status === "closed");
	const total = page.meta.total;
	return [
		{
			status: "active" as const,
			q,
			page: {
				data: page.data.filter((c) => c.status === "active"),
				meta: {
					nextCursor: page.meta.nextCursor,
					...(total === undefined ? {} : { total: total - closed.length }),
				},
			},
		},
		{
			status: "closed" as const,
			q,
			page: {
				data: closed,
				meta: {
					nextCursor: null,
					...(total === undefined ? {} : { total: closed.length }),
				},
			},
		},
	];
}

const seeded = async (
	page: Page<Client>,
	{
		path = "/clients",
		q,
		...rest
	}: { path?: string; q?: string } & Omit<ClientsSeed, "list"> = {},
) =>
	renderClientsRoute(path, {
		list: { page, q },
		...rest,
		lists: [...bySection(page, q), ...(rest.lists ?? [])],
	});

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
	it("counts each section from its own list's meta.total, not the cards loaded", async () => {
		const html = await renderClientsRoute("/clients", {
			lists: [
				{
					status: "active",
					page: { data: [ONE], meta: { nextCursor: "a2", total: 40 } },
				},
				{
					status: "closed",
					page: { data: [TWO], meta: { nextCursor: null, total: 7 } },
				},
			],
		});
		expect(html).toMatch(/data-testid="client-section-active-count"[^>]*>40</);
		expect(html).toMatch(/data-testid="client-section-closed-count"[^>]*>7</);
		expect(html).toMatch(/data-testid="topbar-subtitle"[^>]*>47 clients</);
	});

	it("waits for both sections' lists, so one never shows under the other's skeleton", async () => {
		const html = await renderClientsRoute("/clients", {
			lists: [
				{
					status: "active",
					page: { data: [ONE], meta: { nextCursor: null, total: 1 } },
				},
			],
		});
		expect(tagOf(html, "client-board")).toContain('data-state="loading"');
	});

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
		// No contact, no line: the same filler on every card said nothing.
		expect(cardOf(html, THREE_C)).not.toContain("No primary contact");
		expect(cardOf(html, THREE_C)).not.toContain(
			`client-card-contact-${THREE_C.id}`,
		);
		expect(tagOf(one, `client-card-contact-${ONE.id}`)).toBeTruthy();
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

	it("filters to one status, pressed in the filter, reading only that list", async () => {
		// Only Closed is seeded: Active is not read, or the board would wait.
		const html = await renderClientsRoute("/clients?status=closed", {
			lists: [bySection(THREE)[1] as NonNullable<ClientsSeed["lists"]>[number]],
		});
		expect(html).not.toContain('data-testid="client-section-active"');
		expect(sectionOf(html, "closed")).toContain(`client-card-${TWO.id}`);
		expect(tagOf(html, "clients-status-closed")).toContain(
			'aria-pressed="true"',
		);
		expect(tagOf(html, "clients-status-all")).toContain('aria-pressed="false"');
	});

	it("says plainly when the server has no closed client", async () => {
		const html = await renderClientsRoute("/clients?status=closed", {
			lists: [
				{
					status: "closed",
					page: { data: [], meta: { nextCursor: null, total: 0 } },
				},
			],
		});
		expect(html).toMatch(
			/data-testid="client-section-closed-none"[^>]*>No closed clients\.</,
		);
		expect(html).not.toContain("among those loaded");
		expect(tagOf(html, "client-section-closed-count")).toBeTruthy();
		expect(html).toMatch(/data-testid="client-section-closed-count"[^>]*>0</);
	});

	it("says how many of a section's total are loaded, and offers more of that section", async () => {
		const html = await seeded({
			data: THREE.data,
			meta: { nextCursor: "c1", total: 120 },
		});
		expect(html).toMatch(
			/data-testid="client-section-active-showing"[^>]*>Showing 2 of 119</,
		);
		expect(html).toContain('data-testid="client-section-active-load-more"');
		expect(html).not.toContain("client-section-closed-load-more");
		const all = await seeded(THREE);
		expect(all).not.toContain("load-more");
	});

	it("tells when each client last saw activity, or that it has none", async () => {
		const quiet = client(6, { lastActivityAt: null });
		const html = await seeded({
			data: [ONE, quiet],
			meta: { nextCursor: null, total: 2 },
		});
		const one = cardOf(html, ONE);
		expect(one).toMatch(
			new RegExp(
				`data-testid="client-card-activity-${ONE.id}"[^>]*>Last activity(<!-- -->)? <time[^>]*dateTime="${ONE.lastActivityAt}"`,
			),
		);
		expect(cardOf(html, quiet)).toMatch(
			new RegExp(
				`data-testid="client-card-activity-${quiet.id}"[^>]*>No activity yet<`,
			),
		);
		expect(html).not.toContain("client-card-updated-");
	});

	it("counts each client's missions from a one-row read of its missions", async () => {
		const html = await seeded(
			{ data: [ONE, THREE_C], meta: { nextCursor: null, total: 2 } },
			{
				missions: [
					{
						clientId: ONE.id,
						limit: 1,
						rows: [mission(1, ONE)],
						total: 4,
						nextCursor: "m2",
					},
				],
			},
		);
		expect(cardOf(html, ONE)).toMatch(
			new RegExp(
				`data-testid="client-card-missions-${ONE.id}"[^>]*>4 missions<`,
			),
		);
		// Not read yet: a dash, never a zero it cannot vouch for.
		const pending = tagOf(
			cardOf(html, THREE_C),
			`client-card-missions-${THREE_C.id}`,
		);
		expect(pending).toContain('data-state="pending"');
		expect(cardOf(html, THREE_C)).not.toContain(">0 missions<");
	});

	it("lays its cards out in columns that shrink to the canvas", async () => {
		const html = await seeded(THREE);
		expect(tagOf(html, "client-cards-active")).toContain(
			"grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))]",
		);
	});

	it("shows no first-run onboarding under a status that keeps none", async () => {
		const html = await renderClientsRoute("/clients?status=active", {
			lists: [
				{
					status: "active",
					page: { data: [], meta: { nextCursor: null, total: 0 } },
				},
			],
		});
		expect(html).not.toContain('data-testid="clients-empty"');
		expect(html).toContain('data-testid="client-card-new"');
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
		// The whole row opens the client: the row that reacts to hover is the
		// link, stretched over it (v3 UX 5).
		expect(tagOf(html, `client-row-${ONE.id}`)).toContain("relative");
		expect(tagOf(html, `client-row-link-${ONE.id}`)).toContain(
			"after:absolute after:inset-0",
		);
		const row = html.slice(html.indexOf(`client-row-${ONE.id}`));
		expect(row.slice(0, row.indexOf("</tr>"))).toContain(
			">3 engagements, 1 active<",
		);
		// A row with a contact names it under the name; one without shows nothing.
		expect(tagOf(html, `client-row-contact-${ONE.id}`)).toBeTruthy();
		expect(html).not.toContain(`client-row-contact-${THREE_C.id}`);
		expect(html).not.toContain("No primary contact");
	});

	it("reads the table's status from the server's filtered list", async () => {
		// Only the unfiltered list holds TWO; the table must read Active's.
		const html = await seeded(THREE, {
			path: "/clients?view=table&status=active",
		});
		expect(html).toContain(`client-row-${ONE.id}`);
		expect(html).not.toContain(`client-row-${TWO.id}`);
		expect(html).not.toContain("among those loaded");
	});

	it("shows each row's last activity, or none", async () => {
		const quiet = client(6, { lastActivityAt: null });
		const html = await seeded(
			{ data: [ONE, quiet], meta: { nextCursor: null, total: 2 } },
			{ path: "/clients?view=table" },
		);
		expect(html).toContain(">Last activity<");
		expect(tagOf(html, `client-row-activity-${ONE.id}`)).toBeTruthy();
		expect(html).toMatch(
			new RegExp(
				`data-testid="client-row-activity-${quiet.id}"[^>]*>No activity yet<`,
			),
		);
	});

	it("says a status with no client is empty, not a search that matched none", async () => {
		const html = await renderClientsRoute("/clients?view=table&status=closed", {
			lists: [
				{
					status: "closed",
					page: { data: [], meta: { nextCursor: null, total: 0 } },
				},
			],
		});
		expect(html).toContain('data-testid="clients-none-with-status"');
		expect(html).not.toContain('data-testid="clients-no-match"');
	});
});

describe("the board's arithmetic", () => {
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
			"Client since October 2026 · contact1@example.com · last activity yesterday",
		);
		expect(clientFacts(THREE_C, now)).toContain("No primary contact");
	});
});
