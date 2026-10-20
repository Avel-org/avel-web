import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import {
	type MissionListItem,
	missionListItem,
	missionStatusCounts,
	type Playbook,
	playbookSchema,
	type Template,
	templateCoverUrl,
	templateSchema,
} from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TemplateCover } from "@/components/avel/template-cover";
import {
	draftFor,
	filterTemplates,
	recentTemplates,
} from "@/components/avel/template-list";
import {
	type ApiClient,
	ApiError,
	ApiOverrideProvider,
	queryKeys,
} from "@/lib/api";
import { PLAYBOOK_PAGE_SIZE } from "@/lib/api/playbooks";
import {
	type MissionOrigin,
	TEMPLATE_MISSIONS_PAGE,
	templateMissionsQuery,
} from "@/lib/api/templates";
import { SessionSourceProvider } from "@/lib/auth";
import { NOT_YET } from "@/lib/capabilities";
import { templatesSubtitle } from "@/routes/templates";
import { routeTree } from "@/routeTree.gen";
import { signedIn } from "./auth-session";
import { preset } from "./presets-fixtures";
import { tagOf } from "./render-page";
import { visibleText } from "./visible-text";

// ---------------------------------------------------------------------------
// Fixtures, parsed through the contract's own schemas.

const TEAM = preset(7, { name: "Booking squad" });
const SHA = "0123456789abcdef0123456789abcdef01234567";

const BOOKING: Template = templateSchema.parse({
	slug: "template-booking",
	readable: true,
	name: "Booking",
	scope: "full-stack",
	startingState: "greenfield",
	latestSha: SHA,
	defaultPresetId: TEAM.id,
	missionCount: 3,
	cover: null,
});

/** Booking with the cover its manifest names, as avel-server serves it. */
const COVER = {
	url: templateCoverUrl("template-booking", SHA),
	alt: "A week of booking slots, five taken",
};
const COVERED: Template = { ...BOOKING, cover: COVER };

const AUDIT: Template = templateSchema.parse({
	slug: "template-audit",
	readable: true,
	name: "Audit",
	scope: "audit",
	startingState: "brownfield",
	latestSha: "f".repeat(40),
	defaultPresetId: null,
	missionCount: 0,
	cover: null,
});

/** The repository could not be read: every manifest field is null. */
const LEGACY: Template = templateSchema.parse({
	slug: "template-legacy",
	readable: false,
	name: null,
	scope: null,
	startingState: null,
	latestSha: null,
	defaultPresetId: null,
	missionCount: 1,
	cover: null,
});

const PLAYBOOK: Playbook = playbookSchema.parse({
	id: "00000000-0000-4000-8000-000000000901",
	missionType: "template-booking",
	name: "Template booking",
	wavesApplicable: ["A", "B", "C"],
	gates: [
		{ gate: "qa", policy: "mandatory" },
		{ gate: "security", policy: "warn" },
	],
	deliverable: "pr",
	requiredFields: [],
	defaultPresetId: TEAM.id,
	version: 4,
	createdAt: "2026-10-01T00:00:00.000Z",
	updatedAt: "2026-10-09T00:00:00.000Z",
});

const CLIENT_MISSION: MissionListItem = missionListItem.parse({
	id: "00000000-0000-4000-8000-000000000501",
	origin: "client",
	type: "template-booking",
	sprintN: 1,
	status: "active",
	cut: "vertical",
	cutSource: "derived",
	client: { id: "00000000-0000-4000-8000-000000000601", name: "Acme" },
	engagement: {
		id: "00000000-0000-4000-8000-000000000701",
		name: "Booking site",
	},
	lastExport: null,
	lastActivityAt: "2026-10-06T09:00:00.000Z",
	needsYou: null,
	createdAt: "2026-10-01T00:00:00.000Z",
	updatedAt: "2026-10-05T00:00:00.000Z",
});

const NO_COUNTS = {
	byStatus: missionStatusCounts.parse({
		draft: 0,
		active: 0,
		halted: 0,
		shipped: 0,
		archived: 0,
	}),
	needsYou: 0,
};

// ---------------------------------------------------------------------------
// Rendering: the real app through the real router, signed in, with a query
// cache seeded the way the browser's requests would fill it.

type Seed = (client: QueryClient) => void;

async function render(path: string, ...seeds: Seed[]): Promise<string> {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
				retryOnMount: false,
				staleTime: Number.POSITIVE_INFINITY,
			},
		},
	});
	for (const seed of seeds) seed(queryClient);
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

const withTemplates =
	(rows: Template[]): Seed =>
	(client) =>
		client.setQueryData(queryKeys.templates.list().slice(), rows);

const withTemplate =
	(row: Template): Seed =>
	(client) =>
		client.setQueryData(queryKeys.templates.detail(row.slug).slice(), row);

const page = <T,>(rows: T[]) => ({
	pages: [{ data: rows, meta: { nextCursor: null, total: rows.length } }],
	pageParams: [undefined],
});

/** The playbooks and teams the cards link to. */
const withLinks: Seed = (client) => {
	client.setQueryData(
		queryKeys.playbooks.list(PLAYBOOK_PAGE_SIZE).slice(),
		page([PLAYBOOK]),
	);
	// The team is read by its id, as the cards and the banner read it.
	client.setQueryData(queryKeys.presets.detail(TEAM.id).slice(), TEAM);
};

/** One origin's missions built from template-booking, as the server pages them. */
const withMissions =
	(origin: MissionOrigin, rows: MissionListItem[], total = rows.length): Seed =>
	(client) =>
		client.setQueryData(
			queryKeys.templateMissions
				.list("template-booking", origin, TEMPLATE_MISSIONS_PAGE)
				.slice(),
			{
				pages: [
					{
						data: rows,
						meta: {
							nextCursor: total > rows.length ? "next" : null,
							total,
							counts: NO_COUNTS,
						},
					},
				],
				pageParams: [undefined],
			},
		);

const failing =
	(key: readonly unknown[], status: number, code: "NOT_FOUND" | "INTERNAL") =>
	(client: QueryClient): void => {
		client
			.getQueryCache()
			.build(client, { queryKey: [...key] })
			.setState({
				status: "error",
				fetchStatus: "idle",
				error: new ApiError({
					method: "GET",
					path: "/api/templates",
					kind: "contract",
					status,
					code,
					message: "for logs only",
					requestId: "req-1",
				}),
			});
	};

/** One element by test id, from its opening tag to its matching close. */
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
		if (depth === 0) return html.slice(start, m.index + m[0].length);
	}
	return html.slice(start);
}

const text = (html: string) => html.replaceAll("<!-- -->", "");

// ---------------------------------------------------------------------------

describe("/templates, the board", () => {
	it("shows a card per template by default, each opening its page", async () => {
		const html = await render(
			"/templates",
			withTemplates([BOOKING, AUDIT, LEGACY]),
			withLinks,
		);
		expect(tagOf(html, "template-list")).toContain('data-state="success"');
		expect(html).not.toContain('data-testid="template-table"');
		expect(tagOf(html, "templates-view-board")).toContain(
			'aria-pressed="true"',
		);
		expect(tagOf(html, "template-card-link-template-booking")).toContain(
			'href="/templates/template-booking"',
		);
		expect(text(html)).toContain("3 templates");
	});

	it("sets each card at the reference's density: tile, name, two lines, tags, numbers", async () => {
		const html = await render(
			"/templates",
			withTemplates([BOOKING]),
			withLinks,
		);
		const card = text(element(html, "template-card-template-booking"));
		expect(card).toContain('data-testid="template-card-tile-template-booking"');
		expect(card).toContain(">Booking<");
		// Two lines of what it is: the contract has no description, so the
		// scope's and starting state's own sentences (docs/TEMPLATES.md).
		const description = element(
			html,
			"template-card-description-template-booking",
		);
		expect(description).toContain("line-clamp-2");
		expect(text(description)).toContain(
			"Schema through UI. Starts from an empty repository.",
		);
		expect(
			text(element(html, "template-card-scope-template-booking")),
		).toContain(">Full stack<");
		expect(
			text(element(html, "template-card-state-template-booking")),
		).toContain(">Greenfield<");
		// Footer: its real numbers, missions and the playbook's gates.
		expect(
			text(element(html, "template-card-missions-template-booking")),
		).toContain(">3 missions<");
		expect(
			text(element(html, "template-card-gates-template-booking")),
		).toContain(">2 gates<");
		// The reference's invented numbers never appear (audit D1).
		expect(visibleText(html)).not.toMatch(
			/teams?\b.*\d|h\/week|Featured|\bAI\b/,
		);
	});

	it("opens the page from the whole card, with one link in it", async () => {
		const html = await render(
			"/templates",
			withTemplates([BOOKING, AUDIT]),
			withLinks,
		);
		expect(
			element(html, "template-card-template-booking").match(/<a[\s>]/g),
		).toHaveLength(1);
		expect(tagOf(html, "template-card-link-template-booking")).toContain(
			"after:absolute",
		);
		expect(text(element(html, "template-card-gates-template-audit"))).toContain(
			"No playbook",
		);
	});

	it("says plainly when a repository cannot be read", async () => {
		const html = await render("/templates", withTemplates([LEGACY]), withLinks);
		const card = element(html, "template-card-template-legacy");
		expect(card).toContain('data-readable="false"');
		expect(text(card)).toContain("AVEL could not read this repository");
		expect(text(card)).toContain(">template-legacy<");
		expect(
			text(element(html, "template-card-unreadable-template-legacy")),
		).toContain("Not readable");
	});

	it("never says No playbook before the playbooks are read", async () => {
		const html = await render("/templates", withTemplates([AUDIT]));
		expect(
			text(element(html, "template-card-gates-template-audit")),
		).not.toContain("No playbook");
		expect(text(html)).not.toContain("No playbook");
	});

	it("subtitles the count and the real missions built from them", async () => {
		const html = await render(
			"/templates",
			withTemplates([BOOKING, AUDIT, LEGACY]),
			withLinks,
		);
		expect(text(element(html, "topbar-subtitle"))).toContain(
			"3 templates · 4 missions built from them",
		);
		expect(templatesSubtitle([AUDIT])).toBe(
			"1 template · no missions built from them yet",
		);
	});
});

describe("/templates, Recently used", () => {
	const used =
		(slug: string, origin: MissionOrigin, at: string | null): Seed =>
		(client) =>
			client.setQueryData(
				["missions", "byTemplate", slug, { origin, limit: 1 }],
				{
					data: at ? [{ ...CLIENT_MISSION, lastActivityAt: at }] : [],
					meta: { nextCursor: null, total: at ? 1 : 0, counts: NO_COUNTS },
				},
			);

	it("shows the templates with the newest mission activity, each as a wider card", async () => {
		const html = await render(
			"/templates",
			withTemplates([BOOKING, AUDIT, LEGACY]),
			withLinks,
			used("template-booking", "client", "2026-10-06T09:00:00.000Z"),
			used("template-booking", "internal", "2026-10-08T09:00:00.000Z"),
			used("template-legacy", "client", "2026-10-01T09:00:00.000Z"),
			used("template-legacy", "internal", null),
		);
		const row = element(html, "templates-recent");
		// Booking (Oct 8, its newest origin) before Legacy (Oct 1); Audit has
		// no missions, so it is never read and never listed.
		expect(row.indexOf("template-recent-template-booking")).toBeLessThan(
			row.indexOf("template-recent-template-legacy"),
		);
		expect(row).not.toContain("template-recent-template-audit");
		// The cover band, then the flow: scope, playbook and version, team.
		expect(row).toContain(
			'data-testid="template-recent-cover-template-booking"',
		);
		const flow = text(element(html, "template-recent-flow-template-booking"));
		expect(flow).toContain(">Full stack<");
		expect(flow).toContain(">Template booking<");
		expect(flow).toContain(">Playbook v4<");
		expect(flow).toContain("Booking squad");
		// New mission is there, and disabled with the one reason.
		const create = tagOf(html, "template-recent-new-mission-template-booking");
		expect(create).toMatch(/\sdisabled=""/);
		expect(html).toContain(NOT_YET["mission.create"]);
	});

	it("is absent until a template has been used", async () => {
		const html = await render("/templates", withTemplates([AUDIT]), withLinks);
		expect(html).not.toContain('data-testid="templates-recent"');
	});

	it("ranks by the newest activity, at most three", () => {
		const t = (slug: string) => ({ ...BOOKING, slug });
		const last = new Map([
			["a", "2026-10-01T00:00:00.000Z"],
			["b", "2026-10-04T00:00:00.000Z"],
			["c", "2026-10-03T00:00:00.000Z"],
			["d", "2026-10-02T00:00:00.000Z"],
		]);
		expect(
			recentTemplates([t("a"), t("b"), t("c"), t("d"), t("e")], last).map(
				(r) => r.template.slug,
			),
		).toEqual(["b", "c", "d"]);
	});
});

describe("/templates, the filters", () => {
	it("offers each scope and starting state present, with counts, as segmented controls", async () => {
		const html = await render(
			"/templates",
			withTemplates([BOOKING, AUDIT, LEGACY]),
			withLinks,
		);
		const scope = text(element(html, "templates-scope"));
		expect(scope).toMatch(/All<span[^>]*>3</);
		expect(scope).toMatch(/Full stack<span[^>]*>1</);
		expect(scope).toMatch(/Audit<span[^>]*>1</);
		expect(scope).not.toContain("Frontend");
		expect(tagOf(html, "templates-scope-all")).toContain('aria-pressed="true"');
		expect(text(element(html, "templates-state"))).toMatch(
			/Brownfield<span[^>]*>1</,
		);
	});

	it("narrows the board to the URL's scope, and says when nothing matches", async () => {
		const html = await render(
			"/templates?scope=audit",
			withTemplates([BOOKING, AUDIT]),
			withLinks,
		);
		expect(tagOf(html, "templates-scope-audit")).toContain(
			'aria-pressed="true"',
		);
		const board = element(html, "template-board");
		expect(board).toContain("template-card-template-audit");
		expect(board).not.toContain("template-card-template-booking");
		const none = await render(
			"/templates?q=nothing-like-this",
			withTemplates([BOOKING, AUDIT]),
			withLinks,
		);
		expect(none).toContain('data-testid="templates-no-match"');
	});

	it("puts the search under / and says so", async () => {
		const html = await render(
			"/templates",
			withTemplates([BOOKING]),
			withLinks,
		);
		// The shared SearchField: its "/" and its key hint.
		expect(tagOf(html, "templates-search-input")).toContain(
			'aria-keyshortcuts="/"',
		);
		expect(text(element(html, "templates-search-kbd"))).toContain(">/<");
	});

	it("keeps a typed trailing space when the trimmed q comes back from the URL", () => {
		// The debounce writes "web" for "web ": the draft must not lose its space.
		expect(draftFor("web ", "web")).toBe("web ");
		// A different q (Back, a link) replaces the draft.
		expect(draftFor("web ", "booking")).toBe("booking");
		expect(draftFor("web", "")).toBe("");
	});

	it("filters and sorts by name, slug and scope; most missions first by default", () => {
		const none = new Map<string, string>();
		const rows = [AUDIT, BOOKING, LEGACY];
		expect(
			filterTemplates(rows, { q: "", sort: "missions" }, none).map(
				(t) => t.slug,
			),
		).toEqual(["template-booking", "template-legacy", "template-audit"]);
		expect(
			filterTemplates(rows, { q: "", sort: "name" }, none).map((t) => t.slug),
		).toEqual(["template-audit", "template-booking", "template-legacy"]);
		expect(
			filterTemplates(rows, { q: "full stack", sort: "name" }, none).map(
				(t) => t.slug,
			),
		).toEqual(["template-booking"]);
		expect(
			filterTemplates(
				rows,
				{ state: "brownfield", q: "", sort: "name" },
				none,
			).map((t) => t.slug),
		).toEqual(["template-audit"]);
		const last = new Map([["template-legacy", "2026-10-09T00:00:00.000Z"]]);
		expect(
			filterTemplates(rows, { q: "", sort: "recent" }, last)[0]?.slug,
		).toBe("template-legacy");
	});
});

describe("/templates?view=table", () => {
	it("lists every template as a row, linked to its page", async () => {
		const html = await render(
			"/templates?view=table",
			withTemplates([BOOKING, LEGACY]),
			withLinks,
		);
		expect(tagOf(html, "templates-view-table")).toContain(
			'aria-pressed="true"',
		);
		expect(html).not.toContain('data-testid="template-board"');
		const table = text(element(html, "template-table"));
		expect(tagOf(table, "template-row-link-template-booking")).toContain(
			'href="/templates/template-booking"',
		);
		expect(table).toContain(">Full stack<");
		expect(table).toContain(`>${SHA.slice(0, 7)}<`);
		expect(table).toContain(">3<");
		expect(table).toContain(
			'data-testid="template-row-unreadable-template-legacy"',
		);
		expect(table).toContain(">Unknown<");
	});

	it("opens a row from anywhere on it, and keeps the cell links and Copy their own", async () => {
		const html = await render(
			"/templates?view=table",
			withTemplates([BOOKING]),
			withLinks,
		);
		const table = element(html, "template-table");
		// The name link stretches over the row (v3 UX 5).
		expect(tagOf(table, "template-row-link-template-booking")).toMatch(
			/class="[^"]*after:absolute[^"]*after:inset-0/,
		);
		// Every other control in the row sits above that stretch.
		const raised = [...table.matchAll(/class="[^"]*\brelative z-10\b/g)];
		expect(raised.length).toBeGreaterThanOrEqual(2);
	});
});

describe("/templates, the four states", () => {
	it("shows a skeleton while loading", async () => {
		const html = await render("/templates");
		expect(tagOf(html, "template-list")).toContain('data-state="loading"');
		expect(html).toContain('data-testid="template-list-skeleton"');
	});

	it("says what a template is when there are none", async () => {
		const html = await render("/templates", withTemplates([]));
		expect(tagOf(html, "template-list")).toContain('data-state="empty"');
		expect(html).toContain('data-testid="templates-empty"');
	});

	it("shows the error map's copy on failure", async () => {
		const html = await render(
			"/templates",
			failing(queryKeys.templates.list(), 500, "INTERNAL"),
		);
		expect(tagOf(html, "template-list")).toContain('data-state="error"');
		expect(html).toContain('data-testid="surface-error"');
	});
});

describe("/templates/$slug, one template's page", () => {
	const PAGE = "/templates/template-booking";

	it("titles the tab by the slug and heads the page with the banner", async () => {
		const html = await render(PAGE, withTemplate(BOOKING), withLinks);
		expect(html).toContain(
			"<title>template-booking · Templates · AVEL</title>",
		);
		expect(tagOf(html, "template-detail-surface")).toContain(
			'data-state="success"',
		);
		expect(tagOf(html, "template-banner-back")).toContain('href="/templates"');
		expect(text(element(html, "template-banner-facts"))).toContain(
			"Full stack · Greenfield · template-booking",
		);
		expect(text(element(html, "template-banner-status"))).toContain("Readable");
	});

	it("shows its live numbers and opens its playbook and team", async () => {
		const html = await render(PAGE, withTemplate(BOOKING), withLinks);
		expect(text(element(html, "template-stat-missions"))).toContain(">3<");
		expect(text(element(html, "template-stat-version"))).toContain(">v4<");
		expect(text(element(html, "template-stat-gates"))).toContain(">2<");
		expect(tagOf(html, "template-open-playbook")).toContain(
			'href="/playbooks/template-booking"',
		);
		expect(tagOf(html, "template-open-team")).toContain(
			`href="/presets?preset=${TEAM.id}"`,
		);
		expect(text(element(html, "template-banner-tab-missions-count"))).toContain(
			">3<",
		);
	});

	it("shows the manifest's fields and the full commit on Overview", async () => {
		const html = await render(PAGE, withTemplate(BOOKING), withLinks);
		const manifest = text(element(html, "template-manifest"));
		expect(manifest).toContain(">Booking<");
		expect(manifest).toContain(">Greenfield<");
		expect(manifest).toContain(`>${SHA}<`);
	});

	it("summarises the playbook on Playbook", async () => {
		const html = await render(
			`${PAGE}?tab=playbook`,
			withTemplate(BOOKING),
			withLinks,
		);
		const summary = text(element(html, "template-playbook-summary"));
		expect(summary).toContain(">v4<");
		expect(summary).toContain(">A B C<");
		expect(summary).toContain("1 mandatory, 1 warn");
		expect(tagOf(html, "template-playbook-open")).toContain(
			'href="/playbooks/template-booking"',
		);
	});

	it("lists the missions built from it, per origin, each opening its mission", async () => {
		const html = await render(
			`${PAGE}?tab=missions`,
			withTemplate(BOOKING),
			withLinks,
			withMissions("client", [CLIENT_MISSION], 2),
			withMissions("internal", []),
		);
		expect(tagOf(html, "template-missions-client")).toContain(
			'data-state="success"',
		);
		expect(tagOf(html, `template-mission-${CLIENT_MISSION.id}`)).toContain(
			`href="/missions/${CLIENT_MISSION.id}"`,
		);
		const row = text(element(html, `template-mission-${CLIENT_MISSION.id}`));
		expect(row).toContain("Acme, Booking site");
		expect(row).toContain(">sprint 1<");
		// The count is the server's total, not the rows loaded.
		expect(text(element(html, "template-missions-client-count"))).toContain(
			">2 missions<",
		);
		expect(html).toContain('data-testid="template-missions-client-more"');
		// No loose line above the panels: each panel says what it counts.
		expect(html).not.toContain("template-missions-total");
		expect(text(element(html, "template-missions-client-panel"))).toContain(
			"Deleted missions are not counted.",
		);
		expect(tagOf(html, "template-missions-internal")).toContain(
			'data-state="empty"',
		);
		expect(text(element(html, "template-missions-internal-count"))).toContain(
			">No missions<",
		);
		expect(html).not.toContain('data-state="not-built"');
	});

	it("shows each origin's skeleton until its list is read", async () => {
		const html = await render(
			`${PAGE}?tab=missions`,
			withTemplate(BOOKING),
			withLinks,
		);
		for (const origin of ["client", "internal"]) {
			expect(tagOf(html, `template-missions-${origin}`)).toContain(
				'data-state="loading"',
			);
			expect(html).toContain(
				`data-testid="template-missions-${origin}-count-loading"`,
			);
		}
	});

	it("draws the card's cover as a strip on Overview, with what it starts as", async () => {
		const html = await render(PAGE, withTemplate(BOOKING), withLinks);
		expect(element(html, "template-cover-strip-art")).toContain(
			'data-motif="full-stack"',
		);
		expect(text(element(html, "template-cover-strip-sentence"))).toContain(
			"Starts from an empty repository. Full stack: Schema through UI.",
		);
	});

	it("states an unreadable repository on the page", async () => {
		const html = await render(
			"/templates/template-legacy",
			withTemplate(LEGACY),
			withLinks,
		);
		expect(text(element(html, "template-banner-status"))).toContain(
			"Not readable",
		);
		expect(html).toContain('data-testid="template-manifest-unreadable"');
	});

	it("shows a skeleton, a not-found page and the error map's copy", async () => {
		const loading = await render(PAGE);
		expect(tagOf(loading, "template-detail-surface")).toContain(
			'data-state="loading"',
		);
		expect(loading).toContain('data-testid="template-detail-skeleton"');
		const missing = await render(
			PAGE,
			failing(queryKeys.templates.detail("template-booking"), 404, "NOT_FOUND"),
		);
		expect(missing).toContain('data-testid="template-detail-not-found"');
		const failed = await render(
			PAGE,
			failing(queryKeys.templates.detail("template-booking"), 500, "INTERNAL"),
		);
		expect(tagOf(failed, "template-detail-surface")).toContain(
			'data-state="error"',
		);
		expect(failed).toContain('data-testid="surface-error"');
	});
});

describe("templateMissionsQuery", () => {
	it("asks missions.list for one origin, scoped by the template's slug", async () => {
		const asked: unknown[] = [];
		const api = {
			missions: {
				list: async (args: unknown) => {
					asked.push(args);
					return {
						status: 200,
						headers: new Headers(),
						body: {
							success: true,
							data: [],
							meta: { nextCursor: null, total: 0, counts: NO_COUNTS },
						},
					};
				},
			},
		} as unknown as ApiClient;
		const query = templateMissionsQuery(api, "template-booking", "internal");
		await query.queryFn?.({
			pageParam: undefined,
			queryKey: query.queryKey,
			signal: new AbortController().signal,
			meta: undefined,
			direction: "forward",
			client: new QueryClient(),
		} as never);
		expect(asked).toEqual([
			{
				query: expect.objectContaining({
					origin: "internal",
					templateRef: "template-booking",
				}),
			},
		]);
		// Under "missions", so a mission write reads it again.
		expect(query.queryKey[0]).toBe("missions");
	});
});

describe("TemplateCover", () => {
	const cover = (slug: string, image?: typeof COVER) =>
		renderToString(
			<TemplateCover
				template={{ ...BOOKING, slug }}
				image={image}
				data-testid="cover"
			/>,
		);
	const art = (html: string) =>
		element(html, "cover-art").replace(/cover-hatch-[\w-]+/g, "");

	it("draws the same art for the same slug, and varies it by slug", () => {
		expect(art(cover("template-booking"))).toBe(art(cover("template-booking")));
		expect(art(cover("template-booking"))).not.toBe(
			art(cover("template-booking-two")),
		);
	});

	it("shows the manifest's cover with its own alt text in place of the art", () => {
		const html = cover("template-booking", COVER);
		const img = tagOf(html, "cover-image");
		expect(img).toContain(`alt="${COVER.alt}"`);
		// The URL is used as served: same-origin, with the commit in it.
		expect(img).toContain(
			`src="/api/templates/template-booking/cover?sha=${SHA}"`,
		);
		expect(html).not.toContain('data-testid="cover-art"');
		expect(tagOf(html, "cover")).toContain('data-cover="image"');
	});

	it("draws the art when the manifest names no cover", () => {
		const html = cover("template-booking", undefined);
		expect(html).toContain('data-testid="cover-art"');
		expect(tagOf(html, "cover")).toContain('data-cover="generated"');
	});

	it("shows the manifest's cover on the template's page, and the drawn art on its card", async () => {
		const board = await render(
			"/templates",
			withTemplates([COVERED, AUDIT]),
			withLinks,
			(client) =>
				client.setQueryData(
					[
						"missions",
						"byTemplate",
						"template-booking",
						{ origin: "client", limit: 1 },
					],
					{
						data: [CLIENT_MISSION],
						meta: { nextCursor: null, total: 1, counts: NO_COUNTS },
					},
				),
		);
		// The card keeps the drawn art on the flat band: a repository's own
		// image brings its own colours (v3: no decorative hues).
		expect(tagOf(board, "template-recent-cover-template-booking")).toContain(
			'data-cover="generated"',
		);
		expect(board).not.toContain(COVER.url);
		const page = await render(
			"/templates/template-booking",
			withTemplate(COVERED),
			withLinks,
		);
		expect(tagOf(page, "template-cover-strip-image")).toContain(
			`alt="${COVER.alt}"`,
		);
	});
});
