import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import type { Client, Engagement } from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	sampleFilesForClient,
	sampleNotesForClient,
} from "@/components/avel/drive-placeholders";
import { ApiError, ApiOverrideProvider } from "@/lib/api";
import {
	CLIENTS_PAGE_SIZE,
	ENGAGEMENTS_PAGE_SIZE,
	type Page,
} from "@/lib/api/clients";
import { queryKeys } from "@/lib/api/keys";
import { SessionSourceProvider } from "@/lib/auth";
import { clientsSearch, Route } from "../src/routes/clients";
import { routeTree } from "../src/routeTree.gen";
import { signedIn } from "./auth-session";
import { client, engagement } from "./clients-fixtures";
import { renderPage, tagOf } from "./render-page";

const render = () => renderPage("/clients");

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
		expect(html).not.toContain("Onboarding is not built yet");
	});

	it("loads the real list: a few skeleton rows, never the not-built state", async () => {
		const html = await render();
		expect(tagOf(html, "client-list")).toContain('data-state="loading"');
		// Few rows: with only a handful of clients, a long skeleton would lie.
		expect(html.match(/data-testid="client-list-skeleton-row"/g)).toHaveLength(
			3,
		);
		expect(html).not.toContain('data-state="not-built"');
	});

	it("keeps the definition as the subtitle until a count is known", async () => {
		const html = await render();
		expect(html).toContain('data-testid="topbar-definition"');
		expect(html).not.toContain('data-testid="topbar-subtitle"');
	});
});

/**
 * The real page with a seeded first page of clients, through the app's own
 * ApiProvider (ApiOverrideProvider hands it this QueryClient).
 */
async function renderSeeded(
	first: Page<Client>,
	{
		path = "/clients",
		q,
		detail,
		engagements,
	}: {
		path?: string;
		q?: string;
		/** The selected client, or the error its fetch failed with. */
		detail?: Client | ApiError;
		engagements?: { clientId: string; rows: Engagement[] };
	} = {},
) {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
				// A seeded error stays an error instead of refetching on mount.
				retryOnMount: false,
				staleTime: Number.POSITIVE_INFINITY,
			},
		},
	});
	queryClient.setQueryData(queryKeys.clients.list(CLIENTS_PAGE_SIZE, q), {
		pages: [first],
		pageParams: [undefined],
	});
	if (detail instanceof ApiError) {
		const id = new URLSearchParams(path.split("?")[1]).get("client") ?? "";
		queryClient
			.getQueryCache()
			.build(queryClient, { queryKey: queryKeys.clients.detail(id) })
			.setState({ status: "error", fetchStatus: "idle", error: detail });
	} else if (detail) {
		queryClient.setQueryData(queryKeys.clients.detail(detail.id), detail);
	}
	if (engagements) {
		queryClient.setQueryData(
			queryKeys.engagements.byClient(
				engagements.clientId,
				ENGAGEMENTS_PAGE_SIZE,
			),
			{
				pages: [{ data: engagements.rows, meta: { nextCursor: null } }],
				pageParams: [undefined],
			},
		);
	}
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

describe("the Clients page's count", () => {
	it("shows the list's exact total from the first page, in tabular numerals", async () => {
		// One row loaded, 120 in the list: the count is the total, not the rows.
		const html = await renderSeeded({
			data: [client(1)],
			meta: { nextCursor: "c1", total: 120 },
		});
		const subtitle = html.match(
			/<p[^>]*data-testid="topbar-subtitle"[^>]*>([^<]*)</,
		);
		expect(subtitle?.[1]).toBe("120 clients");
		expect(subtitle?.[0]).toMatch(/\btabular-nums\b/);
		expect(html).not.toContain('data-testid="topbar-definition"');
	});

	it("says 1 client in the singular", async () => {
		const html = await renderSeeded({
			data: [client(1)],
			meta: { nextCursor: null, total: 1 },
		});
		expect(html).toMatch(/data-testid="topbar-subtitle"[^>]*>1 client</);
	});

	it("keeps the definition when the route gives no total, never counting rows", async () => {
		const html = await renderSeeded({
			data: [client(1), client(2)],
			meta: { nextCursor: null },
		});
		expect(html).not.toContain('data-testid="topbar-subtitle"');
		expect(html).toContain('data-testid="topbar-definition"');
		expect(html).not.toContain(">2 clients<");
	});
});

describe("searching the Clients page", () => {
	it("lists the search's matches and counts them as matches", async () => {
		const html = await renderSeeded(
			{
				data: [client(1), client(2), client(3)],
				meta: { nextCursor: null, total: 3 },
			},
			{ path: "/clients?q=acme", q: "acme" },
		);
		expect(html).toMatch(/data-testid="topbar-subtitle"[^>]*>3 clients match</);
		expect(tagOf(html, "clients-search")).toContain('value="acme"');
		expect(tagOf(html, "client-list")).toContain('data-state="success"');
	});

	it("says nothing matched, rather than offering a first client", async () => {
		const html = await renderSeeded(
			{ data: [], meta: { nextCursor: null, total: 0 } },
			{ path: "/clients?q=zzz", q: "zzz" },
		);
		expect(html).toContain('data-testid="clients-no-match"');
		expect(html).toContain('data-testid="clients-clear-search"');
		expect(html).not.toContain("Add your first client");
	});

	it("labels its search field", async () => {
		const html = await renderSeeded({
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

	it("reads its URL strictly: q trimmed and capped, client only as an id", () => {
		expect(clientsSearch.parse({ q: "  acme  " }).q).toBe("acme");
		expect(clientsSearch.parse({ q: "   " }).q).toBeUndefined();
		expect(clientsSearch.parse({ q: "x".repeat(300) }).q).toHaveLength(200);
		expect(clientsSearch.parse({ client: client(1).id }).client).toBe(
			client(1).id,
		);
		expect(clientsSearch.parse({ client: "not-an-id" }).client).toBeUndefined();
	});
});

const THREE: Page<Client> = {
	data: [
		client(1, { notesMd: "First line\nSecond line" }),
		client(2, {
			status: "closed",
			engagementCount: 1,
			activeEngagementCount: 0,
		}),
		client(3, {
			engagementCount: 0,
			activeEngagementCount: 0,
			primaryContact: null,
		}),
	],
	meta: { nextCursor: null, total: 3 },
};
const [ONE, TWO, THREE_C] = THREE.data as [Client, Client, Client];

/** The markup of one list row, from its opening tag to its closing </a>. */
const rowOf = (html: string, c: Client) => {
	const start = html.lastIndexOf(
		"<a",
		html.indexOf(`data-testid="client-row-${c.id}"`),
	);
	return html.slice(start, html.indexOf("</a>", start));
};

describe("the client list", () => {
	it("is slim: each row is the name, a status pill and its engagements in mono", async () => {
		const html = await renderSeeded(THREE);
		const one = rowOf(html, ONE);
		expect(one).toContain(">Client 1<");
		expect(tagOf(one, `client-status-${ONE.id}`)).toContain('data-tone="pass"');
		expect(one).toMatch(/type-mono-small[^"]*"[^>]*>3 engagements, 1 active</);
		expect(tagOf(rowOf(html, TWO), `client-status-${TWO.id}`)).toContain(
			'data-tone="stale"',
		);
		expect(rowOf(html, TWO)).toContain(">1 engagement, 0 active<");
		expect(rowOf(html, THREE_C)).toContain(">0 engagements<");
	});

	it("makes each row a link to that client, keeping the search", async () => {
		expect(tagOf(await renderSeeded(THREE), `client-row-${ONE.id}`)).toContain(
			`href="/clients?client=${ONE.id}"`,
		);
		const searched = await renderSeeded(THREE, {
			path: "/clients?q=acme",
			q: "acme",
		});
		expect(tagOf(searched, `client-row-${ONE.id}`)).toMatch(
			new RegExp(
				`href="/clients\\?q=acme&amp;client=${ONE.id}"|href="/clients\\?client=${ONE.id}&amp;q=acme"`,
			),
		);
	});

	it("marks only the selected row, with the selected fill and the accent edge", async () => {
		const html = await renderSeeded(THREE, {
			path: `/clients?client=${ONE.id}`,
			detail: ONE,
		});
		const selected = tagOf(html, `client-row-${ONE.id}`);
		// The router marks the selected row's link as the current page.
		expect(selected).toContain('aria-current="page"');
		expect(selected).toContain('data-selected="true"');
		// Whole class tokens: "hover:bg-state-selected" is not the fill itself.
		const token = (cls: string) =>
			new RegExp(
				`class="(?:[^"]*\\s)?${cls.replace(/[:()[\]]/g, "\\$&")}(?:\\s[^"]*)?"`,
			);
		expect(selected).toMatch(token("bg-state-selected"));
		expect(selected).toMatch(token("before:bg-accent"));
		const other = tagOf(html, `client-row-${TWO.id}`);
		expect(other).not.toContain("aria-current");
		expect(other).not.toContain("data-selected");
		expect(other).not.toMatch(token("bg-state-selected"));
	});

	it("says how many of how many are loaded, and offers more", async () => {
		const html = await renderSeeded({
			data: THREE.data,
			meta: { nextCursor: "c1", total: 120 },
		});
		expect(html).toMatch(
			/data-testid="clients-showing"[^>]*>Showing 3 of 120</,
		);
		expect(html).toContain('data-testid="clients-load-more"');
		const all = await renderSeeded(THREE);
		expect(all).toMatch(/data-testid="clients-showing"[^>]*>Showing 3 of 3</);
		expect(all).not.toContain("clients-load-more");
	});
});

describe("with no client chosen", () => {
	it("chooses nothing for you, and says how many there are to choose from", async () => {
		const html = await renderSeeded(THREE);
		expect(html).not.toContain('data-testid="client-detail"');
		expect(html).toMatch(
			/data-testid="empty-state-title"[^>]*>Choose a client</,
		);
		expect(html).toContain(
			"3 clients. Choose one to see its engagements and notes.",
		);
		// No client row is marked; the sidebar's own link is not a client row.
		for (const c of THREE.data) {
			const row = tagOf(html, `client-row-${c.id}`);
			expect(row).not.toContain("aria-current");
			expect(row).not.toContain("data-selected");
		}
	});

	it("shows onboarding across both panes on first run", async () => {
		const html = await renderSeeded({
			data: [],
			meta: { nextCursor: null, total: 0 },
		});
		expect(html).toContain('data-testid="clients-empty"');
		expect(html).toContain("Add your first client");
		expect(html).not.toContain('data-testid="clients-panes"');
	});
});

describe("the chosen client", () => {
	const chosen = (
		opts: { detail?: Client | ApiError; engagements?: Engagement[] } = {},
	) =>
		renderSeeded(THREE, {
			path: `/clients?client=${ONE.id}`,
			detail: opts.detail ?? ONE,
			engagements: opts.engagements
				? { clientId: ONE.id, rows: opts.engagements }
				: undefined,
		});

	it("is headed by its name, status, contact and actions", async () => {
		const html = await chosen();
		expect(html).toMatch(/<h2 id="[^"]+" class="type-h2[^"]*">Client 1<\/h2>/);
		expect(tagOf(html, "client-detail-status")).toContain('data-tone="pass"');
		expect(html).toMatch(
			/data-testid="client-detail-contact"[^>]*>contact1@example.com</,
		);
		expect(tagOf(html, "client-menu")).toContain(
			'aria-label="Actions for Client 1"',
		);
	});

	it("says a missing contact is not set", async () => {
		const html = await renderSeeded(THREE, {
			path: `/clients?client=${THREE_C.id}`,
			detail: THREE_C,
		});
		expect(html).toContain("Primary contact: none set");
	});

	it("lists its engagements, with the active-only toggle off", async () => {
		const e = engagement(1, ONE.id);
		const html = await chosen({ engagements: [e] });
		expect(html).toContain(`data-testid="engagement-${e.id}"`);
		expect(tagOf(html, "client-active-only")).toContain('aria-pressed="false"');
		expect(html).toContain(`data-testid="engagement-new-${ONE.id}"`);
	});

	it("shows its notes as plain text, keeping their line breaks", async () => {
		const html = await chosen();
		const notes = tagOf(html, "client-detail-notes");
		expect(notes).toMatch(/\bwhitespace-pre-line\b/);
		expect(html).toMatch(
			/data-testid="client-detail-notes"[^>]*>First line\nSecond line</,
		);
	});

	it("says when there are no notes", async () => {
		const html = await renderSeeded(THREE, {
			path: `/clients?client=${TWO.id}`,
			detail: TWO,
		});
		expect(html).toMatch(/data-testid="client-detail-notes"[^>]*>None set\.</);
	});

	it("says when it last changed, with the full time on hover", async () => {
		const html = await chosen();
		expect(html).toMatch(
			/data-testid="client-detail-updated"[^>]*>Updated(?:<!-- -->)? <time datetime="2026-10-05T09:00:00.000Z" title="2026-10-05T09:00:00.000Z"/i,
		);
	});

	it("that is gone shows NOT_FOUND's copy and the way back", async () => {
		const missing = new ApiError({
			method: "GET",
			path: "/api/clients/x",
			kind: "contract",
			status: 404,
			code: "NOT_FOUND",
			message: "m",
			requestId: "req_gone",
		} as ConstructorParameters<typeof ApiError>[0]);
		const html = await chosen({ detail: missing });
		expect(html).toContain('data-testid="client-detail-error"');
		expect(html).toContain("This could not be found.");
		expect(tagOf(html, "client-back")).toContain('href="/clients"');
		expect(html).not.toContain('data-testid="client-detail"');
	});

	it("goes back to the list it came from, keeping the search", async () => {
		const missing = new ApiError({
			method: "GET",
			path: "/api/clients/x",
			kind: "contract",
			status: 404,
			code: "NOT_FOUND",
			message: "m",
			requestId: "req_gone",
		} as ConstructorParameters<typeof ApiError>[0]);
		const html = await renderSeeded(THREE, {
			path: `/clients?q=acme&client=${ONE.id}`,
			q: "acme",
			detail: missing,
		});
		expect(tagOf(html, "client-back")).toContain('href="/clients?q=acme"');
	});
});

describe("on a phone", () => {
	it("shows the list alone until a client is chosen", async () => {
		const html = await renderSeeded(THREE);
		expect(tagOf(html, "clients-list-pane")).not.toMatch(/\bmax-lg:hidden\b/);
		expect(tagOf(html, "clients-detail-pane")).toMatch(/\bmax-lg:hidden\b/);
	});

	it("replaces the list with the chosen client, with a way back", async () => {
		const html = await renderSeeded(THREE, {
			path: `/clients?client=${ONE.id}`,
			detail: ONE,
		});
		expect(tagOf(html, "clients-list-pane")).toMatch(/\bmax-lg:hidden\b/);
		expect(tagOf(html, "clients-detail-pane")).not.toMatch(/\bmax-lg:hidden\b/);
		const back = html.slice(html.indexOf('data-testid="client-detail"'));
		expect(tagOf(back, "client-back")).toMatch(/\blg:hidden\b/);
	});
});

describe("the selection in the URL", () => {
	it("is kept: a chosen client is a link, not a one-time instruction", async () => {
		const html = await renderSeeded(THREE, {
			path: `/clients?client=${ONE.id}`,
			detail: ONE,
		});
		expect(html).toContain('data-testid="client-detail"');
		expect(clientsSearch.parse({ client: ONE.id }).client).toBe(ONE.id);
	});
});

describe("the chosen client's tabs (ruling 33)", () => {
	const opened = () =>
		renderSeeded(THREE, {
			path: `/clients?client=${ONE.id}`,
			detail: ONE,
		});

	it("opens on Overview, with Notes and Files beside it", async () => {
		const html = await opened();
		expect(tagOf(html, "client-tab-overview")).toContain('data-state="active"');
		expect(tagOf(html, "client-tab-notes")).toContain('data-state="inactive"');
		expect(tagOf(html, "client-tab-files")).toContain('data-state="inactive"');
	});

	it("keeps every panel in the page and hides the inactive ones", async () => {
		const html = await opened();
		const panels = [...html.matchAll(/<div[^>]*role="tabpanel"[^>]*>/g)].map(
			(m) => m[0],
		);
		expect(panels).toHaveLength(3);
		const active = panels.filter((p) => p.includes('data-state="active"'));
		expect(active).toHaveLength(1);
		for (const p of panels.filter((p) => p.includes('data-state="inactive"'))) {
			expect(p).toMatch(/data-\[state=inactive\]:hidden/);
		}
	});

	it("puts the client's own notes first on Notes, then the Drive's notes behind the pill", async () => {
		const html = await opened();
		const own = html.indexOf('data-testid="client-detail-notes"');
		const drive = html.indexOf('data-testid="client-notes-drive"');
		expect(own).toBeGreaterThan(-1);
		expect(drive).toBeGreaterThan(own);
		expect(html.slice(drive, drive + 600)).toContain("Sample data");
	});

	it("shows the Drive's notes as cards: title, author and date, then the opening lines", async () => {
		const html = await opened();
		const notes = sampleNotesForClient(ONE.id);
		const cards = html.match(/data-testid="drive-note"/g) ?? [];
		expect(cards).toHaveLength(notes.length);
		for (const note of notes) {
			expect(html).toMatch(
				new RegExp(`data-testid="drive-note-title"[^>]*>${note.title}<`),
			);
			expect(html).toContain(`By ${note.uploadedBy}`);
		}
	});

	it("lists the client's files behind the pill, engagement files tagged, controls real", async () => {
		const html = await opened();
		const { files, engagements } = sampleFilesForClient(ONE.id);
		const region = html.indexOf('data-testid="client-files-drive"');
		expect(region).toBeGreaterThan(-1);
		expect(html.slice(region, region + 600)).toContain("Sample data");
		const rows = html.match(/data-testid="client-file-list-row-/g) ?? [];
		expect(rows).toHaveLength(files.length);
		// No note is a file here: notes have their own tab.
		expect(files.some((f) => f.mime === "text/markdown")).toBe(false);
		const engaged = files.find((f) => f.scope === "engagement");
		expect(engaged).toBeDefined();
		const row = html.slice(
			html.indexOf(`data-testid="client-file-list-row-${engaged?.id}"`),
		);
		expect(row.slice(0, row.indexOf("</tr>"))).toContain(
			`>${engagements[0]?.name}<`,
		);
		// The toolbar and the drop zone are real controls, outside the region.
		expect(html.indexOf('data-testid="client-files-toolbar"')).toBeLessThan(
			region,
		);
		expect(tagOf(html, "client-files-drop-upload")).toMatch(/\sdisabled=""/);
	});
});
