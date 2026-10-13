import type { Client } from "avel-server/contract";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { clientPageSearch, Route } from "../src/routes/clients_.$id";
import {
	activityEntry,
	type ClientsSeed,
	client,
	contractError,
	engagement,
	mission,
	renderClientsRoute,
} from "./clients-fixtures";
import { tagOf } from "./render-page";

/** The markup of one element by test id, to its first closing tag of that name. */
const blockOf = (html: string, testId: string, tag = "section") => {
	const start = html.lastIndexOf(
		`<${tag}`,
		html.indexOf(`data-testid="${testId}"`),
	);
	return html.slice(start, html.indexOf(`</${tag}>`, start));
};

/*
 * A client's own page, /clients/:id (ruling 45): the entity banner, then
 * Overview, Engagements, Drive and Activity. Everything but the Drive's
 * samples is live from the contract.
 */

const ONE = client(1, { notesMd: "First line\nSecond line" });
const CLOSED = client(2, {
	status: "closed",
	engagementCount: 1,
	activeEngagementCount: 0,
	primaryContact: null,
});
const LIVE = engagement(1, ONE.id, {
	name: "Booking app",
	scopeMd: "Rebuild the booking flow.",
});
const ENDED = engagement(2, ONE.id, {
	name: "Audit",
	status: "closed",
	closedAt: "2026-09-20T00:00:00.000Z",
});

const open = (c: Client, query = "", seed: Omit<ClientsSeed, "detail"> = {}) =>
	renderClientsRoute(`/clients/${c.id}${query}`, {
		detail: { id: c.id, value: c },
		engagements: [{ clientId: c.id, rows: [LIVE, ENDED] }],
		...seed,
	});

describe("the client page's route", () => {
	it("is a construction route with a crumb, so breadcrumbs can label it", () => {
		expect(Route.options.staticData?.device).toBe("construction");
		const crumb = Route.options.staticData?.crumb;
		expect(typeof crumb === "function" ? crumb({ id: ONE.id }) : crumb).toBe(
			ONE.id.slice(0, 8),
		);
	});

	it("reads its tab and Active only from the URL, ignoring anything else", () => {
		expect(clientPageSearch.parse({ tab: "activity" }).tab).toBe("activity");
		expect(clientPageSearch.parse({ tab: "files" }).tab).toBeUndefined();
		expect(clientPageSearch.parse({ active: true }).active).toBe(true);
		expect(clientPageSearch.parse({ active: "yes" }).active).toBeUndefined();
	});

	it("titles the top bar with the client's name, once", async () => {
		const html = await open(ONE);
		expect(html).toMatch(/<h1[^>]*>Client 1<\/h1>/);
		expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
		// The banner repeats it large, hidden from screen readers.
		expect(tagOf(html, "client-banner-name")).toContain('aria-hidden="true"');
	});
});

describe("the client's banner", () => {
	it("leads back to All clients", async () => {
		const html = await open(ONE);
		const back = tagOf(html, "client-banner-back");
		expect(back).toContain('href="/clients"');
		expect(html).toMatch(
			/data-testid="client-banner-back"[^>]*>.*All clients</s,
		);
	});

	it("shows its state, lit only while active", async () => {
		const active = tagOf(await open(ONE), "client-banner-status");
		expect(active).toContain('data-live="true"');
		const closed = tagOf(await open(CLOSED), "client-banner-status");
		expect(closed).not.toContain("data-live");
		expect(await open(CLOSED)).toMatch(
			/data-testid="client-banner-status"[^>]*>.*Closed</s,
		);
	});

	it("states its facts in one line", async () => {
		const html = await open(ONE);
		expect(html).toMatch(
			/data-testid="client-banner-facts"[^>]*>Client since October 2026 · contact1@example.com · last activity /,
		);
	});

	it("counts engagements from the client's own row: all, active and closed", async () => {
		const html = await open(ONE);
		const stat = (id: string) =>
			html.match(
				new RegExp(`data-testid="client-stat-${id}".*?<dd[^>]*>(\\d+)<`, "s"),
			)?.[1];
		expect(stat("engagements")).toBe("3");
		expect(stat("active")).toBe("1");
		expect(stat("closed")).toBe("2");
	});

	it("ends its facts with no activity yet when the log has nothing on it", async () => {
		const quiet = client(3, { lastActivityAt: null });
		const html = await open(quiet);
		expect(html).toMatch(
			/data-testid="client-banner-facts"[^>]*>[^<]*· no activity yet</,
		);
	});

	it("counts its missions from the missions read's meta.total, a dash until then", async () => {
		const stat = (html: string) =>
			html.match(
				/data-testid="client-stat-missions".*?<dd[^>]*>([^<]+)</s,
			)?.[1];
		const html = await open(ONE, "", {
			missions: [
				{
					clientId: ONE.id,
					rows: [mission(1, ONE)],
					total: 12,
					nextCursor: "m2",
				},
			],
		});
		expect(stat(html)).toBe("12");
		expect(html).toMatch(/data-testid="client-stat-missions".*?>missions</s);
		expect(stat(await open(ONE))).toBe("—");
	});

	it("acts with real buttons: New engagement, Edit and Close client", async () => {
		const html = await open(ONE);
		for (const id of ["client-new-engagement", "client-edit", "client-close"]) {
			expect(tagOf(html, id)).not.toMatch(/\sdisabled=""/);
		}
		expect(html).not.toContain('data-testid="client-reopen"');
	});

	it("on a closed client, offers Reopen and holds New engagement with its reason", async () => {
		const html = await open(CLOSED);
		expect(html).toContain('data-testid="client-reopen"');
		expect(html).not.toContain('data-testid="client-close"');
		expect(tagOf(html, "client-new-engagement")).toMatch(/\sdisabled=""/);
		expect(html).toContain("Reopen the client to add an engagement.");
	});
});

describe("the client's tabs", () => {
	it("opens on Overview, with a count only on Engagements", async () => {
		const html = await open(ONE);
		expect(tagOf(html, "client-banner-tab-overview")).toContain(
			'data-state="active"',
		);
		expect(html).toMatch(
			/data-testid="client-banner-tab-engagements-count"[^>]*>3</,
		);
		for (const tab of ["overview", "drive", "activity"]) {
			expect(html).not.toContain(`client-banner-tab-${tab}-count`);
		}
	});

	it("opens the tab the URL names", async () => {
		const html = await open(ONE, "?tab=drive");
		expect(tagOf(html, "client-banner-tab-drive")).toContain(
			'data-state="active"',
		);
		expect(html).toContain('data-testid="client-files-drive"');
		expect(html).not.toContain('data-testid="engagement-board"');
	});
});

describe("the Overview", () => {
	it("lays engagements out in two lanes, counted from the client's row", async () => {
		const html = await open(ONE);
		const lane = (status: string) => {
			const start = html.indexOf(`data-testid="engagement-lane-${status}"`);
			return html.slice(start, html.indexOf("</section>", start));
		};
		expect(lane("active")).toContain(`engagement-card-${LIVE.id}`);
		expect(lane("active")).not.toContain(`engagement-card-${ENDED.id}`);
		expect(lane("closed")).toContain(`engagement-card-${ENDED.id}`);
		expect(html).toMatch(/data-testid="engagement-lane-active-count"[^>]*>1</);
		expect(html).toMatch(/data-testid="engagement-lane-closed-count"[^>]*>2</);
	});

	it("shows each engagement's scope, start, and close once closed", async () => {
		const html = await open(ONE);
		expect(html).toMatch(
			new RegExp(
				`data-testid="engagement-card-scope-${LIVE.id}"[^>]*>Rebuild the booking flow.<`,
			),
		);
		expect(html).toMatch(
			new RegExp(
				`data-testid="engagement-card-scope-${ENDED.id}"[^>]*>No scope written.<`,
			),
		);
		expect(html).toContain(`data-testid="engagement-card-closed-${ENDED.id}"`);
		expect(html).not.toContain(`engagement-card-closed-${LIVE.id}`);
		// A closed engagement has nothing left to do, so it carries no menu.
		expect(html).toContain(`engagement-card-menu-${LIVE.id}`);
		expect(html).not.toContain(`engagement-card-menu-${ENDED.id}`);
	});

	it("shows the client's own fields, notes keeping their line breaks", async () => {
		const html = await open(ONE);
		expect(tagOf(html, "client-detail-notes")).toMatch(
			/\bwhitespace-pre-line\b/,
		);
		expect(html).toMatch(
			/data-testid="client-detail-notes"[^>]*>First line\nSecond line</,
		);
		const none = await open(CLOSED);
		expect(none).toMatch(/data-testid="client-detail-contact"[^>]*>None set</);
		expect(none).toMatch(/data-testid="client-detail-notes"[^>]*>None set\.</);
	});

	it("lists the client's missions, each linking to its page with type, sprint and status", async () => {
		const live = mission(2, ONE, { status: "active" });
		const halted = mission(1, ONE, { status: "halted", type: "audit" });
		const html = await open(ONE, "", {
			missions: [{ clientId: ONE.id, rows: [live, halted] }],
		});
		expect(tagOf(html, "client-missions")).toContain('data-state="success"');
		expect(html).not.toContain('data-state="not-built"');
		const order = [
			...html.matchAll(/data-testid="client-mission-([0-9a-f-]{36})"/g),
		].map((m) => m[1]);
		expect(order).toEqual([live.id, halted.id]);
		expect(tagOf(html, `client-mission-${live.id}`)).toContain(
			`href="/missions/${live.id}"`,
		);
		expect(html).toMatch(
			new RegExp(`data-testid="client-mission-type-${halted.id}"[^>]*>audit<`),
		);
		expect(blockOf(html, `client-mission-${halted.id}`, "a")).toContain(
			"Sprint 1",
		);
		expect(tagOf(html, `client-mission-status-${halted.id}`)).toContain(
			'data-tone="block"',
		);
	});

	it("strips the missions by status from meta.counts, archived only when counted", async () => {
		const rows = [
			mission(1, ONE, { status: "active" }),
			mission(2, ONE, { status: "active" }),
			mission(3, ONE, { status: "shipped" }),
		];
		const html = await open(ONE, "", {
			missions: [{ clientId: ONE.id, rows }],
		});
		const count = (status: string) =>
			tagOf(html, `client-missions-strip-${status}`).match(
				/data-count="(\d+)"/,
			)?.[1];
		expect(count("active")).toBe("2");
		expect(count("shipped")).toBe("1");
		expect(count("draft")).toBe("0");
		expect(html).not.toContain("client-missions-strip-archived");
	});

	it("offers more of the client's missions when the server has more", async () => {
		const html = await open(ONE, "", {
			missions: [
				{
					clientId: ONE.id,
					rows: [mission(1, ONE)],
					total: 30,
					nextCursor: "m2",
				},
			],
		});
		expect(html).toMatch(
			/data-testid="client-missions-showing"[^>]*>Showing 1 of 30</,
		);
		expect(html).toContain('data-testid="client-missions-load-more"');
	});

	it("says when the client has no missions yet", async () => {
		const html = await open(ONE, "", {
			missions: [{ clientId: ONE.id, rows: [] }],
		});
		expect(html).toContain('data-testid="client-missions-empty"');
	});
});

describe("the Engagements tab", () => {
	it("lists every engagement, Active only off", async () => {
		const html = await open(ONE, "?tab=engagements");
		expect(tagOf(html, "client-active-only")).toContain('aria-pressed="false"');
		expect(html).toContain(`data-testid="engagement-${LIVE.id}"`);
		expect(html).toContain(`data-testid="engagement-${ENDED.id}"`);
	});

	it("lists only the active ones under ?active=true, from their own query", async () => {
		const html = await open(ONE, "?tab=engagements&active=true", {
			engagements: [{ clientId: ONE.id, rows: [LIVE], status: "active" }],
		});
		expect(tagOf(html, "client-active-only")).toContain('aria-pressed="true"');
		expect(html).toContain(`data-testid="engagements-filter-${ONE.id}"`);
		expect(html).toContain(`data-testid="engagement-${LIVE.id}"`);
		expect(html).not.toContain(`data-testid="engagement-${ENDED.id}"`);
	});
});

describe("the Activity tab", () => {
	it("shows the client's one activity read in the server's order, naming engagements and missions", async () => {
		const run = mission(1, ONE, { type: "template-booking", sprintN: 2 });
		const newer = activityEntry(3, "engagement", LIVE.id);
		const onMission = activityEntry(2, "mission", run.id);
		const older = activityEntry(1, "client", ONE.id);
		const html = await open(ONE, "?tab=activity", {
			clientActivity: { clientId: ONE.id, rows: [newer, onMission, older] },
			missions: [{ clientId: ONE.id, rows: [run] }],
		});
		const order = [
			...html.matchAll(/data-testid="client-activity-row-([^"]+)"/g),
		].map((m) => m[1]);
		expect(order).toEqual([newer.id, onMission.id, older.id]);
		expect(html).toMatch(
			new RegExp(
				`data-testid="client-activity-subject-${newer.id}"[^>]*>: Booking app<`,
			),
		);
		expect(html).toMatch(
			new RegExp(
				`data-testid="client-activity-subject-${onMission.id}"[^>]*>: template-booking, sprint 2<`,
			),
		);
		expect(tagOf(html, `client-activity-open-${older.id}`)).toContain(
			`href="/activity?entry=${older.id}"`,
		);
	});

	it("offers Load more while the server has more, saying how many of the total", async () => {
		const html = await open(ONE, "?tab=activity", {
			clientActivity: {
				clientId: ONE.id,
				rows: [activityEntry(1, "client", ONE.id)],
				nextCursor: "a2",
				total: 41,
			},
		});
		expect(html).toMatch(
			/data-testid="client-activity-showing"[^>]*>Showing 1 of 41</,
		);
		expect(html).toContain('data-testid="client-activity-load-more"');
	});

	it("says nothing is logged yet when the log has nothing", async () => {
		const html = await open(ONE, "?tab=activity", {
			clientActivity: { clientId: ONE.id, rows: [] },
		});
		expect(html).toContain('data-testid="client-activity-empty"');
		expect(html).not.toContain("client-activity-load-more");
	});

	it("loads in the timeline's shape until its one read arrives", async () => {
		const html = await open(ONE, "?tab=activity");
		expect(html).toContain('data-testid="client-activity-skeleton"');
	});
});

describe("a client that cannot be shown", () => {
	it("loads in the banner's shape", async () => {
		const html = await renderClientsRoute(`/clients/${ONE.id}`);
		expect(html).toContain('data-testid="client-detail-skeleton"');
	});

	it("that is gone says so, with the way back", async () => {
		const html = await renderClientsRoute(`/clients/${ONE.id}`, {
			detail: { id: ONE.id, value: contractError(404, "NOT_FOUND") },
		});
		expect(html).toContain('data-testid="client-not-found"');
		expect(tagOf(html, "client-back")).toContain('href="/clients"');
		expect(html).not.toContain('data-testid="client-banner"');
	});

	it("that failed otherwise shows the error map's copy", async () => {
		const failed = new ApiError({
			method: "GET",
			path: "/api/clients/x",
			kind: "unreachable",
		} as ConstructorParameters<typeof ApiError>[0]);
		const html = await renderClientsRoute(`/clients/${ONE.id}`, {
			detail: { id: ONE.id, value: failed },
		});
		expect(html).toContain('data-testid="client-detail-error"');
		expect(html).not.toContain('data-testid="client-not-found"');
	});
});
