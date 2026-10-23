import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import {
	type AgentTemplate,
	type Playbook,
	type Preset,
	type PresetAgent,
	ROLES,
} from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	CoverageGrid,
	composerRequirements,
} from "@/components/avel/preset-coverage-grid";
import { DirtyBanner } from "@/components/avel/preset-kanban";
import { TrayChip } from "@/components/avel/preset-lanes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiOverrideProvider } from "@/lib/api";
import { CATALOG_PAGE_SIZE } from "@/lib/api/catalog";
import { queryKeys } from "@/lib/api/keys";
import { PLAYBOOK_PAGE_SIZE } from "@/lib/api/playbooks";
import { PRESETS_PAGE_SIZE } from "@/lib/api/presets";
import { SessionSourceProvider } from "@/lib/auth";
import { PRECONDITION_COPY } from "@/lib/error-map";
import { routeTree } from "../src/routeTree.gen";
import { signedIn } from "./auth-session";
import { ID, preset, TEMPLATE, template } from "./presets-fixtures";
import { tagOf, textOfId } from "./render-page";

const agent = (
	n: number,
	waves: PresetAgent["waves"],
	territory: string | null = null,
): PresetAgent => ({
	agentTemplateId: TEMPLATE(n),
	waves,
	territory,
	writablePaths: null,
	estimatedTokens: null,
});

function playbook(overrides: Partial<Playbook> = {}): Playbook {
	return {
		id: ID(90),
		missionType: "booking",
		name: "Booking",
		wavesApplicable: ["A"],
		gates: [],
		deliverable: "pr",
		requiredFields: [],
		defaultPresetId: ID(1),
		version: 1,
		createdAt: "2026-10-01T09:00:00.000Z",
		updatedAt: "2026-10-01T09:00:00.000Z",
		...overrides,
	};
}

const TEMPLATES: AgentTemplate[] = [
	template(1, ["foundations", "backend-tests"]),
	template(2, ["schema"]),
	// A Firm role: shown in the palette, never rosterable.
	template(3, ["intake"]),
];

/** The real /presets page, with teams, catalog and playbooks seeded. */
async function page(
	path: string,
	presets: Preset[],
	playbooks: Playbook[] = [],
) {
	const qc = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
				retryOnMount: false,
				staleTime: Number.POSITIVE_INFINITY,
			},
		},
	});
	qc.setQueryData(queryKeys.presets.list(PRESETS_PAGE_SIZE, {}), {
		pages: [
			{ data: presets, meta: { nextCursor: null, total: presets.length } },
		],
		pageParams: [undefined],
	});
	for (const p of presets) qc.setQueryData(queryKeys.presets.detail(p.id), p);
	qc.setQueryData(queryKeys.catalog.agentTemplates(CATALOG_PAGE_SIZE), {
		pages: [{ data: TEMPLATES, meta: { nextCursor: null } }],
		pageParams: [undefined],
	});
	qc.setQueryData(queryKeys.playbooks.list(PLAYBOOK_PAGE_SIZE), {
		pages: [{ data: playbooks, meta: { nextCursor: null } }],
		pageParams: [undefined],
	});
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: [path] }),
	});
	await router.load();
	return renderToString(
		<SessionSourceProvider source={signedIn()}>
			<ApiOverrideProvider queryClient={qc}>
				<RouterProvider router={router} />
			</ApiOverrideProvider>
		</SessionSourceProvider>,
	);
}

const ONE = preset(1, {
	name: "Full build",
	version: 3,
	agents: [agent(1, ["A"]), agent(2, ["C", "D"], "Web")],
});
const TWO = preset(2, { name: "Discovery", cut: "horizontal", agents: [] });

describe("the team canvas (/presets)", () => {
	it("opens on the first team with no click: switcher, one view control, the canvas", async () => {
		const html = await page("/presets", [ONE, TWO]);
		expect(html).toContain('data-testid="presets-composer"');
		// No rail: the switcher names the team at the canvas's head.
		expect(html).not.toContain('data-testid="presets-rail"');
		expect(tagOf(html, "preset-switcher")).toContain(
			'aria-label="Team: Full build. Switch team"',
		);
		const head = html.slice(
			html.indexOf('data-testid="preset-canvas-header"'),
			html.indexOf('data-testid="preset-canvas"'),
		);
		expect(head).toContain('data-testid="preset-switcher"');
		expect(head).toContain('data-testid="preset-view"');
		expect(head).toContain('data-testid="preset-details"');
		expect(head).toContain('data-testid="preset-kanban-apply"');
		expect(html).toContain('data-testid="preset-canvas"');
		expect(html).toContain('data-testid="preset-tray"');
	});

	it("draws the switcher as a picker button, its cut and version as quiet text", async () => {
		const html = await page("/presets", [ONE, TWO]);
		const trigger = tagOf(html, "preset-switcher");
		// Nothing is typed into it: the toolbar's outline face, not a field.
		expect(trigger).not.toContain("field-surface");
		expect(trigger).toContain(
			"border border-border-strong bg-app-panel bg-clip-padding",
		);
		expect(trigger).toContain("data-[state=open]:bg-app-raised");
		// The cut is a word, not machine text: no mono tag chips.
		const meta = tagOf(html, "preset-switcher-meta");
		expect(meta).toContain("type-small");
		expect(meta).toContain("text-text-muted");
		expect(meta).not.toContain("font-mono");
		expect(tagOf(html, "preset-kanban-version")).not.toContain("font-mono");
	});

	it("selects the team the URL names", async () => {
		const html = await page(`/presets?preset=${TWO.id}`, [ONE, TWO]);
		expect(tagOf(html, "preset-switcher")).toContain(
			'aria-label="Team: Discovery. Switch team"',
		);
	});

	it("has one view control, Lanes | Coverage, and no toggle in the page's actions", async () => {
		const html = await page("/presets", [ONE]);
		expect(tagOf(html, "preset-view-lanes")).toContain('aria-pressed="true"');
		expect(tagOf(html, "preset-view-coverage")).toContain(
			'aria-pressed="false"',
		);
		// Ruling 55: Teams has no table view.
		expect(html).not.toContain('data-testid="preset-view-table"');
		const count = (re: RegExp) => html.match(re)?.length ?? 0;
		expect(count(/data-testid="preset-view"/g)).toBe(1);
		// The old page-level Board | Table and Lanes | Coverage pairs are gone.
		expect(html).not.toContain('data-testid="presets-view"');
		expect(html).not.toContain('data-testid="preset-lens-lanes"');
	});

	it("lays the team out in five wave lanes that fit the canvas, never a sideways scroll", async () => {
		const html = await page("/presets", [ONE]);
		expect(tagOf(html, "preset-kanban-wave-A")).toContain('data-count="1"');
		expect(tagOf(html, "preset-kanban-wave-B")).toContain('data-count="0"');
		expect(tagOf(html, "preset-kanban-wave-C")).toContain('data-count="1"');
		const board = tagOf(html, "preset-kanban-board");
		expect(board).toContain("xl:grid-cols-5");
		expect(board).not.toMatch(/overflow-x-(auto|scroll)/);
		expect(tagOf(html, "preset-canvas")).not.toMatch(
			/overflow-x-(auto|scroll)/,
		);
		// Each lane says what it is, not a bare letter.
		expect(html).toMatch(/<h3[^>]*>Wave A<\/h3>/);
	});

	it("puts Apply in the canvas header as a normal button, and the inspector behind Details", async () => {
		const html = await page("/presets", [ONE]);
		const apply = tagOf(html, "preset-kanban-apply");
		expect(apply).toContain('data-size="sm"');
		expect(apply).not.toMatch(/\sw-full\b/);
		expect(apply).not.toMatch(/\sdisabled=""/);
		// The inspector is a closed sheet: nothing of it renders until Details.
		expect(html).not.toContain('data-testid="preset-inspector"');
		expect(html).toMatch(
			/data-testid="preset-details"[^>]*>(?:(?!<\/button>)[\s\S])*Details<\/button>/,
		);
	});

	it("explains the drag and drop once, until dismissed", async () => {
		const html = await page("/presets", [ONE]);
		expect(html).toContain('data-testid="preset-hint"');
		expect(html).toContain("Drag an agent from the band above into a wave.");
		expect(html).toContain('data-testid="preset-hint-dismiss"');
	});

	it("guides an empty team in three steps", async () => {
		const html = await page("/presets", [TWO]);
		expect(html).toContain('data-testid="preset-empty-guide"');
		expect(html).toMatch(/Pick an agent/);
		expect(html).toMatch(/Drop it on a wave/);
	});

	it("has nothing to publish until the draft changes", async () => {
		const html = await page("/presets", [ONE]);
		expect(html).not.toContain('data-testid="preset-kanban-strip"');
	});

	it("marks an empty lane the default playbook starts in, with the reason", async () => {
		const html = await page(
			"/presets",
			[ONE],
			[playbook({ wavesApplicable: ["B", "C"] })],
		);
		expect(tagOf(html, "preset-kanban-wave-B")).toContain(
			'data-required="true"',
		);
		const zone = tagOf(html, "preset-kanban-wave-B-required");
		expect(zone).toContain("border-dashed");
		expect(zone).toContain("bg-gate-warn-banner");
		expect(html).not.toContain("preset-kanban-wave-C-required");
	});

	it("shows every agent in a band above the lanes, the lanes the canvas's full width", async () => {
		const html = await page("/presets", [ONE]);
		const band = html.slice(html.indexOf('data-testid="preset-tray"'));
		// Every template in the catalog renders, none folded or scrolled away.
		for (const t of TEMPLATES)
			expect(band).toContain(`data-testid="preset-palette-${t.slug}"`);
		const chips =
			band.match(/data-testid="preset-palette-template-\d+"/g) ?? [];
		expect(new Set(chips).size).toBe(TEMPLATES.length);
		// Above the lanes, with no left column beside them.
		expect(html.indexOf('data-testid="preset-tray"')).toBeLessThan(
			html.indexOf('data-testid="preset-kanban-board"'),
		);
		expect(element(html, "preset-canvas")).not.toMatch(/grid-cols-\[13rem/);
		expect(html).not.toContain('data-testid="preset-tray-toggle"');
		// Grouped by side, the side an eyebrow before its chips.
		expect(tagOf(html, "preset-tray-group-author")).toContain("flex-wrap");
		expect(tagOf(html, "preset-palette-template-2")).toContain(
			'data-on-team="true"',
		);
	});

	it("dims an agent the search or role doesn't match, never hiding it", () => {
		const html = renderToString(
			<TooltipProvider>
				<TrayChip
					template={template(2, ["schema"])}
					held={false}
					dimmed
					onAdd={() => {}}
					onDragStart={() => {}}
					onDragEnd={() => {}}
				/>
			</TooltipProvider>,
		);
		const chip = tagOf(html, "preset-palette-template-2");
		expect(chip).toContain('data-dimmed="true"');
		expect(chip).toContain("h-8");
		expect(chip).not.toMatch(/opacity-/);
	});

	it("offers a Firm template disabled, with the reason", () => {
		const html = renderToString(
			<TooltipProvider>
				<TrayChip
					template={template(3, ["intake"])}
					held={false}
					onAdd={() => {}}
					onDragStart={() => {}}
					onDragEnd={() => {}}
				/>
			</TooltipProvider>,
		);
		const firm = tagOf(html, "preset-palette-template-3");
		expect(firm).toMatch(/\sdisabled=""/);
		const id = firm.match(/aria-describedby="([^"]+)"/)?.[1] ?? "";
		expect(textOfId(html, id)).toBe(
			PRECONDITION_COPY.template_not_rosterable.what.replaceAll("'", "&#x27;"),
		);
	});

	it("renders each control once: New team, Apply, Details, the switcher and the view control", async () => {
		const html = await page("/presets", [ONE, TWO]);
		const count = (re: RegExp) => html.match(re)?.length ?? 0;
		expect(count(/data-testid="presets-new"/g)).toBe(1);
		expect(count(/data-testid="preset-kanban-apply"/g)).toBe(1);
		expect(count(/data-testid="preset-details"/g)).toBe(1);
		expect(count(/data-testid="preset-switcher"/g)).toBe(1);
		expect(count(/data-testid="preset-view"/g)).toBe(1);
		expect(html).not.toContain("preset-kanban-close");
		expect(html).not.toContain('data-testid="presets-showing"');
	});

	it("draws territory as a neutral tag, never a gate or accent tone", async () => {
		const withTerritory = preset(1, {
			name: "Full build",
			agents: [agent(1, ["A"], "Web"), agent(2, ["B"], "Billing")],
		});
		const html = await page("/presets", [withTerritory]);
		const tags = [
			...html.matchAll(/<span data-slot="territory" class="([^"]+)"/g),
		].map((m) => m[1] ?? "");
		expect(tags).toHaveLength(2);
		for (const cls of tags) {
			for (const c of ["border-border", "bg-app-raised", "text-text-muted"])
				expect(cls.split(" ")).toContain(c);
			expect(cls).not.toMatch(/gate-|accent/);
		}
	});

	it("opens an old ?view=table link on the board, with no table (ruling 55)", async () => {
		const html = await page("/presets?view=table", [ONE]);
		expect(html).toContain('data-testid="presets-composer"');
		expect(html).toContain('data-testid="preset-canvas"');
		expect(tagOf(html, "preset-view-lanes")).toContain('aria-pressed="true"');
		for (const table of [
			"preset-view-table",
			"presets-panes",
			"presets-toolbar",
			"preset-rows",
			"preset-detail",
		])
			expect(html).not.toContain(`data-testid="${table}"`);
	});
});

describe("what a team must staff, from the contract's check alone", () => {
	const byId = new Map(TEMPLATES.map((t) => [t.id, t]));

	it("requires a default playbook's earliest wave while it is empty", () => {
		const team = {
			id: ID(1),
			cut: "horizontal" as const,
			agents: [agent(1, ["C"])],
		};
		const req = composerRequirements(team, byId, [
			playbook({ wavesApplicable: ["B", "D"] }),
		]);
		expect(Object.keys(req.waves)).toEqual(["B"]);
		expect(req.roles).toEqual({});
		// Staffed, nothing is required.
		const staffed = { ...team, agents: [agent(1, ["B"])] };
		expect(
			composerRequirements(staffed, byId, [
				playbook({ wavesApplicable: ["B"] }),
			]).waves,
		).toEqual({});
	});

	it("ignores playbooks that default to another team", () => {
		const team = { id: ID(1), cut: "horizontal" as const, agents: [] };
		const req = composerRequirements(team, byId, [
			playbook({ defaultPresetId: ID(2) }),
		]);
		expect(req.waves).toEqual({});
	});

	it("requires foundations and a verification role under a vertical cut", () => {
		const team = {
			id: ID(1),
			cut: "vertical" as const,
			agents: [agent(2, ["A"])],
		};
		const req = composerRequirements(team, byId, []);
		expect(req.roles.foundations).toMatch(/Project setup/);
		expect(req.roles["backend-tests"]).toMatch(/verification role/);
		const held = { ...team, agents: [agent(1, ["A"])] };
		expect(composerRequirements(held, byId, []).roles).toEqual({});
	});

	it("checks nothing when an agent's template is unknown", () => {
		const team = {
			id: ID(1),
			cut: "vertical" as const,
			agents: [agent(9, ["A"])],
		};
		expect(composerRequirements(team, byId, []).known).toBe(false);
	});
});

describe("the coverage grid (roles by wave)", () => {
	const grid = (
		agents: {
			key: string;
			templateId: string;
			waves: ("A" | "B" | "C" | "D" | "E")[];
			name: string;
		}[],
	) =>
		renderToString(
			<TooltipProvider>
				<CoverageGrid
					agents={agents}
					templates={TEMPLATES}
					requirements={{
						waves: { B: "Booking starts in wave B." },
						roles: { foundations: "A vertical cut needs Project setup." },
						known: true,
						checkedBy: ["Booking"],
						declared: { B: ["Booking"] },
					}}
					onAdd={() => {}}
				/>
			</TooltipProvider>,
		);

	it("puts each agent in the cells of its roles and waves, as tiles", () => {
		const html = grid([
			{ key: "1", templateId: TEMPLATE(1), waves: ["A"], name: "Atlas" },
		]);
		expect(tagOf(html, "preset-grid-cell-foundations-A")).toContain(
			'data-count="1"',
		);
		expect(tagOf(html, "preset-grid-cell-backend-tests-A")).toContain(
			'data-count="1"',
		);
		expect(tagOf(html, "preset-grid-cell-schema-A")).toContain(
			'data-count="0"',
		);
	});

	it("marks only empty cells in a required wave or role, with the reason", () => {
		const html = grid([
			{ key: "1", templateId: TEMPLATE(1), waves: ["A"], name: "Atlas" },
		]);
		expect(tagOf(html, "preset-grid-cell-schema-B")).toContain(
			'data-warn="true"',
		);
		expect(tagOf(html, "preset-grid-cell-foundations-C")).toContain(
			'data-warn="true"',
		);
		// Filled, it no longer warns; neither required, it never does.
		expect(tagOf(html, "preset-grid-cell-foundations-A")).not.toContain(
			"data-warn",
		);
		expect(tagOf(html, "preset-grid-cell-schema-C")).not.toContain("data-warn");
		expect(tagOf(html, "preset-grid-wave-B")).toContain('data-required="true"');
	});

	it("lists the catalog's roles, every one, and opens a picker on any cell", () => {
		const html = grid([]);
		const rows = [
			...html.matchAll(/data-testid="preset-grid-role-([a-z-]+)"/g),
		].map((m) => m[1]);
		// Every role once, grouped by side under eyebrows (then Other).
		expect([...rows].sort()).toEqual([...ROLES].sort());
		expect(rows).toHaveLength(ROLES.length);
		for (const side of ["author", "tester", "judge", "fixture", "other"])
			expect(html).toContain(`data-testid="preset-grid-side-${side}"`);
		expect(
			html.indexOf('data-testid="preset-grid-role-fixture"'),
		).toBeGreaterThan(html.indexOf('data-testid="preset-grid-side-fixture"'));
		expect(tagOf(html, "preset-grid-cell-schema-A")).toContain(
			'aria-haspopup="dialog"',
		);
	});

	it("keeps a crowded cell to two tiles and a count", () => {
		const many = ["1", "2", "3"].map((key) => ({
			key,
			templateId: TEMPLATE(1),
			waves: ["A" as const],
			name: "Atlas",
		}));
		const html = grid(many);
		expect(html).toMatch(
			/data-testid="preset-grid-more-foundations-A"[^>]*>\+1</,
		);
	});
});

describe("the dirty banner (v3 .banner)", () => {
	const banner = (discarding = false, problems = 0) =>
		renderToString(
			<TooltipProvider>
				<DirtyBanner
					changes={[{ kind: "add", label: "Atlas in A" }]}
					problemCount={problems}
					discarding={discarding}
					onDiscarding={() => {}}
					onDiscard={() => {}}
					onSave={() => {}}
					nextVersion={4}
				/>
			</TooltipProvider>,
		);

	it("counts the unpublished changes and offers Discard and Save as v<n>", () => {
		const html = banner();
		expect(html).toMatch(
			/data-testid="preset-kanban-dirty"[^>]*>Unpublished changes \(1\)</,
		);
		expect(tagOf(html, "preset-kanban-strip")).toContain("bg-gate-warn-banner");
		expect(html).toMatch(/data-testid="preset-kanban-save"[^>]*>Save as v4</);
		expect(html).toContain('data-testid="preset-kanban-discard"');
	});

	it("asks once before discarding, and holds Save while a field is wrong", () => {
		expect(banner(true)).toContain(
			'data-testid="preset-kanban-discard-confirm"',
		);
		expect(tagOf(banner(false, 1), "preset-kanban-save")).toMatch(
			/\sdisabled=""/,
		);
	});
});

/** The markup from an element with this test id onwards. */
function element(html: string, testid: string): string {
	const at = html.indexOf(`data-testid="${testid}"`);
	expect(at, testid).toBeGreaterThan(-1);
	return html.slice(html.lastIndexOf("<", at));
}
