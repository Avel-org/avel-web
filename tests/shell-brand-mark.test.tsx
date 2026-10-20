import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandMark } from "@/shell/brand-mark";
import { tagOf } from "./render-page";

describe("the brand mark", () => {
	it("sits on the primary's bottom stop, not the accent: 3:1 with white in dark", () => {
		const tag = tagOf(renderToString(<BrandMark />), "brand-mark");
		expect(tag).toMatch(/\bbg-btn-primary-bottom\b/);
		expect(tag).not.toMatch(/\bbg-accent\b/);
		expect(tag).toContain('aria-hidden="true"');
	});
});
