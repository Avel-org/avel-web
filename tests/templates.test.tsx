import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import {
	type Playbook,
	playbookSchema,
	type Template,
	templateSchema,
} from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiError, ApiOverrideProvider, queryKeys } from "@/lib/api";
import { PLAYBOOK_PAGE_SIZE } from "@/lib/api/playbooks";
import { SessionSourceProvider } from "@/lib/auth";
import { routeTree } from "@/routeTree.gen";
import { signedIn } from "./auth-session";
import { preset } from "./presets-fixtures";
import { tagOf } from "./render-page";

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
});

const AUDIT: Template = templateSchema.parse({
	slug: "template-audit",
	readable: true,
	name: "Audit",
	scope: "audit",
	startingState: "brownfield",
	latestSha: "f".repeat(40),
	defaultPresetId: null,
	missionCount: 0,
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

	it("shows the name, slug, scope, starting state, short commit and missions", async () => {
		const html = await render(
			"/templates",
			withTemplates([BOOKING]),
			withLinks,
		);
		const card = text(element(html, "template-card-template-booking"));
		expect(card).toContain(">Booking<");
		expect(card).toContain(">template-booking<");
		expect(card).toContain(">Full stack<");
		expect(card).toContain(">Greenfield<");
		expect(card).toContain(`>${SHA.slice(0, 8)}<`);
		expect(card).toContain(`title="${SHA}"`);
		expect(card).toContain(">3 missions<");
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
			"Playbook v4",
		);
		const team = tagOf(html, "template-team-template-booking");
		expect(team).toContain(`href="/presets?preset=${TEAM.id}"`);
		expect(text(element(html, "template-team-template-booking"))).toContain(
			"Booking squad",
		);
		// The card's own link holds only the name: no link inside a link.
		expect(
			element(html, "template-card-link-template-booking").match(/<a[\s>]/g),
		).toHaveLength(1);
		// A template with no playbook says so, and has no team.
		expect(text(element(html, "template-playbook-template-audit"))).toContain(
			"No playbook",
		);
		expect(html).not.toContain('data-testid="template-team-template-audit"');
	});

	it("says plainly when a repository cannot be read", async () => {
		const html = await render("/templates", withTemplates([LEGACY]), withLinks);
		const card = element(html, "template-card-template-legacy");
		expect(card).toContain('data-readable="false"');
		expect(text(card)).toContain("AVEL could not read this repository");
		expect(text(card)).toContain(">template-legacy<");
		expect(card).not.toContain('data-testid="template-card-sha"');
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
		expect(table).toContain(`>${SHA.slice(0, 8)}<`);
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

	it("searches Missions by the slug, and says the filtered list is not built", async () => {
		const html = await render(
			`${PAGE}?tab=missions`,
			withTemplate(BOOKING),
			withLinks,
		);
		expect(tagOf(html, "template-missions-search")).toContain(
			'href="/missions?q=template-booking"',
		);
		expect(tagOf(html, "template-missions")).toContain(
			'data-state="not-built"',
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
