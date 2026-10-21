import {
	EXPORT_STATUSES,
	type ExportStatus,
	MISSION_STATUSES,
	type MissionStatus,
} from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	EXPORT_LIFECYCLE,
	Lifecycle,
	type LifecycleSpec,
	MISSION_LIFECYCLE,
	mainLine,
} from "@/components/avel/lifecycle";
import { tagOf } from "./render-page";

const html = <S extends string>(spec: LifecycleSpec<S>, current: S) =>
	renderToString(
		<Lifecycle spec={spec} current={current} label="Track" data-testid="lc" />,
	);

const standings = <S extends string>(spec: LifecycleSpec<S>, current: S) =>
	Object.fromEntries(mainLine(spec, current).map((s) => [s.state, s.standing]));

describe("Lifecycle (audit D5)", () => {
	it("places every contract state, the main line in the contract's order", () => {
		for (const spec of [MISSION_LIFECYCLE, EXPORT_LIFECYCLE] as const) {
			const placed = Object.keys(spec.place).sort();
			expect(placed).toEqual([...spec.states].sort());
		}
		expect(mainLine(MISSION_LIFECYCLE, "draft").map((s) => s.state)).toEqual(
			MISSION_STATUSES.filter((s) => s !== "halted"),
		);
		expect(mainLine(EXPORT_LIFECYCLE, "pending").map((s) => s.state)).toEqual(
			EXPORT_STATUSES.filter((s) => s !== "closed" && s !== "failed"),
		);
	});

	it("fills what is passed, rings the current state, leaves the rest hollow", () => {
		expect(standings(MISSION_LIFECYCLE, "shipped")).toEqual({
			draft: "passed",
			active: "passed",
			shipped: "current",
			archived: "ahead",
		});
		const out = html(MISSION_LIFECYCLE, "shipped");
		expect(tagOf(out, "lc-step-shipped")).toContain('aria-current="step"');
		expect(tagOf(out, "lc-step-draft")).toContain('data-standing="passed"');
		expect(tagOf(out, "lc-step-archived")).toContain('data-standing="ahead"');
		expect(out).toContain(", current</span>");
		expect(out).toContain(", not reached</span>");
	});

	it("puts a halt off the line, after active, the one step the contract makes certain", () => {
		expect(standings(MISSION_LIFECYCLE, "halted")).toEqual({
			draft: "passed",
			active: "passed",
			shipped: "ahead",
			archived: "ahead",
		});
		const out = html(MISSION_LIFECYCLE, "halted");
		expect(tagOf(out, "lc-branch-halted")).toContain('aria-current="step"');
		expect(out).not.toContain("lc-step-halted");
	});

	it("sets the branches beside the line after a divider, never on a row of their own", () => {
		const out = html(MISSION_LIFECYCLE, "active");
		expect(tagOf(out, "lc")).toMatch(/\bflex-wrap\b/);
		expect(tagOf(out, "lc")).not.toMatch(/\bflex-col\b/);
		expect(tagOf(out, "lc-branches")).toMatch(/\bborder-l\b/);
		expect(tagOf(out, "lc-branches")).not.toMatch(/\bborder-t\b/);
	});

	it("never guesses where an export failed or closed: nothing on the line is passed", () => {
		for (const end of ["failed", "closed"] as const satisfies ExportStatus[]) {
			const line = mainLine(EXPORT_LIFECYCLE, end);
			expect(
				line.every((s) => s.standing === "ahead"),
				end,
			).toBe(true);
			expect(tagOf(html(EXPORT_LIFECYCLE, end), `lc-branch-${end}`)).toContain(
				'data-standing="current"',
			);
		}
	});

	it("rings the current state in its tone; previewed waits on the operator (warn)", () => {
		const out = html(EXPORT_LIFECYCLE, "previewed");
		const step = out.slice(out.indexOf('data-testid="lc-step-previewed"'));
		expect(step).toMatch(/border-2 bg-app-panel border-gate-warn-solid/);
		// Machine states never take the accent (audit D3).
		expect(out).not.toMatch(/\b(bg|border|text)-accent\b/);
	});

	it("keys each entity's places on the contract union", () => {
		const mission: Record<MissionStatus, unknown> = MISSION_LIFECYCLE.place;
		const exp: Record<ExportStatus, unknown> = EXPORT_LIFECYCLE.place;
		expect(Object.keys(mission)).toHaveLength(MISSION_STATUSES.length);
		expect(Object.keys(exp)).toHaveLength(EXPORT_STATUSES.length);
	});
});
