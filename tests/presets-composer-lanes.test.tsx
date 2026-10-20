import type { AgentTemplate } from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	type ComposerRequirements,
	NO_REQUIREMENTS,
} from "@/components/avel/preset-coverage-grid";
import {
	type DragSource,
	dropProblem,
	type LaneChip,
	type LaneRow,
	placeBefore,
	positionText,
	WaveLane,
} from "@/components/avel/preset-lanes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PRECONDITION_COPY } from "@/lib/error-map";
import { TEMPLATE, template } from "./presets-fixtures";
import { tagOf } from "./render-page";

const CHIPS: LaneChip[] = [
	{ uid: 1, name: "Atlas", territory: "Web", flagged: false },
	{ uid: 2, name: "Nemi", territory: "", flagged: false },
];

/** A lane whose wave B the playbook requires. */
const REQUIRED_B: ComposerRequirements = {
	...NO_REQUIREMENTS,
	waves: { B: "Booking starts in wave B." },
	known: true,
	checkedBy: ["Booking"],
	declared: { B: ["Booking"] },
};

const lane = (props: Partial<Parameters<typeof WaveLane>[0]> = {}): string =>
	renderToString(
		<TooltipProvider>
			<WaveLane
				wave="B"
				chips={CHIPS}
				selectedUid={null}
				holding={false}
				drag={null}
				over={false}
				insertAt={null}
				landedUid={null}
				requirements={NO_REQUIREMENTS}
				{...props}
			/>
		</TooltipProvider>,
	);

describe("a wave lane as a drop zone", () => {
	it("is the whole lane, full height, a v3 card at rest", () => {
		const tag = tagOf(lane(), "preset-kanban-wave-B");
		for (const cls of [
			// As tall as its chips and one slot, 9rem at least: content height.
			"min-h-36",
			"rounded-card",
			"border-border",
			"bg-app-panel",
		])
			expect(tag).toContain(cls);
		expect(tag).not.toContain("data-over");
	});

	it("takes v3's selected fill and edge while something is dragged over it", () => {
		const tag = tagOf(
			lane({ over: true, drag: { kind: "chip", uid: 2, wave: "A" } }),
			"preset-kanban-wave-B",
		);
		expect(tag).toContain('data-over="true"');
		expect(tag).toContain("border-selected-border bg-selected");
		// The padding stays: the zone does not change its shape.
		expect(tag).toContain("p-2");
	});

	it("ends in one dashed 40px drop slot, always, so every lane reads as a target", () => {
		const html = lane();
		const ghost = tagOf(html, "preset-lane-B-ghost");
		expect(ghost).toContain("border-dashed");
		expect(ghost).toContain("min-h-10");
		expect(html).toMatch(/data-testid="preset-lane-B-ghost"[^>]*>.*Drop here</);
	});

	it("draws an accent line where the drop will land", () => {
		const html = lane({
			over: true,
			insertAt: 1,
			drag: { kind: "chip", uid: 9, wave: "A" },
		});
		expect(tagOf(html, "preset-lane-B-insert-1")).toContain("bg-accent");
		expect(html.indexOf("preset-lane-B-insert-1")).toBeGreaterThan(
			html.indexOf("preset-chip-1-B"),
		);
		expect(html.indexOf("preset-lane-B-insert-1")).toBeLessThan(
			html.indexOf("preset-chip-2-B"),
		);
		// Not over the lane, no line.
		expect(lane({ insertAt: 1 })).not.toContain("preset-lane-B-insert");
	});

	it("keeps a dashed placeholder where a chip was while it is dragged away", () => {
		const html = lane({ drag: { kind: "chip", uid: 1, wave: "B" } });
		const chip = tagOf(html, "preset-chip-1-B");
		expect(chip).toContain('data-placeholder="true"');
		expect(chip).toContain("border-dashed");
		expect(chip).toContain("*:invisible");
		// The same agent's chip in another lane is not its source.
		expect(
			tagOf(
				lane({ drag: { kind: "chip", uid: 1, wave: "A" } }),
				"preset-chip-1-B",
			),
		).not.toContain("data-placeholder");
	});

	it("keeps a required empty wave as the warn zone with its reason", () => {
		const html = lane({ chips: [], requirements: REQUIRED_B });
		const zone = tagOf(html, "preset-kanban-wave-B-required");
		expect(zone).toContain(
			"border-dashed border-gate-warn-line bg-gate-warn-banner",
		);
		expect(html).toContain("Booking starts in wave B.");
		expect(lane({ requirements: REQUIRED_B })).not.toContain(
			"preset-kanban-wave-B-required",
		);
	});

	it("says why a drop failed at the lane's foot, in warn", () => {
		const html = lane({ problem: "Atlas is already in wave B." });
		const foot = tagOf(html, "preset-lane-B-problem");
		expect(foot).toContain("text-gate-warn");
		expect(foot).toContain('aria-live="polite"');
		expect(html.indexOf("preset-lane-B-problem")).toBeGreaterThan(
			html.indexOf("preset-chip-2-B"),
		);
	});
});

describe("a chip (v3 .menu-row)", () => {
	it("is the lane's width, 36px, with a tile, the name and its territory tag on one line", () => {
		const html = lane();
		const chip = tagOf(html, "preset-chip-1-B");
		expect(chip).toContain("h-9 w-full");
		expect(chip).toContain('draggable="true"');
		const body = html.slice(html.indexOf('data-testid="preset-chip-1-B"'));
		expect(body).toMatch(/>AT<\/span>/);
		expect(body).toMatch(/data-slot="territory"[^>]*>Web</);
	});

	it("lifts on the drag shadow while held, and shows its grip on hover and focus", () => {
		const html = lane({ selectedUid: 1, holding: true });
		const chip = tagOf(html, "preset-chip-1-B");
		for (const cls of [
			"shadow-drag",
			"bg-chip",
			"border-border-strong",
			"-translate-y-px",
		])
			expect(chip).toContain(cls);
		expect(html).toMatch(
			/lucide-grip-vertical[^"]*opacity-0[^"]*group-hover\/chip:opacity-100 group-focus-visible\/chip:opacity-100/,
		);
	});

	it("plays the landed state once dropped", () => {
		expect(tagOf(lane({ landedUid: 2 }), "preset-chip-2-B")).toMatch(
			/\slanded[\s"]/,
		);
	});
});

describe("the drop rules", () => {
	const rows: LaneRow[] = [
		{ uid: 1, templateId: TEMPLATE(1), territory: "", waves: ["A", "B"] },
		{ uid: 2, templateId: TEMPLATE(2), territory: "Web", waves: ["C"] },
	];
	const names = new Map([
		[1, "Atlas"],
		[2, "Nemi"],
	]);
	const nameOf = (r: LaneRow) => names.get(r.uid) ?? "";
	const templates = new Map<string, AgentTemplate>([
		[TEMPLATE(1), template(1)],
		[TEMPLATE(2), template(2)],
		[TEMPLATE(3), template(3, ["intake"])],
	]);
	const problem = (source: DragSource, to: "A" | "B" | "C" | "D" | "E") =>
		dropProblem(rows, source, to, nameOf, templates);

	it("refuses a chip onto a wave its agent is already in", () => {
		expect(problem({ kind: "chip", uid: 1, wave: "A" }, "B")).toBe(
			"Atlas is already in wave B.",
		);
		expect(problem({ kind: "chip", uid: 1, wave: "A" }, "C")).toBeNull();
		// Within its own lane it is a reorder, never refused.
		expect(problem({ kind: "chip", uid: 1, wave: "A" }, "A")).toBeNull();
	});

	it("refuses a second copy of a template in one wave unless one has a territory", () => {
		expect(problem({ kind: "template", templateId: TEMPLATE(1) }, "A")).toMatch(
			/Atlas is already in wave A\. Give one a territory/,
		);
		// Its existing copy has a territory: a second one may join.
		expect(
			problem({ kind: "template", templateId: TEMPLATE(2) }, "C"),
		).toBeNull();
	});

	it("refuses a Firm template with the contract's reason", () => {
		expect(problem({ kind: "template", templateId: TEMPLATE(3) }, "A")).toBe(
			PRECONDITION_COPY.template_not_rosterable.what,
		);
	});

	it("places a row before another, or last", () => {
		const list = [{ uid: 1 }, { uid: 2 }, { uid: 3 }];
		expect(placeBefore(list, 3, 1).map((r) => r.uid)).toEqual([3, 1, 2]);
		expect(placeBefore(list, 1, null).map((r) => r.uid)).toEqual([2, 3, 1]);
		expect(placeBefore(list, 2, 2).map((r) => r.uid)).toEqual([1, 2, 3]);
	});

	it("reads a position out with its lane, for the live region", () => {
		expect(positionText("Atlas", "B", 1, 3)).toBe(
			"Atlas, wave B, position 2 of 3.",
		);
	});
});
