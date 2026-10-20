import { readdirSync, readFileSync } from "node:fs";
import type { Wave } from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActorMark, initialsOf } from "@/components/avel/actor";
import { PickerList } from "@/components/avel/preset-coverage-grid";
import { LAST_WAVE, WaveToggles } from "@/components/avel/preset-kanban";
import { dropProblem, type LaneRow } from "@/components/avel/preset-lanes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TEMPLATE, template } from "./presets-fixtures";
import { tagOf, textOfId } from "./render-page";

const tip = (node: React.ReactNode) =>
	renderToString(<TooltipProvider>{node}</TooltipProvider>);

/** The reason a disabled control is described by. */
const reasonOf = (html: string, testid: string) => {
	const id = tagOf(html, testid).match(/aria-describedby="([^"]+)"/)?.[1];
	return id ? textOfId(html, id) : null;
};

describe("Coverage adds by the lanes' own check", () => {
	const T1 = template(1, ["schema"]);
	const T2 = template(2, ["schema"]);
	const rows: LaneRow[] = [
		{ uid: 0, templateId: TEMPLATE(1), territory: "", waves: ["A"] },
	];
	const byId = new Map([
		[T1.id, T1],
		[T2.id, T2],
	]);
	const problemOf = (templateId: string, wave: Wave) =>
		dropProblem(
			rows,
			{ kind: "template", templateId },
			wave,
			() => "Template 1",
			byId,
		);

	it("refuses in the cell picker a duplicate the lanes refuse, with the reason", () => {
		const html = tip(
			<PickerList
				forRole="schema"
				wave="A"
				templates={[T1, T2]}
				problemOf={problemOf}
				onAdd={() => {}}
			/>,
		);
		const dup = "preset-grid-add-schema-A-template-1";
		expect(tagOf(html, dup)).toMatch(/\sdisabled=""/);
		expect(reasonOf(html, dup)).toBe(problemOf(TEMPLATE(1), "A"));
		expect(tagOf(html, "preset-grid-add-schema-A-template-2")).not.toMatch(
			/\sdisabled=""/,
		);
	});

	it("offers the same agent in another wave", () => {
		const html = tip(
			<PickerList
				forRole="schema"
				wave="B"
				templates={[T1]}
				problemOf={problemOf}
				onAdd={() => {}}
			/>,
		);
		expect(tagOf(html, "preset-grid-add-schema-B-template-1")).not.toMatch(
			/\sdisabled=""/,
		);
	});
});

describe("an agent's last wave in the inspector", () => {
	it("can't be unticked: an agent needs one wave, and Remove is the way out", () => {
		const html = tip(
			<WaveToggles waves={["B"]} onChange={() => {}} error={undefined} />,
		);
		expect(tagOf(html, "preset-field-wave-B")).toMatch(/\sdisabled=""/);
		expect(reasonOf(html, "preset-field-wave-B")).toBe(LAST_WAVE);
		expect(tagOf(html, "preset-field-wave-A")).not.toMatch(/\sdisabled=""/);
	});

	it("unticks any wave while another stays on", () => {
		const html = tip(
			<WaveToggles waves={["A", "B"]} onChange={() => {}} error={undefined} />,
		);
		for (const w of ["A", "B"])
			expect(tagOf(html, `preset-field-wave-${w}`)).not.toMatch(
				/\sdisabled=""/,
			);
	});
});

describe("one agent tile, one initials rule", () => {
	it("defines the initials once, in actor.tsx", () => {
		const dir = "src/components/avel";
		const defining = readdirSync(dir)
			.filter((f) => f.endsWith(".tsx"))
			.filter((f) =>
				/=\s*\(name: string\)\s*=>\s*name\.slice\(0, 2\)/.test(
					readFileSync(`${dir}/${f}`, "utf8"),
				),
			);
		expect(defining).toEqual(["actor.tsx"]);
		expect(initialsOf("Atlas")).toBe("AT");
	});

	it("draws New dispatch's agent option with the shared mark, at the card's tile size", () => {
		const source = readFileSync("src/components/avel/dispatch-new.tsx", "utf8");
		expect(source).toContain('<ActorMark kind="agent"');
		const html = renderToString(
			<ActorMark kind="agent" name="Atlas" size="md" data-testid="m" />,
		);
		expect(tagOf(html, "m")).toContain("size-tile-md rounded-tile");
		expect(html).toContain(">AT<");
	});
});
