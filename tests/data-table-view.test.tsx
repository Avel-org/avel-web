import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataTable } from "@/components/avel/data-table";
import {
	ColumnsList,
	fitView,
	moveColumn,
} from "@/components/avel/data-table-view";
import { tagOf } from "./render-page";

const IDS = ["name", "type", "gates", "deliverable"];

describe("a stored table view, fitted to today's columns", () => {
	it("is every column, in order, when nothing is stored", () => {
		expect(fitView(IDS, null)).toEqual({ order: IDS, hidden: [] });
	});

	it("keeps the stored order and hidden set, drops gone columns, appends new ones shown", () => {
		expect(
			fitView(IDS, {
				order: ["gates", "gone", "name"],
				hidden: ["name", "gone"],
			}),
		).toEqual({
			order: ["gates", "name", "type", "deliverable"],
			hidden: ["name"],
		});
	});

	it("never hides every column: the first in order shows", () => {
		expect(
			fitView(["a", "b"], { order: ["b", "a"], hidden: ["a", "b"] }),
		).toEqual({ order: ["b", "a"], hidden: ["a"] });
	});

	it("moves one column to another's place, and ignores a move off the ends", () => {
		expect(moveColumn(IDS, 0, 2)).toEqual([
			"type",
			"gates",
			"name",
			"deliverable",
		]);
		expect(moveColumn(IDS, 3, 0)).toEqual([
			"deliverable",
			"name",
			"type",
			"gates",
		]);
		expect(moveColumn(IDS, 0, -1)).toEqual(IDS);
		expect(moveColumn(IDS, 3, 4)).toEqual(IDS);
	});
});

describe("the Columns menu (v3 .menu, .menu-row)", () => {
	const list = (hidden: string[], dragging: number | null = null) =>
		renderToString(
			<ColumnsList
				headingId="h"
				order={IDS}
				hidden={hidden}
				labelOf={(id) => id.toUpperCase()}
				shownCount={IDS.length - hidden.length}
				dragging={dragging}
				onToggle={() => {}}
				onReset={() => {}}
				testId="c"
			/>,
		);

	it("heads with how many are shown, of how many", () => {
		expect(list(["gates"])).toMatch(/data-testid="c-count"[^>]*>3 of 4 shown</);
	});

	it("gives each column a grip, a checkbox and its name, in order", () => {
		const out = list([]);
		const rows = [...out.matchAll(/data-testid="c-row-([a-z]+)"/g)].map(
			(m) => m[1],
		);
		expect(rows).toEqual(IDS);
		expect(tagOf(out, "c-grip-name")).toContain(
			'aria-label="Move NAME. Use the up and down arrows."',
		);
		expect(tagOf(out, "c-check-type")).toContain('data-state="checked"');
		expect(tagOf(out, "c-row-name")).toContain('draggable="true"');
	});

	it("shows a hidden column unchecked, and keeps the last shown one from being hidden", () => {
		const out = list(["name", "type", "gates"]);
		expect(tagOf(out, "c-check-name")).toContain('data-state="unchecked"');
		expect(tagOf(out, "c-check-deliverable")).toMatch(/\sdisabled=""/);
		expect(out).toContain("At least one column stays shown.");
	});

	it("lifts the row being dragged on shadow-drag, the chip surface and a strong edge", () => {
		const row = tagOf(list([], 1), "c-row-type");
		expect(row).toContain('data-dragging="true"');
		for (const cls of ["shadow-drag", "bg-chip", "border-border-strong"])
			expect(row).toContain(cls);
		// A ring would fight shadow-drag for box-shadow.
		expect(row).not.toMatch(/\bring-/);
	});
});

describe("a table with a stored view", () => {
	type Row = { id: string };
	const render = (viewKey?: string) =>
		renderToString(
			<DataTable
				label="Rows"
				columns={[
					{ id: "name", header: "Name", cell: (r: Row) => r.id },
					{
						id: "kind",
						header: <span>Kind</span>,
						label: "Kind",
						cell: () => "x",
					},
				]}
				rows={[{ id: "a" }]}
				getRowId={(r) => r.id}
				density="compact"
				viewKey={viewKey}
				data-testid="t"
			/>,
		);

	it("gets Row density as a v3 segmented pair and a Columns button", () => {
		const out = render("rows");
		expect(tagOf(out, "t-view-density")).toMatch(/\bbg-app-raised\b/);
		expect(tagOf(out, "t-view-density-compact")).toContain(
			'aria-pressed="true"',
		);
		expect(tagOf(out, "t-view-density-comfortable")).toContain(
			'aria-pressed="false"',
		);
		expect(tagOf(out, "t-view-columns-trigger")).toContain(
			'aria-haspopup="dialog"',
		);
		expect(out).toMatch(
			/data-testid="t-view-columns-trigger"[^>]*>.*Columns<\/button>/s,
		);
		expect(tagOf(out, "t")).toContain('data-density="compact"');
	});

	it("has no toolbar without a key", () => {
		expect(render()).not.toContain("t-view");
	});
});
