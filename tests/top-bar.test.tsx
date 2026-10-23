import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRouter,
	RouterContextProvider,
	RouterProvider,
} from "@tanstack/react-router";
import type { MissionListItem } from "avel-server/contract";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiOverrideProvider } from "@/lib/api";
import { queryKeys } from "@/lib/api/keys";
import { SessionSourceProvider } from "@/lib/auth";
import { routeTree } from "../src/routeTree.gen";
import {
	INBOX_PER_ORIGIN,
	InboxBadge,
	InboxPanel,
	inboxLabel,
	inboxOf,
	inboxParams,
} from "../src/shell/top-inbox";
import { signedIn } from "./auth-session";
import { renderPage, tagOf } from "./render-page";

const ID = (n: number) =>
	`00000000-0000-4000-8000-${String(7000 + n).padStart(12, "0")}`;

function needing(n: number, origin: "client" | "internal"): MissionListItem {
	return {
		id: ID(n),
		origin,
		type: "Feature",
		sprintN: 1,
		status: "active",
		cut: "vertical",
		cutSource: "derived",
		client: origin === "client" ? { id: ID(900), name: `Acme ${n}` } : null,
		engagement: origin === "client" ? { id: ID(901), name: "Platform" } : null,
		lastExport: null,
		lastActivityAt: null,
		needsYou: { reason: n % 2 ? "export_previewed" : "pr_open" },
		createdAt: "2026-10-01T00:00:00.000Z",
		updatedAt: "2026-10-01T00:00:00.000Z",
	};
}

describe("the inbox", () => {
	it("asks for the missions that need you, per origin, as the Missions page does", () => {
		expect(inboxParams("internal")).toEqual({
			origin: "internal",
			q: "",
			sort: "lastActivity",
			includeArchived: false,
			needsYou: true,
		});
	});

	it("is named with the split, never one number without labels", () => {
		expect(inboxLabel({})).toBe("Inbox");
		expect(inboxLabel({ client: 0, internal: 0 })).toBe(
			"Inbox, nothing needs you",
		);
		expect(inboxLabel({ client: 2, internal: 1 })).toBe(
			"Inbox, 3 items need you (2 client, 1 internal)",
		);
		expect(inboxLabel({ client: 1 })).toBe(
			"Inbox, 1 item needs you (1 client)",
		);
	});

	it("takes the count from meta and at most five rows from the first page", () => {
		const rows = Array.from({ length: 7 }, (_, i) => needing(i + 1, "client"));
		const list = {
			status: "success",
			data: {
				pages: [
					{
						data: rows,
						meta: {
							nextCursor: "c1",
							counts: {
								byStatus: {
									draft: 0,
									active: 9,
									halted: 0,
									shipped: 0,
									archived: 0,
								},
								needsYou: 12,
							},
						},
					},
				],
				pageParams: [undefined],
			},
		} as unknown as Parameters<typeof inboxOf>[0];
		const inbox = inboxOf(list);
		expect(inbox?.count).toBe(12);
		expect(inbox?.missions).toHaveLength(INBOX_PER_ORIGIN);
		expect(INBOX_PER_ORIGIN).toBe(5);
		expect(
			inboxOf({ status: "pending" } as Parameters<typeof inboxOf>[0]),
		).toBeUndefined();
	});

	it("shows no badge at zero, and caps it at 99+", () => {
		expect(renderToString(<InboxBadge total={0} />)).toBe("");
		expect(renderToString(<InboxBadge total={3} />)).toMatch(/>3</);
		expect(renderToString(<InboxBadge total={120} />)).toMatch(/>99\+</);
		expect(renderToString(<InboxBadge total={3} />)).toContain(
			'aria-hidden="true"',
		);
	});

	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	const inRouter = (node: ReactNode) =>
		renderToString(
			<RouterContextProvider router={router}>{node}</RouterContextProvider>,
		);

	it("lists each origin on its own, five at most, with why each needs you", () => {
		const client = Array.from({ length: 7 }, (_, i) =>
			needing(i + 1, "client"),
		);
		const html = inRouter(
			<InboxPanel
				sections={[
					{
						origin: "client",
						inbox: { count: 7, missions: client.slice(0, INBOX_PER_ORIGIN) },
						failed: false,
					},
					{
						origin: "internal",
						inbox: { count: 1, missions: [needing(20, "internal")] },
						failed: false,
					},
				]}
			/>,
		);
		const clientSection = html.slice(
			html.indexOf('data-testid="global-inbox-client"'),
			html.indexOf('data-testid="global-inbox-internal"'),
		);
		expect(tagOf(html, "global-inbox-client")).toContain(
			'aria-label="Client missions"',
		);
		expect(clientSection).toMatch(
			/data-testid="global-inbox-client-count"[^>]*>7</,
		);
		expect(
			clientSection.match(/data-testid="global-inbox-mission-/g),
		).toHaveLength(5);
		expect(clientSection).toContain("Preview ready to review");
		expect(clientSection).not.toContain(ID(20));
		// A mission that needs you lands on its full page, where it is acted
		// on (audit F6), whatever its origin; list rows keep the panel.
		expect(tagOf(html, `global-inbox-mission-${ID(1)}`)).toContain(
			`href="/missions/${ID(1)}"`,
		);
		expect(tagOf(html, `global-inbox-mission-${ID(20)}`)).toContain(
			`href="/missions/${ID(20)}"`,
		);
		expect(tagOf(html, "global-inbox-open")).toContain(
			'href="/missions?status=needs-you"',
		);
	});

	it("says nothing needs you when both origins are clear", () => {
		const html = inRouter(
			<InboxPanel
				sections={[
					{
						origin: "client",
						inbox: { count: 0, missions: [] },
						failed: false,
					},
					{
						origin: "internal",
						inbox: { count: 0, missions: [] },
						failed: false,
					},
				]}
			/>,
		);
		expect(html).toMatch(
			/data-testid="global-inbox-empty"[^>]*>Nothing needs you\.</,
		);
	});

	it("is quiet about a failed origin, and keeps the other", () => {
		const html = inRouter(
			<InboxPanel
				sections={[
					{ origin: "client", failed: true },
					{
						origin: "internal",
						inbox: { count: 1, missions: [needing(20, "internal")] },
						failed: false,
					},
				]}
			/>,
		);
		expect(html).toMatch(
			/data-testid="global-inbox-client-error"[^>]*>Could not load these\.</,
		);
		expect(html).toContain(`global-inbox-mission-${ID(20)}`);
	});
});

/** The real page with the inbox's two queries seeded. */
async function renderWithInbox(counts: { client: number; internal: number }) {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
		},
	});
	for (const origin of ["client", "internal"] as const) {
		const rows = Array.from({ length: Math.min(counts[origin], 5) }, (_, i) =>
			needing(i + (origin === "client" ? 1 : 40), origin),
		);
		queryClient.setQueryData(queryKeys.missions.list(inboxParams(origin)), {
			pages: [
				{
					data: rows,
					meta: {
						nextCursor: null,
						counts: {
							byStatus: {
								draft: 0,
								active: 0,
								halted: 0,
								shipped: 0,
								archived: 0,
							},
							needsYou: counts[origin],
						},
					},
				},
			],
			pageParams: [undefined],
		});
	}
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: ["/clients"] }),
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

describe("the top-right cluster", () => {
	it("is the command menu, then the inbox", async () => {
		const html = await renderPage("/missions");
		const cluster = html.slice(html.indexOf('data-testid="global-actions"'));
		const order = ["global-search", "global-inbox"].map((id) =>
			cluster.indexOf(`data-testid="${id}"`),
		);
		expect(order.every((at) => at > 0)).toBe(true);
		expect([...order].sort((a, b) => a - b)).toEqual(order);
	});

	it("no longer has the bell, the theme button, the status dot or create", async () => {
		const html = await renderPage("/missions");
		expect(html).not.toContain('data-testid="global-create"');
		expect(html).not.toContain('data-testid="global-status"');
		expect(html).not.toContain('data-testid="global-notifications"');
		expect(html).not.toContain('data-testid="global-theme"');
	});

	it("badges the inbox with the total and names the split", async () => {
		const html = await renderWithInbox({ client: 2, internal: 1 });
		expect(tagOf(html, "global-inbox")).toContain(
			'aria-label="Inbox, 3 items need you (2 client, 1 internal)"',
		);
		expect(html).toMatch(/data-testid="global-inbox-badge"[^>]*>3</);
		// Cut out of the glyph by a ring of the top bar's own surface.
		expect(tagOf(html, "global-inbox-badge")).toMatch(
			/\bring-2\b[^"]*\bring-app-page\b/,
		);
	});

	it("shows no badge when nothing needs you", async () => {
		const html = await renderWithInbox({ client: 0, internal: 0 });
		expect(html).not.toContain("global-inbox-badge");
		expect(tagOf(html, "global-inbox")).toContain(
			'aria-label="Inbox, nothing needs you"',
		);
	});
});
