import { ROLE_LABELS } from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	COVERAGE_HINT,
	CoverageGrid,
	type GridAgent,
	NO_REQUIREMENTS,
} from "@/components/avel/preset-coverage-grid";
import { coverageDropProblem } from "@/components/avel/preset-kanban";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TEMPLATE, template } from "./presets-fixtures";
import { tagOf } from "./render-page";

const T1 = template(1, ["schema"]);

const grid = (agents: GridAgent[], dragging = false) =>
	renderToString(
		<TooltipProvider>
			<CoverageGrid
				agents={agents}
				templates={[T1]}
				requirements={{
					...NO_REQUIREMENTS,
					known: true,
					waves: { A: "Booking starts in wave A." },
					checkedBy: ["Booking"],
					declared: { A: ["Booking"], B: ["Booking"] },
				}}
				dragging={dragging}
				onAdd={() => {}}
			/>
		</TooltipProvider>,
	);

const ATLAS: GridAgent = {
	key: "1",
	templateId: TEMPLATE(1),
	waves: ["B"],
	name: "Atlas",
};

describe("Coverage, as clear as the lanes", () => {
	it("heads each wave as a lane is headed: its name, glyph and count", () => {
		const html = grid([ATLAS]);
		const b = tagOf(html, "preset-grid-wave-B");
		expect(b).toContain('data-status="pass"');
		expect(html).toMatch(
			/data-testid="preset-grid-wave-B-count"[^>]*>1 agent</,
		);
		expect(tagOf(html, "preset-grid-wave-A")).toContain('data-status="warn"');
		// An empty wave is never a pass.
		expect(tagOf(html, "preset-grid-wave-C")).toContain(
			'data-status="pending"',
		);
		expect(html).toContain(">Wave C<");
	});

	it("groups the roles by side under eyebrows", () => {
		const html = grid([]);
		expect(html).toMatch(/type-eyebrow[^>]*>Writes code</);
		expect(html).toMatch(/type-eyebrow[^>]*>Writes tests</);
		expect(html).toMatch(/type-eyebrow[^>]*>Other</);
		const author = html.indexOf('data-testid="preset-grid-side-author"');
		const tester = html.indexOf('data-testid="preset-grid-side-tester"');
		const schema = html.indexOf('data-testid="preset-grid-role-schema"');
		const tests = html.indexOf('data-testid="preset-grid-role-backend-tests"');
		expect(author).toBeLessThan(schema);
		expect(schema).toBeLessThan(tester);
		expect(tester).toBeLessThan(tests);
	});

	// Two whole grids (every role by five waves, each cell a popover):
	// about half a second alone, past the 5s default under a loaded parallel
	// run, so it gets room rather than flaking.
	it("shows every cell as a drop target while an agent is held from the tray", {
		timeout: 20_000,
	}, () => {
		const idle = tagOf(grid([]), "preset-grid-cell-schema-C");
		expect(idle).not.toContain("border-dashed border-border-strong");
		const held = tagOf(grid([], true), "preset-grid-cell-schema-C");
		expect(held).toContain("border-dashed border-border-strong");
	});

	it("refuses a drop on a role the agent doesn't hold, and says where it goes", () => {
		expect(coverageDropProblem(T1, "schema")).toBeNull();
		expect(coverageDropProblem(T1, "auth")).toBe(
			`Template 1 doesn't hold ${ROLE_LABELS.auth}. Drop it on one of its roles.`,
		);
		expect(coverageDropProblem(undefined, "auth")).toBeNull();
	});

	it("explains the grid once, as the lanes' hint does", () => {
		expect(COVERAGE_HINT).toMatch(/^Each cell is a role in a wave\./);
		expect(COVERAGE_HINT).toContain("Drag an agent from the tray onto a cell");
	});
});
