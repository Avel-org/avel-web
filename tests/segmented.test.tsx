import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActivityFilterBar } from "../src/components/avel/activity-filters";
import { CONNECTION_FILTERS } from "../src/components/avel/connection-list";
import {
	Segmented,
	type SegmentOption,
} from "../src/components/avel/segmented";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { tagOf } from "./render-page";
import { visibleText } from "./visible-text";

// The one segmented filter every filter row draws from: All first, the
// chosen segment pressed, a count per segment when there is one.

const OPTIONS: SegmentOption<"open" | "closed">[] = [
	{ value: undefined, label: "All", count: 3 },
	{ value: "open", label: "Open", count: 2 },
	{ value: "closed", label: "Closed", count: null },
];

const html = (
	value: "open" | "closed" | undefined,
	extra: { showLegend?: boolean } = {},
) =>
	renderToString(
		<TooltipProvider>
			<Segmented
				data-testid="f"
				legend="Status"
				options={OPTIONS}
				value={value}
				onChange={() => {}}
				{...extra}
			/>
		</TooltipProvider>,
	);

const pressed = (out: string, id: string) =>
	tagOf(out, `f-${id}`).includes('aria-pressed="true"');

describe("Segmented", () => {
	it("presses All when nothing is chosen, and only the choice otherwise", () => {
		expect(pressed(html(undefined), "all")).toBe(true);
		expect(pressed(html(undefined), "open")).toBe(false);
		expect(pressed(html("open"), "open")).toBe(true);
		expect(pressed(html("open"), "all")).toBe(false);
	});

	it("counts each segment, and dashes a count not known yet", () => {
		const out = html(undefined);
		expect(out).toMatch(/data-testid="f-all-count"[^>]*>3</);
		expect(out).toMatch(/data-testid="f-open-count"[^>]*>2</);
		expect(visibleText(out)).toContain("—");
		expect(out).toContain(", count not available");
	});

	it("keeps the legend for screen readers, and shows it when asked", () => {
		expect(html(undefined)).toMatch(/<legend class="sr-only">Status<\/legend>/);
		expect(html(undefined, { showLegend: true })).toMatch(
			/<legend class="[^"]*type-eyebrow[^"]*">Status<\/legend>/,
		);
	});
});

describe("the sliding chip", () => {
	it("is drawn behind the segments, hidden until measured, so the pressed segment marks itself", () => {
		const out = html("open");
		// A server render has no measure: no ready track, the chip invisible
		// and out of the accessibility tree, the pressed segment its own chip.
		expect(tagOf(out, "f")).not.toMatch(/\sdata-indicator="/);
		expect(out).toMatch(
			/<span aria-hidden="true" data-slot="segment-chip" class="[^"]*opacity-0/,
		);
		expect(pressed(out, "open")).toBe(true);
		// It slides only by the state duration, and never under reduced motion.
		expect(out).toMatch(
			/data-slot="segment-chip" class="[^"]*duration-\(--duration-state\)[^"]*motion-reduce:transition-none/,
		);
	});
});

describe("filter rows", () => {
	it("start with All, Connections too", () => {
		expect(CONNECTION_FILTERS[0]).toBe("all");
	});

	it("name Activity's two rows after the columns they narrow", () => {
		const out = renderToString(
			<TooltipProvider>
				<ActivityFilterBar filters={{}} onChange={() => {}} />
			</TooltipProvider>,
		);
		expect(out).toMatch(
			/<legend class="[^"]*type-eyebrow[^"]*">Object<\/legend>/,
		);
		expect(out).toMatch(
			/<legend class="[^"]*type-eyebrow[^"]*">Actor<\/legend>/,
		);
	});

	it("press neither All nor a segment when Activity's choice is under More", () => {
		const out = renderToString(
			<TooltipProvider>
				<ActivityFilterBar
					filters={{ entityType: "connection" }}
					onChange={() => {}}
				/>
			</TooltipProvider>,
		);
		expect(tagOf(out, "activity-filter-entity-all")).not.toContain(
			'aria-pressed="true"',
		);
		expect(tagOf(out, "activity-filter-entity-more")).toContain(
			'aria-pressed="true"',
		);
	});
});
