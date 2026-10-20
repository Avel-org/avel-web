import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataPanel } from "@/components/avel/data-panel";
import { tagOf } from "./render-page";

const render = (props: Partial<Parameters<typeof DataPanel>[0]> = {}) =>
	renderToString(
		<DataPanel data-testid="p" title="Needs you" {...props}>
			<p>rows</p>
		</DataPanel>,
	);

const classesOf = (html: string, testid: string) =>
	(tagOf(html, testid).match(/class="([^"]*)"/)?.[1] ?? "").split(" ");

describe("DataPanel", () => {
	it("is a v3 card, rounded-card, clipped without a scroll container", () => {
		const root = classesOf(render(), "p");
		for (const cls of [
			"rounded-card",
			"border",
			"border-border",
			"bg-app-panel",
			"shadow-card",
			"overflow-clip",
		]) {
			expect(root).toContain(cls);
		}
		// overflow-hidden would trap a DataTable's sticky header inside the panel.
		expect(root).not.toContain("overflow-hidden");
		expect(classesOf(render(), "p-header")).toContain("bg-app-band");
	});

	it("labels the section by its title, set as a panel title", () => {
		const html = render();
		const id = tagOf(html, "p").match(/aria-labelledby="([^"]+)"/)?.[1];
		expect(html).toMatch(
			new RegExp(`<h2 id="${id}" class="type-title[^"]*">Needs you</h2>`),
		);
	});

	it("opens by default: the toggle says so and controls the body", () => {
		const html = render();
		const toggle = tagOf(html, "p-toggle");
		expect(toggle).toMatch(/^<button type="button"/);
		expect(toggle).toContain('aria-expanded="true"');
		const controls = toggle.match(/aria-controls="([^"]+)"/)?.[1];
		expect(tagOf(html, "p-body")).toContain(`id="${controls}"`);
		expect(tagOf(html, "p-body")).not.toContain("inert");
		expect(classesOf(html, "p-body")).toContain("grid-rows-[1fr]");
		expect(tagOf(html, "p")).toContain('data-state="open"');
	});

	it("starts closed when asked: collapsed and inert, so nothing hidden takes focus", () => {
		const html = render({ defaultOpen: false });
		expect(tagOf(html, "p-toggle")).toContain('aria-expanded="false"');
		expect(tagOf(html, "p-body")).toMatch(/\sinert=""/);
		expect(classesOf(html, "p-body")).toContain("grid-rows-[0fr]");
		expect(classesOf(html, "p-body")).toContain(
			"transition-[grid-template-rows]",
		);
		expect(tagOf(html, "p")).toContain('data-state="closed"');
	});

	it("turns its chevron with the state, at the state duration", () => {
		const open = render().match(/<svg[^>]*lucide-chevron-right[^>]*>/)?.[0];
		const closed = render({ defaultOpen: false }).match(
			/<svg[^>]*lucide-chevron-right[^>]*>/,
		)?.[0];
		expect(open).toMatch(/\brotate-90\b/);
		expect(closed).not.toMatch(/\brotate-90\b/);
		expect(open).toContain("duration-(--duration-state)");
	});

	it("shows a known count, and a dash when the count is unknown, never a fake zero", () => {
		expect(render({ count: 7 })).toMatch(/data-testid="p-count"[^>]*>7</);
		expect(render({ count: 0 })).toMatch(/data-testid="p-count"[^>]*>0</);
		expect(render()).toMatch(/data-testid="p-count"[^>]*>—</);
		// The shared count badge (v3 .count-badge): tabular figures.
		expect(tagOf(render(), "p-count")).toContain('data-variant="count"');
		expect(classesOf(render(), "p-count")).toContain("tabular-nums");
	});

	it("keeps actions outside the toggle, as their own tab stops", () => {
		const html = render({
			actions: (
				<button type="button" data-testid="act">
					Go
				</button>
			),
		});
		const toggleStart = html.indexOf('data-testid="p-toggle"');
		const toggleEnd = html.indexOf("</button>", toggleStart);
		const action = html.indexOf('data-testid="act"');
		expect(action).toBeGreaterThan(toggleEnd);
		expect(html).toContain('data-testid="p-actions"');
		expect(render()).not.toContain("p-actions");
	});

	it("shows a tone glyph beside the title, and none when neutral", () => {
		expect(render()).not.toContain("data-panel-glyph");
		const warn = render({ tone: "warn" });
		const glyph = tagOf(warn, "data-panel-glyph");
		expect(glyph).toContain('data-tone="warn"');
		expect(glyph).toMatch(/\btext-gate-warn\b/);
		expect(warn.indexOf("data-panel-glyph")).toBeLessThan(warn.indexOf("<h2"));
		expect(tagOf(render({ tone: "block" }), "data-panel-glyph")).toMatch(
			/\btext-gate-block\b/,
		);
	});

	it("renders defaultOpen on the server even with a storage key", () => {
		expect(
			tagOf(render({ storageKey: "k", defaultOpen: false }), "p-toggle"),
		).toContain('aria-expanded="false"');
	});
});

describe("the data components are shape-agnostic", () => {
	for (const file of ["data-panel", "data-table", "status-pill"]) {
		it(`${file}.tsx names no domain type`, () => {
			const source = readFileSync(
				new URL(`../src/components/avel/${file}.tsx`, import.meta.url),
				"utf8",
			);
			expect(source).not.toMatch(/\b(?:Mission|Client|Engagement|Proposal)\b/);
		});
	}
});
