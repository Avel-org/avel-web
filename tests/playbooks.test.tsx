import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { type Playbook, playbookSchema } from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InlineModals } from "@/components/avel/action-modal";
import { PlaybookBuilderBody } from "@/components/avel/playbook-builder";
import { gateSummary } from "@/components/avel/playbook-list";
import { draftOf, draftReducer } from "@/components/avel/playbook-pipeline";
import { PublishConfirm } from "@/components/avel/playbook-publish";
import { PlaybookVersions } from "@/components/avel/playbook-versions";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
	ApiError,
	ApiOverrideProvider,
	ApiProvider,
	queryKeys,
} from "@/lib/api";
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
	...seeds: ((client: QueryClient) => void)[]
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
	for (const seed of seeds) seed(queryClient);
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: [path] }),
	});
	await router.load();
	return renderToString(
		<SessionSourceProvider source={signedIn()}>
			<ApiOverrideProvider queryClient={queryClient}>
				<InlineModals>
					<RouterProvider router={router} />
				</InlineModals>
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
	it("shows a board by default: a card per playbook, opening its builder", async () => {
		const html = await render("/playbooks", withList([FULL_BUILD, DISCOVERY]));
		expect(html).not.toContain('data-testid="playbook-table"');
		expect(tagOf(html, "playbooks-view-board")).toContain(
			'aria-pressed="true"',
		);
		expect(tagOf(html, "playbook-card-full-build")).toContain(
			'href="/playbooks/full-build"',
		);
		const strip = element(html, "playbook-card-waves-full-build");
		expect(strip.match(/data-runs="true"/g)).toHaveLength(3);
		expect(strip.match(/data-runs="false"/g)).toHaveLength(2);
		expect(text(element(html, "playbook-card-discovery"))).toContain(
			"No gates",
		);
	});

	it("lists each playbook in the table view, linked to its builder", async () => {
		const html = await render(
			"/playbooks?view=table",
			withList([FULL_BUILD, DISCOVERY]),
		);
		expect(tagOf(html, "playbooks-view-table")).toContain(
			'aria-pressed="true"',
		);
		expect(html).not.toContain('data-testid="playbook-board"');
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

describe("/playbooks/$missionType, the builder", () => {
	const PAGE = "/playbooks/full-build";

	it("titles the tab by the mission type, crumbs back, and shows the version", async () => {
		const html = await render(PAGE, withPlaybook(FULL_BUILD));
		expect(html).toContain("<title>full-build · Playbooks · AVEL</title>");
		expect(html).toMatch(/href="\/playbooks"[^>]*>Playbooks</);
		expect(element(html, "playbook-version-pill")).toContain(">v3<");
	});

	it("has Builder, Runs and Versions tabs; Runs and Versions are not built", async () => {
		const html = await render(PAGE, withPlaybook(FULL_BUILD));
		expect(tagOf(html, "playbook-tab-builder")).toContain(
			'aria-selected="true"',
		);
		expect(html).toContain('data-testid="playbook-tab-runs"');
		expect(html).toContain('data-testid="playbook-tab-versions"');
	});

	it("draws every wave, the skipped ones as stubs, then gates, then the deliverable", async () => {
		const canvas = element(
			await render(PAGE, withPlaybook(FULL_BUILD)),
			"playbook-canvas",
		);
		for (const wave of ["A", "B", "C"]) {
			expect(tagOf(canvas, `playbook-node-wave-${wave}`)).toContain(
				'data-state="live"',
			);
		}
		for (const wave of ["D", "E"]) {
			expect(tagOf(canvas, `playbook-node-wave-${wave}`)).toContain(
				'data-state="skipped"',
			);
		}
		const order = [
			"wave-E",
			"gate-phase1-close",
			"gate-qa",
			"gate-security",
			"deliverable",
		].map((id) => canvas.indexOf(`data-testid="playbook-node-${id}"`));
		expect(order).toEqual([...order].sort((a, b) => a - b));
		expect(element(canvas, "playbook-node-gate-phase1-close")).toContain(
			'data-glyph="stop"',
		);
		expect(element(canvas, "playbook-node-gate-security")).toContain(
			'data-glyph="pass"',
		);
		expect(element(canvas, "playbook-node-deliverable")).toContain(
			">Pull request<",
		);
	});

	it("makes the rail one toolbar: one node takes Tab, each says what it is", async () => {
		const canvas = element(
			await render(PAGE, withPlaybook(FULL_BUILD)),
			"playbook-canvas",
		);
		expect(canvas).toContain('role="toolbar"');
		expect(canvas.match(/tabindex="0"/g)).toHaveLength(1);
		expect(tagOf(canvas, "playbook-node-wave-A")).toContain('tabindex="0"');
		expect(tagOf(canvas, "playbook-node-gate-qa")).toContain(
			'aria-label="Gate qa, mandatory, a hard stop"',
		);
	});

	it("shows the whole playbook's properties with nothing selected", async () => {
		const panel = element(
			await render(PAGE, withPlaybook(FULL_BUILD)),
			"playbook-panel",
		);
		expect(tagOf(panel, "playbook-prop-name")).toContain('value="Full build"');
		expect(element(panel, "playbook-prop-type")).toContain(">full-build<");
		expect(tagOf(panel, "playbook-prop-wave-A")).toContain(
			'aria-checked="true"',
		);
		expect(tagOf(panel, "playbook-prop-wave-D")).toContain(
			'aria-checked="false"',
		);
		expect(tagOf(panel, "playbook-prop-gate-security")).toContain(
			'data-policy="warn"',
		);
		expect(panel).toContain('data-testid="playbook-prop-add-gate-rollback"');
		expect(panel).not.toContain('data-testid="playbook-prop-add-gate-qa"');
		expect(element(panel, "playbook-prop-fields")).toContain(">repoUrl<");
		expect(tagOf(panel, "playbook-preset-link")).toContain(
			`href="/presets?preset=${PRESET}"`,
		);
	});

	it("leaves the edit controls live: only Publish waits on a write route", async () => {
		const panel = element(
			await render(PAGE, withPlaybook(FULL_BUILD)),
			"playbook-panel",
		);
		expect(tagOf(panel, "playbook-prop-wave-A")).not.toMatch(/\sdisabled=""/);
		expect(tagOf(panel, "playbook-prop-add-gate-rollback")).not.toMatch(
			/\sdisabled=""/,
		);
		expect(tagOf(panel, "playbook-prop-remove-qa")).not.toMatch(
			/\sdisabled=""/,
		);
		expect(tagOf(panel, "playbook-prop-name")).not.toMatch(/\sdisabled=""/);
	});

	it("shows no unpublished banner for an untouched playbook", async () => {
		const html = await render(PAGE, withPlaybook(FULL_BUILD));
		expect(html).not.toContain('data-testid="playbook-dirty"');
	});

	it("says pre-flight runs per mission, and links that type's missions", async () => {
		const html = await render(PAGE, withPlaybook(FULL_BUILD));
		expect(tagOf(html, "playbook-preflight-missions")).toContain(
			'href="/missions?q=full-build"',
		);
	});

	it("says so for no gates and no required fields", async () => {
		const html = await render("/playbooks/discovery", withPlaybook(DISCOVERY));
		expect(element(html, "playbook-panel")).toContain("No gates declared.");
		expect(element(html, "playbook-panel")).toContain("None required.");
	});

	it("answers a type with no playbook with NOT_FOUND and a way back", async () => {
		const html = await render(
			"/playbooks/nothing",
			failing(queryKeys.playbooks.byType("nothing"), 404, "NOT_FOUND"),
		);
		expect(tagOf(html, "playbook-builder")).toContain('data-state="error"');
		expect(tagOf(html, "playbook-builder-back")).toContain('href="/playbooks"');
	});

	it("offers no way back for a failure that is not NOT_FOUND", async () => {
		const html = await render(
			PAGE,
			failing(queryKeys.playbooks.byType("full-build"), 500, "INTERNAL"),
		);
		expect(tagOf(html, "playbook-builder")).toContain('data-state="error"');
		expect(html).not.toContain("playbook-builder-back");
	});
});

describe("the builder with a draft", () => {
	/** The body alone, inside a memory router so its links resolve. */
	const body = async (over: Parameters<typeof PlaybookBuilderBody>[0]) => {
		const root = createRootRoute({
			component: () => (
				<ApiOverrideProvider queryClient={new QueryClient()}>
					<ApiProvider>
						<TooltipProvider>
							<PlaybookBuilderBody {...over} />
						</TooltipProvider>
					</ApiProvider>
				</ApiOverrideProvider>
			),
		});
		const router = createRouter({
			routeTree: root,
			history: createMemoryHistory({ initialEntries: ["/"] }),
		});
		await router.load();
		return renderToString(<RouterProvider router={router} />);
	};

	it("shows unpublished changes, with Revert and Publish both live", async () => {
		const html = await body({
			playbook: FULL_BUILD,
			preflight: null,
			initialDraft: draftReducer(draftOf(FULL_BUILD), {
				type: "toggleWave",
				wave: "D",
			}),
		});
		expect(html).toContain("Unpublished changes (1)");
		expect(tagOf(html, "playbook-revert")).not.toMatch(/\sdisabled=""/);
		expect(tagOf(html, "playbook-publish")).not.toMatch(/\sdisabled=""/);
		// The canvas draws the draft, not the stored playbook.
		expect(tagOf(html, "playbook-node-wave-D")).toContain('data-state="live"');
	});

	it("shows a selected node's own properties, with a way back to the whole", async () => {
		const html = await body({
			playbook: FULL_BUILD,
			preflight: null,
			initialSelected: "gate-security",
		});
		expect(element(html, "playbook-panel-heading")).toContain(
			"Gate security, warn, passes through",
		);
		expect(html).toContain('data-testid="playbook-node-props"');
		expect(html).toContain('data-testid="playbook-panel-clear"');
		expect(tagOf(html, "playbook-node-gate-security")).toContain(
			'aria-pressed="true"',
		);
		expect(tagOf(html, "playbook-node-gate-security")).toContain(
			'tabindex="0"',
		);
	});

	it("draws live connectors on, keeps skipped ones dashed, and staggers the nodes", async () => {
		const html = await body({ playbook: FULL_BUILD, preflight: null });
		const lines = html.match(/<line[^>]*>/g) ?? [];
		// A to C run, D and E are skipped: the connectors out of D and E stay dashed.
		const drawn = lines.filter((l) => l.includes("animate-draw-on"));
		const dashed = lines.filter((l) => l.includes('stroke-dasharray="3 3"'));
		expect(dashed).toHaveLength(2);
		expect(drawn).toHaveLength(lines.length - 2);
		expect(drawn.every((l) => /--draw-length:\s*\d+px/.test(l))).toBe(true);
		const wave = element(html, "playbook-node-wave-B");
		expect(wave).toMatch(/class="animate-node-in" style="--i:\s*1"/);
	});

	it("slides the banner down, and says the version publishing makes", async () => {
		const html = text(
			await body({
				playbook: FULL_BUILD,
				preflight: null,
				initialDraft: draftReducer(draftOf(FULL_BUILD), {
					type: "toggleWave",
					wave: "D",
				}),
			}),
		);
		expect(tagOf(html, "playbook-dirty")).toContain("animate-slide-down");
		const next = element(html, "playbook-next-version");
		expect(next).toContain(">v3<");
		expect(next).toMatch(/animate-tick-up[^>]*>v4</);
	});

	it("puts the caller's pre-flight in the panel", async () => {
		const html = await body({
			playbook: FULL_BUILD,
			preflight: <p data-testid="custom-preflight">coherence here</p>,
		});
		expect(element(html, "playbook-preflight")).toContain("coherence here");
	});
});

describe("publishing", () => {
	const confirm = (error: ApiError | null) =>
		renderToString(
			<TooltipProvider>
				<InlineModals>
					<PublishConfirm
						open
						onOpenChange={() => {}}
						playbook={FULL_BUILD}
						draft={draftReducer(draftOf(FULL_BUILD), {
							type: "toggleWave",
							wave: "D",
						})}
						changes={[]}
						pending={false}
						error={error}
						onSubmit={() => {}}
					/>
				</InlineModals>
			</TooltipProvider>,
		);

	it("names the version it makes, and shows the body it will send", () => {
		const html = text(confirm(null));
		expect(html).toContain(">Publish full-build<");
		expect(element(html, "playbook-publish-modal-submit")).toContain(
			"Publish v4",
		);
		expect(element(html, "playbook-publish-row-wavesApplicable")).toContain(
			">A B C D<",
		);
	});

	it("puts a refusal's issues on the row their path names", () => {
		const html = confirm(
			new ApiError({
				method: "PUT",
				path: "/api/playbooks/by-type/:missionType",
				kind: "contract",
				status: 400,
				code: "VALIDATION_FAILED",
				message: "for logs only",
				requestId: "req-1",
				details: {
					body: [
						{
							path: ["gates", 1, "gate"],
							message: "The qa gate is listed twice",
						},
						{ path: [], message: "Whole body" },
					],
				},
			}),
		);
		expect(tagOf(html, "playbook-publish-row-gates")).toContain(
			'data-invalid="true"',
		);
		expect(element(html, "playbook-publish-issue-gates")).toContain(
			"The qa gate is listed twice",
		);
		expect(html).not.toContain("playbook-publish-issue-wavesApplicable");
		expect(element(html, "action-modal-unplaced")).toContain("Whole body");
	});

	it("gives a 422 its error-map copy", () => {
		const html = confirm(
			new ApiError({
				method: "PUT",
				path: "/api/playbooks/by-type/:missionType",
				kind: "contract",
				status: 422,
				code: "PRECONDITION_FAILED",
				message: "for logs only",
				requestId: "req-1",
				details: { reason: "playbook_in_use" },
			}),
		);
		expect(text(element(html, "action-modal-refusal"))).toContain(
			"so its playbook can&#x27;t change now.",
		);
	});
});

describe("versions", () => {
	const V2 = {
		...FULL_BUILD,
		version: 2,
		wavesApplicable: ["A", "B"] as typeof FULL_BUILD.wavesApplicable,
		updatedAt: "2026-10-05T00:00:00.000Z",
	};
	const history = async (rows: Playbook[]) => {
		const client = new QueryClient({
			defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } },
		});
		client.setQueryData([...queryKeys.playbooks.versions("full-build")], rows);
		return renderToString(
			<ApiOverrideProvider queryClient={client}>
				<ApiProvider>
					<PlaybookVersions missionType="full-build" />
				</ApiProvider>
			</ApiOverrideProvider>,
		);
	};

	it("lists versions newest first, each with what it changed from the last", async () => {
		const html = text(await history([FULL_BUILD, V2]));
		expect(html.indexOf("playbook-version-3")).toBeLessThan(
			html.indexOf("playbook-version-2"),
		);
		expect(element(html, "playbook-version-changes-3")).toContain("Waves");
		expect(element(html, "playbook-version-2")).toContain("The first version.");
	});
});
