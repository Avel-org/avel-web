import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SearchField } from "@/components/avel/search-field";
import { tagOf } from "./render-page";

const field = (value: string, shortcut?: "/") =>
	renderToString(
		<SearchField
			value={value}
			onChange={() => {}}
			label="Search teams"
			placeholder="Search teams"
			shortcut={shortcut}
			data-testid="s"
		/>,
	);

describe("SearchField (v3 .field)", () => {
	it("is the field surface at the control height and radius, with a 14px icon", () => {
		const box = tagOf(field(""), "s");
		for (const cls of ["field-surface", "h-control-md", "rounded-control"])
			expect(box).toContain(cls);
		expect(field("")).toMatch(/lucide-search[^"]*size-3\.5/);
	});

	it("labels the input for screen readers and shows the placeholder", () => {
		const html = field("");
		const input = tagOf(html, "s-input");
		expect(input).toContain('placeholder="Search teams"');
		const id = input.match(/\sid="([^"]+)"/)?.[1];
		expect(html).toContain(`for="${id}"`);
	});

	it("offers Clear only once something is typed", () => {
		expect(field("")).not.toContain('data-testid="s-clear"');
		const clear = tagOf(field("atlas"), "s-clear");
		expect(clear).toContain('aria-label="Clear search"');
		expect(clear).toContain('type="button"');
	});

	it("shows its key hint while empty, and Clear in its place when filled", () => {
		expect(field("", "/")).toMatch(/data-testid="s-kbd"[^>]*>\/</);
		expect(field("atlas", "/")).not.toContain('data-testid="s-kbd"');
	});
});
