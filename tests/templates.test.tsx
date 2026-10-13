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
	type ApiClient,
	ApiError,
	ApiOverrideProvider,
	queryKeys,
} from "@/lib/api";
import { PLAYBOOK_PAGE_SIZE } from "@/lib/api/playbooks";
import {
	type MissionOrigin,
	templateMissionKeys,
	templateMissionsQuery,
} from "@/lib/api/templates";
import { SessionSourceProvider } from "@/lib/auth";
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
			templateMissionKeys.list("template-booking", origin).slice(),
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

	it("builds each card from its sections, cover first", async () => {
		const html = await render(
			"/templates",
			withTemplates([BOOKING]),
			withLinks,
		);
		const card = text(element(html, "template-card-template-booking"));
		const sections = [
			...card.matchAll(
				/data-testid="template-card-(cover|title|starts|runs|footer)-template-booking"/g,
			),
		].map((m) => m[1]);
		expect(sections).toEqual(["cover", "title", "starts", "runs", "footer"]);
		// Title: name, slug, status, and the commit in the tab, whole on hover.
		expect(card).toContain(">Booking<");
		expect(
			text(element(html, "template-card-slug-template-booking")),
		).toContain(">template-booking<");
		expect(
			text(element(html, "template-card-status-template-booking")),
		).toContain("Readable");
		const tab = text(element(html, "template-card-tab-template-booking"));
		expect(tab).toContain(`>${SHA.slice(0, 7)}<`);
		expect(tab).toContain(`title="${SHA}"`);
		expect(tab).toContain('aria-label="Copy the latest commit"');
		expect(visibleText(tab)).not.toContain(SHA);
		// Starts as: the starting state in a sentence, then the scope.
		expect(
			text(element(html, "template-card-state-sentence-template-booking")),
		).toContain("Starts from an empty repository.");
		expect(
			text(element(html, "template-card-scope-template-booking")),
		).toContain("Schema through UI.");
		// Footer: the count and the Open affordance.
		expect(
			text(element(html, "template-card-missions-template-booking")),
		).toContain(">3 missions<");
		expect(
			text(element(html, "template-card-open-template-booking")),
		).toContain("Open");
	});

	it("draws a cover from the scope and starting state, chips over it, the art hidden", async () => {
		const html = await render(
			"/templates",
			withTemplates([BOOKING, AUDIT]),
			withLinks,
		);
		const booking = element(html, "template-card-cover-template-booking-art");
		expect(booking).toContain('aria-hidden="true"');
		expect(booking).toContain('data-scope="full-stack"');
		expect(booking).toContain('data-ground="greenfield"');
		expect(booking).toContain('data-motif="full-stack"');
		const audit = element(html, "template-card-cover-template-audit-art");
		expect(audit).toContain('data-ground="brownfield"');
		expect(audit).toContain('data-motif="audit"');
		expect(
			text(element(html, "template-card-cover-template-booking-scope")),
		).toContain(">Full stack<");
		expect(
			text(element(html, "template-card-cover-template-booking-state")),
		).toContain(">Greenfield<");
		expect(
			text(element(html, "template-card-cover-template-audit-state")),
		).toContain(">Brownfield<");
		// The card names the template in text; the art adds no words.
		expect(booking).not.toMatch(/<text[\s>]/);
	});

	it("links its playbook and its default team, never nested in the card's link", async () => {
		const html = await render(
			"/templates",
			withTemplates([BOOKING, AUDIT]),
			withLinks,
		);
		expect(tagOf(html, "template-playbook-template-booking")).toContain(
			'href="/playbooks/template-booking"',
		);
		expect(text(element(html, "template-playbook-template-booking"))).toContain(
			">Template booking<",
		);
		expect(
			text(element(html, "template-playbook-meta-template-booking")),
		).toContain(">v4 · 2 gates<");
		const team = tagOf(html, "template-team-template-booking");
		expect(team).toContain(`href="/presets?preset=${TEAM.id}"`);
		expect(text(element(html, "template-team-template-booking"))).toContain(
			"Booking squad",
		);
		// The card's own link holds only the name: no link inside a link.
		expect(
			element(html, "template-card-link-template-booking").match(/<a[\s>]/g),
		).toHaveLength(1);
		// Three links on the card: the stretched title, the playbook, the team.
		expect(
			element(html, "template-card-template-booking").match(/<a[\s>]/g),
		).toHaveLength(3);
		expect(tagOf(html, "template-card-link-template-booking")).toContain(
			"after:absolute",
		);
		expect(tagOf(html, "template-playbook-template-booking")).toContain("z-10");
		expect(tagOf(html, "template-team-template-booking")).toContain("z-10");
		// A template with no playbook says so, and has no team.
		expect(text(element(html, "template-playbook-template-audit"))).toContain(
			"No playbook",
		);
		expect(html).not.toContain('data-testid="template-team-template-audit"');
		expect(text(element(html, "template-team-none-template-audit"))).toContain(
			"No default team",
		);
	});

	it("says plainly when a repository cannot be read", async () => {
		const html = await render("/templates", withTemplates([LEGACY]), withLinks);
		const card = element(html, "template-card-template-legacy");
		expect(card).toContain('data-readable="false"');
		expect(text(card)).toContain("AVEL could not read this repository");
		expect(text(card)).toContain(">template-legacy<");
		expect(card).not.toContain('data-testid="template-card-sha"');
		expect(
			text(element(html, "template-card-status-template-legacy")),
		).toContain("Not readable");
		// A muted cover, its art an empty slot: no scope or ground is guessed.
		const cover = element(html, "template-card-cover-template-legacy");
		expect(cover).toContain('data-readable="false"');
		expect(cover).toContain('data-ground="unknown"');
		expect(cover).not.toContain("data-motif");
		expect(
			text(element(html, "template-card-cover-template-legacy-unreadable")),
		).toContain("Not readable");
	});

	it("never says No playbook before the playbooks are read", async () => {
		const html = await render("/templates", withTemplates([AUDIT]));
		expect(html).toContain(
			'data-testid="template-playbook-template-audit-loading"',
		);
		expect(text(html)).not.toContain("No playbook");
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

	it("puts the template's cover on its card and its page", async () => {
		const board = await render(
			"/templates",
			withTemplates([COVERED, AUDIT]),
			withLinks,
		);
		expect(
			tagOf(board, "template-card-cover-template-booking-image"),
		).toContain(`alt="${COVER.alt}"`);
		// A template whose manifest names none keeps the drawn art.
		expect(board).toContain(
			'data-testid="template-card-cover-template-audit-art"',
		);
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
