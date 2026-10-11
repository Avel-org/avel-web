import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	type CoherenceInput,
	computeCoherence,
	type MissionListItem,
	type RosterEntry,
} from "avel-server/contract";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InlineModals } from "@/components/avel/action-modal";
import { missionKeys } from "@/components/avel/mission-data";
import {
	ApplyPresetSteps,
	draftMissions,
	MissingTemplates,
	missionLabel,
} from "@/components/avel/preset-apply";
import {
	COMPARE_FULL,
	PresetCard,
	territoryTone,
} from "@/components/avel/preset-board";
import { PresetCompare } from "@/components/avel/preset-compare";
import type { Names } from "@/components/avel/preset-detail";
import {
	APPLY_WAITS,
	boardSync,
	PresetKanban,
	SavePresetConfirm,
} from "@/components/avel/preset-kanban";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiProvider } from "@/lib/api";
import { CATALOG_PAGE_SIZE } from "@/lib/api/catalog";
import { queryKeys } from "@/lib/api/keys";
import {
	addWave,
	adjacentWave,
	appliedCoherenceInput,
	applyLabel,
	missingTemplateIds,
	moveWave,
	presetDiff,
	waveGrid,
} from "@/lib/api/presets";
import { PRECONDITION_COPY } from "@/lib/error-map";
import { contractError, fakeApi } from "./clients-fixtures";
import { ID, preset, TEMPLATE, template } from "./presets-fixtures";
import { tagOf, tagWithId, textOfId } from "./render-page";

const names: Names = {
	status: "success",
	byId: new Map([
		[TEMPLATE(1), { name: "Atlas", slug: "atlas" }],
		[TEMPLATE(2), { name: "Nemi", slug: "nemi" }],
	]),
};
const noop = () => {};
const actions = { onOpen: noop, onApply: noop, onToggleCompare: noop };

const agent = (
	n: number,
	waves: ("A" | "B" | "C" | "D" | "E")[],
	territory: string | null = null,
) => ({
	agentTemplateId: TEMPLATE(n),
	waves,
	territory,
	writablePaths: null,
	estimatedTokens: null,
});

/** Inside the real ApiProvider; the seed is the whole world. */
function render(node: ReactNode, seed: (qc: QueryClient) => void = noop) {
	const qc = new QueryClient({
		defaultOptions: {
			queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
		},
	});
	qc.setQueryData(queryKeys.catalog.agentTemplates(CATALOG_PAGE_SIZE), {
		pages: [
			{
				data: [template(1), template(2), template(3, ["intake"])],
				meta: { nextCursor: null },
			},
		],
		pageParams: [undefined],
	});
	seed(qc);
	return renderToString(
		<ApiProvider client={fakeApi().client}>
			<QueryClientProvider client={qc}>
				<TooltipProvider>
					<InlineModals>{node}</InlineModals>
				</TooltipProvider>
			</QueryClientProvider>
		</ApiProvider>,
	);
}

describe("moving a chip between waves", () => {
	it("replaces the wave it left, keeps A to E order, and never repeats one", () => {
		expect(moveWave(["A"], "A", "B")).toEqual(["B"]);
		expect(moveWave(["A", "C"], "C", "B")).toEqual(["A", "B"]);
		expect(moveWave(["A", "B"], "A", "B")).toEqual(["B"]);
		expect(moveWave(["B"], "B", "B")).toEqual(["B"]);
	});

	it("stops at either end", () => {
		expect(adjacentWave("A", -1)).toBeNull();
		expect(adjacentWave("E", 1)).toBeNull();
		expect(adjacentWave("C", -1)).toBe("B");
	});

	it("adds a wave in order", () => {
		expect(addWave(["C"], "A")).toEqual(["A", "C"]);
	});
});

describe("a preset by wave", () => {
	it("puts an agent in every wave it works in, and keeps waveless ones apart", () => {
		const grid = waveGrid([agent(1, ["A", "C"]), agent(2, [])]);
		expect(grid.columns.map((c) => c.agents.length)).toEqual([1, 0, 1, 0, 0]);
		expect(grid.noWave).toHaveLength(1);
	});
});

describe("the preset card", () => {
	it("is a small board with the agents in their wave columns", () => {
		const p = preset(1, {
			agents: [agent(1, ["A"]), agent(2, ["B", "C"], "Web")],
		});
		const html = render(
			<PresetCard
				preset={p}
				names={names}
				compared={false}
				compareFull={false}
				actions={actions}
			/>,
		);
		for (const [wave, count] of [
			["A", 1],
			["B", 1],
			["C", 1],
			["D", 0],
			["E", 0],
		] as const) {
			expect(tagOf(html, `preset-wave-${ID(1)}-${wave}`)).toContain(
				`data-count="${count}"`,
			);
		}
		expect(html).toContain(">Atlas<");
		expect(html).toContain(`data-testid="preset-version-${ID(1)}"`);
	});

	it("tones a territory's chips alike, and a chip with none plainly", () => {
		expect(territoryTone("Web")).toBe(territoryTone("Web"));
		expect(territoryTone(null)).toBe("border-border");
	});

	it("holds a third pick for comparison, saying why", () => {
		const html = render(
			<PresetCard
				preset={preset(1)}
				names={names}
				compared={false}
				compareFull
				actions={actions}
			/>,
		);
		const button = tagOf(html, `preset-compare-${ID(1)}`);
		expect(button).toMatch(/\sdisabled=""/);
		const id = button.match(/aria-describedby="([^"]+)"/)?.[1] ?? "";
		expect(tagWithId(html, id)).toContain('class="sr-only"');
		expect(textOfId(html, id)).toBe(COMPARE_FULL);
	});
});

describe("comparing two presets", () => {
	const a = preset(1, {
		name: "A",
		agents: [agent(1, ["A"]), agent(2, ["B"])],
	});
	const b = preset(2, { name: "B", agents: [agent(1, ["C"])] });

	it("matches agents by template and territory and compares their fields", () => {
		const diff = presetDiff(a, b);
		expect(diff.onlyA.map((x) => x.agentTemplateId)).toEqual([TEMPLATE(2)]);
		expect(diff.onlyB).toEqual([]);
		expect(diff.changed).toHaveLength(1);
		expect(diff.changed[0]?.fields).toEqual(["waves"]);
	});

	it("shows both boards, marking what only one has and what differs", () => {
		const html = render(
			<PresetCompare a={a} b={b} names={names} onClear={noop} />,
		);
		const left = html.slice(
			html.indexOf('data-testid="preset-compare-a"'),
			html.indexOf('data-testid="preset-compare-b"'),
		);
		expect(left).toMatch(/data-diff="only"[^>]*>Nemi/);
		expect(left).toMatch(/data-diff="changed"[^>]*>Atlas/);
	});
});

describe("the expanded board", () => {
	const p = preset(1, { version: 3, agents: [agent(1, ["A"])] });
	const renderBoard = () =>
		render(
			<PresetKanban
				preset={p}
				names={names}
				onClose={noop}
				onApply={noop}
				onSaved={noop}
			/>,
		);

	it("lays the squad out in five wave columns", () => {
		const html = renderBoard();
		expect(tagOf(html, "preset-kanban-wave-A")).toContain('data-count="1"');
		expect(tagOf(html, "preset-kanban-wave-B")).toContain('data-count="0"');
	});

	it("has nothing to save until something changes", () => {
		const html = renderBoard();
		expect(html).not.toContain('data-testid="preset-kanban-strip"');
		expect(html).toContain('data-testid="preset-request-none"');
		expect(tagOf(html, "preset-kanban-apply")).not.toMatch(/\sdisabled=""/);
	});

	it("offers Firm templates disabled, with template_not_rosterable's reason", () => {
		const html = renderBoard();
		const firm = tagOf(html, "preset-palette-template-3");
		expect(firm).toMatch(/\sdisabled=""/);
		const id = firm.match(/aria-describedby="([^"]+)"/)?.[1] ?? "";
		// Server rendering escapes the apostrophe.
		expect(textOfId(html, id)).toBe(
			PRECONDITION_COPY.template_not_rosterable.what.replaceAll("'", "&#x27;"),
		);
		expect(tagOf(html, "preset-palette-template-1")).not.toMatch(
			/\sdisabled=""/,
		);
	});

	it("has Fields, JSON and Request in its inspector", () => {
		const html = renderBoard();
		for (const tab of ["fields", "json", "request"]) {
			expect(html).toContain(`data-testid="preset-inspector-${tab}"`);
		}
		expect(html).toContain(`PATCH /api/presets/${p.id}`);
	});

	it("holds Apply while the board has unsaved changes", () => {
		expect(APPLY_WAITS).toMatch(/applying uses the saved preset/);
	});
});

const mission = (
	overrides: Partial<MissionListItem> = {},
): MissionListItem => ({
	id: ID(50),
	origin: "client",
	type: "booking",
	sprintN: 2,
	status: "draft",
	cut: "vertical",
	cutSource: "derived",
	client: { id: ID(60), name: "Acme" },
	engagement: { id: ID(61), name: "Launch" },
	lastExport: null,
	lastActivityAt: null,
	needsYou: null,
	createdAt: "2026-10-01T09:00:00.000Z",
	updatedAt: "2026-10-01T09:00:00.000Z",
	...overrides,
});

function seedMissions(qc: QueryClient, client: MissionListItem[]) {
	for (const [origin, rows] of [
		["client", client],
		["internal", []],
	] as const) {
		qc.setQueryData(missionKeys.list(draftMissions(origin)), {
			pages: [{ data: rows, meta: { nextCursor: null } }],
			pageParams: [undefined],
		});
	}
}

describe("applying a preset", () => {
	it("names its button for what it does", () => {
		expect(applyLabel(6)).toBe("Apply 6 agents");
		expect(applyLabel(1)).toBe("Apply 1 agent");
	});

	it("starts by picking a draft mission, holding until one is", () => {
		const html = render(
			<ApplyPresetSteps preset={preset(1)} names={names} />,
			(qc) => seedMissions(qc, [mission()]),
		);
		expect(tagOf(html, "preset-apply")).toContain('data-size="stepper"');
		expect(html).toContain(`data-testid="preset-apply-mission-${ID(50)}"`);
		expect(html).toContain(">booking · sprint 2 · Acme<");
		const id = tagOf(html, "preset-apply-submit").match(
			/aria-describedby="([^"]+)"/,
		)?.[1];
		expect(textOfId(html, id ?? "")).toBe("Pick a draft mission first.");
	});

	it("says when there is no draft to apply to", () => {
		const html = render(
			<ApplyPresetSteps preset={preset(1)} names={names} />,
			(qc) => seedMissions(qc, []),
		);
		expect(html).toContain('data-testid="preset-apply-no-missions"');
	});

	it("asks to replace a roster that has agents, and holds until it may", () => {
		const m = mission();
		const entry = {
			id: ID(70),
			agentTemplate: { name: "Old" },
		} as unknown as RosterEntry;
		const html = render(
			<ApplyPresetSteps preset={preset(1)} names={names} initialMission={m} />,
			(qc) => {
				seedMissions(qc, [m]);
				qc.setQueryData(queryKeys.roster.list(m.id), [entry]);
			},
		);
		expect(html).toContain('data-testid="preset-apply-replace"');
		const id = tagOf(html, "preset-apply-submit").match(
			/aria-describedby="([^"]+)"/,
		)?.[1];
		expect(textOfId(html, id ?? "")).toMatch(
			/^This roster already has 1 agent\./,
		);
		expect(missionLabel(mission({ client: null }))).toBe(
			"booking · sprint 2 · Internal",
		);
	});

	it("previews coherence after applying with the contract's own check", () => {
		const before: CoherenceInput = { cut: "vertical", roster: [] };
		const byId = new Map([[TEMPLATE(1), template(1, ["foundations"])]]);
		const after = appliedCoherenceInput(before, [agent(1, ["A"])], byId, false);
		expect(after?.roster).toHaveLength(1);
		const rules = { wavesApplicable: ["A" as const], gates: [] };
		expect(computeCoherence(before, rules).block?.code).toBe(
			"no_agents_in_first_wave",
		);
		expect(
			computeCoherence(after as CoherenceInput, rules).block,
		).toBeUndefined();
		// A template the catalog lacks: nothing to read its roles from.
		expect(
			appliedCoherenceInput(before, [agent(9, ["A"])], byId, false),
		).toBeNull();
	});

	it("drops the current entries when replacing", () => {
		const before: CoherenceInput = {
			cut: "vertical",
			roster: [
				{
					id: ID(80),
					active: true,
					waves: ["B"],
					kind: "horizontal",
					roles: [],
					writablePaths: [],
				},
			],
		};
		const byId = new Map([[TEMPLATE(1), template(1)]]);
		expect(
			appliedCoherenceInput(before, [agent(1, ["A"])], byId, true)?.roster,
		).toHaveLength(1);
		expect(
			appliedCoherenceInput(before, [agent(1, ["A"])], byId, false)?.roster,
		).toHaveLength(2);
	});
});

describe("saving the board", () => {
	it("shows a refused issue in the refusal row, since the confirm marks no field", () => {
		const p = preset(1, { version: 2 });
		const html = render(
			<SavePresetConfirm
				open
				onOpenChange={noop}
				preset={p}
				name={p.name}
				changes={[]}
				pending={false}
				error={contractError(400, "VALIDATION_FAILED", {
					body: [{ path: ["agents", 0, "waves"], message: "too small" }],
				})}
				onSave={noop}
			/>,
		);
		expect(html).toContain('data-testid="action-modal-unplaced"');
		expect(html).toContain("Choose at least one wave.");
		expect(html).not.toContain("Check the fields marked above.");
		expect(html).toMatch(/data-testid="preset-save-submit"[^>]*>Save as v3/);
	});

	it("takes a newer version when clean, and only flags it when the board has edits", () => {
		expect(boardSync({ version: 2 }, { version: 2 }, true)).toBe("same");
		expect(boardSync({ version: 2 }, { version: 3 }, false)).toBe("adopt");
		expect(boardSync({ version: 2 }, { version: 3 }, true)).toBe("notice");
	});
});

describe("applying with a template the catalog lacks", () => {
	it("names each missing template once", () => {
		const byId = new Map([[TEMPLATE(1), template(1)]]);
		expect(
			missingTemplateIds(
				[agent(1, ["A"]), agent(9, ["B"]), agent(9, ["C"])],
				byId,
			),
		).toEqual([TEMPLATE(9)]);
	});

	it("says the server would refuse, never leaving After applying pending", () => {
		const m = mission();
		const html = render(
			<ApplyPresetSteps
				preset={preset(1, { agents: [agent(9, ["A"])] })}
				names={names}
				initialMission={m}
			/>,
			(qc) => {
				seedMissions(qc, [m]);
				qc.setQueryData(queryKeys.roster.list(m.id), []);
				qc.setQueryData(queryKeys.playbooks.byType(m.type), {
					id: ID(90),
					missionType: m.type,
					name: "Booking",
					wavesApplicable: ["A"],
					gates: [],
					deliverable: "pr",
					requiredFields: [],
					defaultPresetId: ID(1),
					version: 1,
					createdAt: "2026-10-01T09:00:00.000Z",
					updatedAt: "2026-10-01T09:00:00.000Z",
				});
			},
		);
		expect(html).toContain('data-testid="preset-apply-missing"');
		expect(html).toContain(TEMPLATE(9).slice(0, 8));
		expect(html).not.toContain('data-testid="preset-apply-coherence-after"');
		const solo = render(<MissingTemplates ids={[TEMPLATE(9)]} />);
		expect(solo).toContain("The server would refuse this apply.");
	});
});

describe("picking a draft mission", () => {
	it("waits for every page of drafts before offering any", () => {
		const html = render(
			<ApplyPresetSteps preset={preset(1)} names={names} />,
			(qc) => {
				qc.setQueryData(missionKeys.list(draftMissions("client")), {
					pages: [{ data: [mission()], meta: { nextCursor: "c2" } }],
					pageParams: [undefined],
				});
				qc.setQueryData(missionKeys.list(draftMissions("internal")), {
					pages: [{ data: [], meta: { nextCursor: null } }],
					pageParams: [undefined],
				});
			},
		);
		expect(html).toContain('data-testid="preset-apply-missions-loading"');
		expect(html).not.toContain(`data-testid="preset-apply-mission-${ID(50)}"`);
	});
});
