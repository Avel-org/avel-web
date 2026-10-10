import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { type Playbook, playbookSchema } from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { gateSummary } from "@/components/avel/playbook-list";
import { ApiError, ApiOverrideProvider, queryKeys } from "@/lib/api";
import { PLAYBOOK_PAGE_SIZE } from "@/lib/api/playbooks";
import { SessionSourceProvider } from "@/lib/auth";
import { routeTree } from "@/routeTree.gen";
import { signedIn } from "./auth-session";
import { tagOf } from "./render-page";

// ---------------------------------------------------------------------------
// Fixtures, parsed through the contract's own schema.

const PRESET = "00000000-0000-4000-8000-000000000301";

function playbook(n: number, extra: Partial<Playbook> = {}): Playbook {
	return playbookSchema.parse({
		id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
		missionType: "full-build",
		name: "Full build",
		wavesApplicable: ["A", "B", "C"],
		gates: [
			{ gate: "phase1-close", policy: "mandatory" },
			{ gate: "qa", policy: "mandatory" },
			{ gate: "security", policy: "warn" },
		],
		deliverable: "pr",
		requiredFields: ["repoUrl", "spendCeilingUsd"],
		defaultPresetId: PRESET,
		version: 3,
		createdAt: "2026-10-01T00:00:00.000Z",
		updatedAt: "2026-10-09T00:00:00.000Z",
		...extra,
	});
}

const FULL_BUILD = playbook(1);
const DISCOVERY = playbook(2, {
	missionType: "discovery",
	name: "Discovery",
	wavesApplicable: ["B"],
	gates: [],
	deliverable: "recommendation",
	requiredFields: [],
	version: 1,
});

// ---------------------------------------------------------------------------
// Rendering: the real app through the real router, signed in, with a query
// cache seeded the way the browser's requests would fill it.

async function render(
	path: string,
	seed: (client: QueryClient) => void = () => {},
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

const listKey = () => queryKeys.playbooks.list(PLAYBOOK_PAGE_SIZE).slice();

const withList =
	(rows: Playbook[], total: number | undefined = rows.length) =>
	(client: QueryClient): void => {
		client.setQueryData(listKey(), {
			pages: [
				{
					data: rows,
					meta:
						total === undefined
							? { nextCursor: null }
							: { nextCursor: null, total },
				},
			],
			pageParams: [undefined],
		});
	};

const withPlaybook =
	(row: Playbook) =>
	(client: QueryClient): void => {
		client.setQueryData(
			queryKeys.playbooks.byType(row.missionType).slice(),
			row,
		);
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
					path: "/api/playbooks",
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

describe("gateSummary", () => {
	it("counts each policy as stored, and leaves out one no gate has", () => {
		expect(gateSummary(FULL_BUILD.gates)).toBe("2 mandatory, 1 warn");
		expect(gateSummary([{ gate: "qa", policy: "warn" }])).toBe("1 warn");
		expect(gateSummary([])).toBe("No gates");
	});
});

describe("/playbooks", () => {
	it("lists each playbook from the contract, linked to its mission type", async () => {
		const html = await render("/playbooks", withList([FULL_BUILD, DISCOVERY]));
		const table = element(html, "playbook-table");
		expect(tagOf(table, "playbook-row-link-full-build")).toContain(
			'href="/playbooks/full-build"',
		);
		expect(tagOf(table, "playbook-row-link-discovery")).toContain(
			'href="/playbooks/discovery"',
		);
		expect(table).toContain(">Full build<");
		expect(table).toContain(">Pull request<");
		expect(table).toContain(">Recommendation<");
		expect(table).toContain(">A B C<");
		expect(table).toContain(">v3<");
		expect(text(table)).toContain("2 mandatory, 1 warn");
		expect(text(table)).toContain("No gates");
	});

	it("counts from meta.total in the top bar and under the table", async () => {
		const html = text(
			// Two loaded of five: the count is the server's, not the rows'.
			await render("/playbooks", withList([FULL_BUILD, DISCOVERY], 5)),
		);
		expect(html).toContain("5 playbooks");
		expect(element(html, "playbooks-showing")).toContain("Showing 2 of 5");
	});

	it("has no write controls", async () => {
		const html = await render("/playbooks", withList([FULL_BUILD]));
		expect(element(html, "playbooks")).not.toMatch(/<button(?![^>]*load-more)/);
	});

	it("says what a playbook is when there are none", async () => {
		const html = await render("/playbooks", withList([], 0));
		expect(tagOf(html, "playbook-list")).toContain('data-state="empty"');
		expect(html).toContain('data-testid="playbooks-empty"');
	});

	it("shows a skeleton while loading, and the error map's copy on failure", async () => {
		const loading = await render("/playbooks");
		expect(tagOf(loading, "playbook-list")).toContain('data-state="loading"');
		expect(loading).toContain('data-testid="playbook-list-skeleton"');
		const failed = await render(
			"/playbooks",
			failing(listKey(), 500, "INTERNAL"),
		);
		expect(tagOf(failed, "playbook-list")).toContain('data-state="error"');
	});
});

describe("/playbooks/$missionType", () => {
	it("titles the tab by the mission type and crumbs back to Playbooks", async () => {
		const html = await render(
			"/playbooks/full-build",
			withPlaybook(FULL_BUILD),
		);
		expect(html).toContain("<title>full-build · Playbooks · AVEL</title>");
		expect(html).toMatch(/href="\/playbooks"[^>]*>Playbooks</);
	});

	it("shows the header from the contract", async () => {
		const header = text(
			element(
				await render("/playbooks/full-build", withPlaybook(FULL_BUILD)),
				"playbook-detail-header",
			),
		);
		expect(header).toContain(">Full build<");
		expect(header).toContain(">full-build<");
		expect(header).toContain(">Pull request<");
		expect(header).toContain(">v3<");
		expect(header).toContain('dateTime="2026-10-09T00:00:00.000Z"');
	});

	it("marks the waves the playbook runs, and no others", async () => {
		const html = await render(
			"/playbooks/full-build",
			withPlaybook(FULL_BUILD),
		);
		for (const wave of ["A", "B", "C"]) {
			expect(tagOf(html, `playbook-wave-${wave}`)).toContain(
				'data-applicable="true"',
			);
		}
		for (const wave of ["D", "E"]) {
			expect(tagOf(html, `playbook-wave-${wave}`)).toContain(
				'data-applicable="false"',
			);
		}
	});

	it("lists each declared gate with its policy as stored, and only those", async () => {
		const gates = element(
			await render("/playbooks/full-build", withPlaybook(FULL_BUILD)),
			"playbook-section-gates",
		);
		expect(tagOf(gates, "playbook-gate-phase1-close")).toContain(
			'data-policy="mandatory"',
		);
		expect(tagOf(gates, "playbook-gate-security")).toContain(
			'data-policy="warn"',
		);
		expect(element(gates, "playbook-gate-security")).toContain(">Warn<");
		expect(gates).not.toContain("playbook-gate-rollback");
	});

	it("says so for no gates and no required fields", async () => {
		const html = await render("/playbooks/discovery", withPlaybook(DISCOVERY));
		expect(element(html, "playbook-section-gates")).toContain(
			"No gates declared.",
		);
		expect(element(html, "playbook-section-fields")).toContain(
			"None required.",
		);
	});

	it("lists required fields, and links the default preset", async () => {
		const html = await render(
			"/playbooks/full-build",
			withPlaybook(FULL_BUILD),
		);
		const fields = element(html, "playbook-section-fields");
		expect(fields).toContain(">repoUrl<");
		expect(fields).toContain(">spendCeilingUsd<");
		expect(tagOf(html, "playbook-preset-link")).toContain(
			`href="/presets?preset=${PRESET}"`,
		);
	});

	it("has no write controls", async () => {
		const html = await render(
			"/playbooks/full-build",
			withPlaybook(FULL_BUILD),
		);
		expect(element(html, "playbook-detail-content")).not.toContain("<button");
	});

	it("answers a type with no playbook with NOT_FOUND and a way back", async () => {
		const html = await render(
			"/playbooks/nothing",
			failing(queryKeys.playbooks.byType("nothing"), 404, "NOT_FOUND"),
		);
		expect(tagOf(html, "playbook-detail")).toContain('data-state="error"');
		expect(tagOf(html, "playbook-detail-back")).toContain('href="/playbooks"');
	});

	it("offers no way back for a failure that is not NOT_FOUND", async () => {
		const html = await render(
			"/playbooks/full-build",
			failing(queryKeys.playbooks.byType("full-build"), 500, "INTERNAL"),
		);
		expect(tagOf(html, "playbook-detail")).toContain('data-state="error"');
		expect(html).not.toContain("playbook-detail-back");
	});
});
