import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import {
	type Dispatch,
	dispatch as dispatchSchema,
	MISSION_STATUSES,
	type MissionListItem,
	type MissionStatus,
	missionListItem,
	missionStatusCounts,
} from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MissionListParams } from "@/components/avel/mission-data";
import {
	activeSubline,
	missionShortLabel,
	NEEDS_YOU_DETAIL,
	needsYouLine,
	needsYouSubline,
	newestOf,
	nextStatus,
} from "@/components/avel/missions-dashboard";
import { ApiOverrideProvider } from "@/lib/api";
import { ACTIVITY_PAGE_SIZE } from "@/lib/api/activity";
import { queryKeys } from "@/lib/api/keys";
import { SessionSourceProvider } from "@/lib/auth";
import { routeTree } from "@/routeTree.gen";
import { signedIn } from "./auth-session";
import { tagOf } from "./render-page";
import { visibleText } from "./visible-text";

// The /missions dashboard (MISSIONS-DASHBOARD.md), rendered through the real
// router with a seeded cache, as missions.test.tsx renders the list.

const id = (n: number) =>
	`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function mission(
	n: number,
	status: MissionStatus,
	extra: Partial<MissionListItem> = {},
): MissionListItem {
	return missionListItem.parse({
		gateRunning: false,
		id: id(n),
		origin: "client",
		type: "template-booking",
		sprintN: n,
		status,
		cut: "vertical",
		cutSource: "derived",
		client: { id: id(900 + n), name: `Client ${n}` },
		engagement: { id: id(800 + n), name: `Engagement ${n}` },
		lastExport: null,
		lastActivityAt: "2026-10-06T09:00:00.000Z",
		needsYou: null,
		createdAt: "2026-10-01T00:00:00.000Z",
		updatedAt: "2026-10-05T00:00:00.000Z",
		...extra,
	});
}

function dispatch(
	n: number,
	missionId: string,
	status: Dispatch["status"],
	extra: Partial<Dispatch> = {},
): Dispatch {
	return dispatchSchema.parse({
		id: id(300 + n),
		missionId,
		rosterEntryId: id(400 + n),
		agent: {
			templateId: id(600 + n),
			slug: `agent-${n}`,
			name: `Agent ${n}`,
			title: "Builder",
		},
		territory: null,
		briefRef: null,
		status,
		haltReason: status === "halted" ? "operator" : null,
		estimatedTokens: 40_000,
		tokenSoftCeiling: 60_000,
		tokenHardCeiling: 120_000,
		softCeilingCrossed: false,
		tokensUsed: status === "queued" ? 0 : 12_000,
		tokensIn: 0,
		tokensOut: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		spendUsd: status === "queued" ? 0 : 0.0421,
		wallClockMinutes: 240,
		agentVersionSha256: null,
		agentVersionRef: null,
		skillsSha256: null,
		briefSha256: null,
		model: null,
		harnessVersion: null,
		reportId: null,
		wave: "A",
		startCommitSha: null,
		startDispatchIds: null,
		startedAt: status === "queued" ? null : "2026-10-06T10:00:00.000Z",
		closedAt:
			status === "complete" || status === "halted"
				? "2026-10-06T11:00:00.000Z"
				: null,
		createdAt: `2026-10-06T0${n}:00:00.000Z`,
		updatedAt: "2026-10-06T10:00:00.000Z",
		...extra,
	});
}

const PREVIEW = mission(1, "active", {
	needsYou: { reason: "export_previewed" },
	lastExport: {
		id: id(501),
		status: "previewed",
		targetKind: "github_pr",
		createdAt: "2026-10-06T08:00:00.000Z",
		statusChangedAt: "2026-10-06T10:00:00.000Z",
	},
});
const PR = mission(2, "shipped", {
	needsYou: { reason: "pr_open" },
	lastExport: {
		id: id(502),
		status: "pr-open",
		targetKind: "github_pr",
		createdAt: "2026-10-06T08:00:00.000Z",
		statusChangedAt: "2026-10-06T10:00:00.000Z",
	},
});
const BUSY = mission(3, "active");
const HALTED = mission(4, "halted");
const ROWS = [PREVIEW, PR, BUSY, HALTED];

const COUNTS = {
	byStatus: missionStatusCounts.parse({
		draft: 0,
		active: 2,
		halted: 1,
		shipped: 1,
		archived: 0,
	}),
	needsYou: 2,
};

const RUNNING = dispatch(1, BUSY.id, "running");
const QUEUED = dispatch(2, PREVIEW.id, "queued");
const DONE = dispatch(3, BUSY.id, "complete");

const base = (over: Partial<MissionListParams> = {}): MissionListParams => ({
	origin: "client",
	q: "",
	sort: "lastActivity",
	includeArchived: false,
	...over,
});

const page = (rows: MissionListItem[], total = rows.length) => ({
	pages: [{ data: rows, meta: { nextCursor: null, counts: COUNTS, total } }],
	pageParams: [undefined],
});

type Seed = (client: QueryClient) => void;

const seeded =
	(dispatches: Record<string, Dispatch[]> = {}): Seed =>
	(client) => {
		client.setQueryData(queryKeys.missions.list(base()).slice(), page(ROWS));
		client.setQueryData(
			queryKeys.missions.list(base({ needsYou: true })).slice(),
			page([PREVIEW, PR]),
		);
		for (const status of MISSION_STATUSES) {
			client.setQueryData(
				queryKeys.missions.list(base({ status: [status] })).slice(),
				page(ROWS.filter((m) => m.status === status)),
			);
			// Each card's line: a one-row read, newest by last activity.
			client.setQueryData(
				queryKeys.missions.newest({
					origin: "client",
					q: "",
					includeArchived: false,
					status: [status],
				}),
				ROWS.filter((m) => m.status === status && m.lastActivityAt !== null)
					.sort((a, b) =>
						(b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""),
					)
					.slice(0, 1),
			);
		}
		for (const m of [PREVIEW, BUSY]) {
			// The dashboard reads only what is in motion (movingDispatchesQuery).
			client.setQueryData(
				queryKeys.dispatches.moving(m.id),
				(dispatches[m.id] ?? []).filter(
					(d) => d.status === "queued" || d.status === "running",
				),
			);
		}
		client.setQueryData(queryKeys.activity.list(ACTIVITY_PAGE_SIZE, {}), {
			pages: [{ data: [], meta: { nextCursor: null, total: 0 } }],
			pageParams: [undefined],
		});
	};

async function render(
	path: string,
	seed: Seed = seeded({
		[BUSY.id]: [RUNNING, DONE],
		[PREVIEW.id]: [QUEUED],
	}),
): Promise<string> {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
				retryOnMount: false,
				staleTime: Number.POSITIVE_INFINITY,
			},
		},
	});
	seed(queryClient);
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: [path] }),
	});
	await router.load();
	return renderToString(
		<SessionSourceProvider source={signedIn()}>
			<ApiOverrideProvider queryClient={queryClient}>
				<RouterProvider router={router} />
			</ApiOverrideProvider>
		</SessionSourceProvider>,
	);
}

/** An element's text, from its opening tag to the next closing tag. */
function textOf(html: string, testid: string, close = "</span>"): string {
	const start = html.indexOf(`data-testid="${testid}"`);
	expect(start, testid).toBeGreaterThan(-1);
	return visibleText(
		html.slice(html.indexOf(">", start) + 1, html.indexOf(close, start)),
	);
}

/** From an element's opening tag to the end of the section holding it. */
function region(html: string, testid: string): string {
	const start = html.indexOf(`data-testid="${testid}"`);
	expect(start, testid).toBeGreaterThan(-1);
	return html.slice(start, html.indexOf("</section>", start));
}

describe("the status cards", () => {
	it("read their counts from meta.counts, Archived only when included", async () => {
		const html = await render("/missions");
		for (const [card, n] of [
			["needs-you", "2"],
			["active", "2"],
			["draft", "0"],
			["halted", "1"],
			["shipped", "1"],
		]) {
			expect(textOf(html, `missions-card-${card}-count`), card).toBe(n);
		}
		expect(html).not.toContain('data-testid="missions-card-archived"');
		expect(html).not.toContain('data-testid="missions-status-strip"');
	});

	it("say why missions need you, counted by reason", async () => {
		expect(
			textOf(await render("/missions"), "missions-card-needs-you-subline"),
		).toBe("1 preview to read, 1 PR open");
		expect(needsYouSubline([PREVIEW, PREVIEW, PR])).toBe(
			"2 previews to read, 1 PR open",
		);
		// Zero parts drop out.
		expect(needsYouSubline([PREVIEW])).toBe("1 preview to read");
		expect(needsYouSubline([PR, PR])).toBe("2 PRs open");
		expect(needsYouSubline([])).toBe("Nothing waiting on you");
	});

	it("take the Active sub-line from the live dispatches, not the list", async () => {
		expect(
			textOf(await render("/missions"), "missions-card-active-subline"),
		).toBe("1 running, 1 queued");
	});

	it("never says Nothing waiting under a count above zero (review 3, 3)", async () => {
		// Pending: no line yet, so the card draws a skeleton.
		expect(needsYouLine("pending", [], 3)).toBeNull();
		expect(needsYouLine("error", [], 3)).toBe("Couldn't load these");
		expect(needsYouLine("success", [PREVIEW], 3)).toBe(
			`${needsYouSubline([PREVIEW])}, +2 more`,
		);
		expect(needsYouLine("success", [], 2)).toBe("2 waiting on you");
		expect(needsYouLine("success", [], 0)).toBe("Nothing waiting on you");
		// Rendered while the needs-you list itself is still reading.
		const html = await render("/missions", (client) => {
			seeded()(client);
			client.removeQueries({
				queryKey: queryKeys.missions.list(base({ needsYou: true })).slice(),
				exact: true,
			});
		});
		const subline = region(html, "missions-card-needs-you-subline");
		expect(subline).toContain('data-testid="missions-card-needs-you-pending"');
		expect(subline).not.toContain("Nothing waiting on you");
	});

	it("never says Nothing running while the active list itself is still reading", async () => {
		// Every read seeded but the active list: it is pending on the server.
		const html = await render("/missions", (client) => {
			seeded()(client);
			client.removeQueries({
				queryKey: queryKeys.missions.list(base({ status: ["active"] })).slice(),
				exact: true,
			});
		});
		const subline = region(html, "missions-card-active-subline");
		expect(subline).toContain('data-testid="missions-card-active-pending"');
		expect(subline).not.toContain("Nothing running");
	});

	it("drop zero parts from the Active sub-line, and pluralise", () => {
		const running2 = { ...RUNNING, id: id(9) };
		const queued2 = { ...QUEUED, id: id(10) };
		expect(activeSubline([])).toBe("Nothing running");
		expect(activeSubline([RUNNING])).toBe("1 dispatch running");
		expect(activeSubline([RUNNING, running2])).toBe("2 dispatches running");
		expect(activeSubline([QUEUED])).toBe("1 queued");
		expect(activeSubline([RUNNING, running2, QUEUED])).toBe(
			"2 running, 1 queued",
		);
		expect(activeSubline([QUEUED, queued2])).not.toMatch(/\b0\b/);
	});

	it("name each status's newest mission on one line, its age beside the status", async () => {
		const older = mission(7, "halted", {
			lastActivityAt: "2026-10-01T09:00:00.000Z",
		});
		expect(
			newestOf([older, HALTED], Date.parse("2026-10-06T12:00:00.000Z")),
		).toEqual({
			label: "template-booking, sprint 4",
			age: "3 hours ago",
			full: "Client 4, template-booking, sprint 4",
		});
		expect(
			newestOf([mission(8, "draft", { lastActivityAt: null })], 0),
		).toBeNull();
		// Rendered compact: the label alone on the sub-line, truncating with
		// the full label on hover; the age quieter, at the status row's end.
		const html = await render("/missions");
		const start = html.indexOf('data-testid="missions-card-halted-subline"');
		const subline = html.slice(start, html.indexOf("</button>", start));
		expect(subline).toMatch(
			/<span class="truncate" title="Client 4, template-booking, sprint 4">template-booking, sprint 4<\/span><\/span>/,
		);
		expect(tagOf(html, "missions-card-halted-age")).toMatch(
			/\bml-auto\b[^"]*\btext-text-subtle\b/,
		);
		expect(html).toMatch(/data-testid="missions-card-halted-age"[^>]*>[^<]+</);
	});

	it("tone each glyph by meaning: warn needs you, block halted, pending active, never the accent", async () => {
		const html = await render("/missions");
		const glyph = (card: string) =>
			region(html, `missions-card-${card}`).match(/data-tone="([a-z]+)"/)?.[1];
		expect(glyph("needs-you")).toBe("warn");
		expect(glyph("halted")).toBe("block");
		expect(glyph("active")).toBe("pending");
		expect(region(html, "missions-status-cards")).not.toMatch(
			/text-accent|bg-accent/,
		);
	});

	it("set ?status: pressed from the URL, and a second press shows every status", async () => {
		const html = await render("/missions?status=halted");
		expect(tagOf(html, "missions-card-halted")).toContain(
			'aria-pressed="true"',
		);
		expect(tagOf(html, "missions-card-active")).toContain(
			'aria-pressed="false"',
		);
		expect(nextStatus("halted", "all")).toBe("halted");
		expect(nextStatus("needs-you", "halted")).toBe("needs-you");
		expect(nextStatus("halted", "halted")).toBe("all");
	});
});

describe("Running now", () => {
	it("shows only queued and running dispatches, running first", async () => {
		const board = region(await render("/missions"), "missions-running");
		expect(board).toContain(`missions-running-row-${RUNNING.id}`);
		expect(board).toContain(`missions-running-row-${QUEUED.id}`);
		expect(board).not.toContain(`missions-running-row-${DONE.id}`);
		expect(board.indexOf(RUNNING.id)).toBeLessThan(board.indexOf(QUEUED.id));
	});

	it("says it is updating every 5 s while something moves, and Final after", async () => {
		const moving = await render("/missions");
		expect(textOf(moving, "missions-running-read-age", "</p>")).toBe(
			"Updating every 5 s while a dispatch runs",
		);
		const settled = await render("/missions", seeded({ [BUSY.id]: [DONE] }));
		expect(
			textOf(settled, "missions-running-read-age", "</span>").trim(),
		).toMatch(/^Final, read /);
		expect(settled).toContain('data-testid="missions-running-empty"');
	});

	it("draws each in the pending tone, with its budget on the hard-ceiling track", async () => {
		const html = await render("/missions");
		expect(tagOf(html, `missions-running-status-${RUNNING.id}`)).toContain(
			'data-tone="pending"',
		);
		// 12,000 of a 120,000 hard ceiling; the estimate's mark sits at a third.
		expect(tagOf(html, `missions-running-fill-${RUNNING.id}`)).toContain(
			"width:10%",
		);
		expect(textOf(html, `missions-running-spend-${RUNNING.id}`)).toBe(
			"$0.0421",
		);
		expect(textOf(html, `missions-running-clock-${QUEUED.id}`)).toBe(
			"240 min limit",
		);
	});

	it("links each to its mission's full page", async () => {
		expect(
			tagOf(
				await render("/missions"),
				`missions-running-mission-${RUNNING.id}`,
			),
		).toContain(`href="/missions/${BUSY.id}"`);
	});
});

describe("Needs you", () => {
	it("lists each with its reason in words, linking to the full page (audit F6)", async () => {
		const html = await render("/missions");
		expect(tagOf(html, `missions-needs-you-row-${PREVIEW.id}`)).toContain(
			`href="/missions/${PREVIEW.id}"`,
		);
		const column = region(html, "missions-needs-you");
		expect(column).toContain(NEEDS_YOU_DETAIL.export_previewed);
		expect(column).toContain(NEEDS_YOU_DETAIL.pr_open);
		expect(textOf(html, "missions-needs-you-all", "</button>")).toBe("All 2");
	});

	it("lead each row with its type and sprint and the client, then the reason and its age", async () => {
		const html = await render("/missions");
		expect(textOf(html, `missions-needs-you-label-${PREVIEW.id}`)).toBe(
			missionShortLabel(PREVIEW),
		);
		expect(textOf(html, `missions-needs-you-meta-${PREVIEW.id}`)).toBe(
			"Client 1",
		);
		const row = region(html, `missions-needs-you-row-${PREVIEW.id}`);
		expect(visibleText(row)).toMatch(/ ?, since /);
		// A divided row, no card of its own: 40px at least, compact padding.
		expect(tagOf(html, `missions-needs-you-row-${PREVIEW.id}`)).toMatch(
			/\bmin-h-10\b[^"]*\bpy-2\b/,
		);
	});
});

describe("the dashboard as a whole", () => {
	it("never says Live (audit F1)", async () => {
		for (const path of ["/missions", "/missions?status=needs-you"]) {
			expect(visibleText(await render(path))).not.toMatch(/\bLive\b/);
		}
	});

	it("puts every region through Surface", async () => {
		const html = await render("/missions");
		for (const testid of [
			"missions-running-list",
			"missions-needs-you-list",
			"missions-activity-list",
		]) {
			expect(tagOf(html, testid)).toMatch(/data-state="(success|empty)"/);
		}
	});

	it("lays out one grid of panels: Running now and the list (8), Needs you and the watch (4)", async () => {
		const html = await render("/missions");
		expect(tagOf(html, "missions-dashboard")).toContain(
			"flex min-w-0 flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start",
		);
		const main = html.indexOf('data-testid="missions-dashboard-main"');
		const side = html.indexOf('data-testid="missions-dashboard-side"');
		const at = (testid: string) => html.indexOf(`data-testid="${testid}"`);
		expect(tagOf(html, "missions-dashboard-main")).toContain("lg:col-span-8");
		expect(tagOf(html, "missions-dashboard-side")).toContain("lg:col-span-4");
		for (const testid of ["missions-running", "missions-list"]) {
			expect(at(testid)).toBeGreaterThan(main);
			expect(at(testid)).toBeLessThan(side);
		}
		for (const testid of [
			"missions-needs-you",
			"missions-watch-quiet",
			"missions-activity",
		]) {
			expect(at(testid)).toBeGreaterThan(side);
		}
		// The list is one panel: its toolbar in the header, the status groups
		// nested inside as sub-sections, never panels inside a panel.
		expect(tagOf(html, "missions-list-toolbar")).toBeDefined();
		expect(html.slice(at("missions-list-toolbar"))).toContain(
			'data-testid="missions-filter-bar"',
		);
		expect(tagOf(html, "missions-panels")).toContain('data-nested="true"');
		// One read age for the list, in its footer; none per group.
		expect(tagOf(html, "missions-list-read-age")).toBeDefined();
		expect(html).not.toContain(
			'data-testid="missions-panel-active-list-read-age"',
		);
		expect(html).not.toContain('data-testid="missions-panel-active-header"');
		expect(tagOf(html, "missions-panel-active")).not.toContain("rounded-card");
	});

	it("orders a phone's single column: running, needs you, the list, then the watch", async () => {
		const html = await render("/missions");
		const orderOf = (testid: string) => {
			const at = html.indexOf(`data-testid="${testid}"`);
			// The nearest wrapper before it that sets an order.
			const wrappers = [
				...html.slice(0, at).matchAll(/<div[^>]*\sclass="order-(\d)/g),
			];
			return Number(wrappers.at(-1)?.[1]);
		};
		expect(
			[
				"missions-running",
				"missions-needs-you",
				"missions-list",
				"missions-watch-quiet",
				"missions-watch-in-flight",
				"missions-activity",
			].map(orderOf),
		).toEqual([1, 2, 3, 4, 5, 6]);
	});

	it("gives every panel the one anatomy: a footer band with its read age", async () => {
		const html = await render("/missions");
		for (const panel of [
			"missions-running",
			"missions-needs-you",
			"missions-list",
			"missions-activity",
		]) {
			expect(tagOf(html, `${panel}-footer`), panel).toContain(
				"border-t border-border bg-app-band px-4 py-2",
			);
			expect(tagOf(html, `${panel}-toggle`), panel).toContain("h-12");
		}
	});
});
