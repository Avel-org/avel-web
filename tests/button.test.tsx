import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { countText, tagOf, tagWithId, textOfId } from "./render-page";

const reason = "Two gates are still pending.";

const html = renderToString(
	<TooltipProvider>
		<Button data-testid="deliver" disabledReason={reason}>
			Deliver
		</Button>
	</TooltipProvider>,
);

describe("a button disabled with a reason (ruling 11)", () => {
	it("is disabled by the real attribute", () => {
		expect(tagOf(html, "deliver")).toMatch(/\sdisabled=""/);
	});

	it("links the reason to the button through a visually hidden span", () => {
		const id = tagOf(html, "deliver").match(/aria-describedby="([^"]+)"/)?.[1];
		expect(id).toBeDefined();
		expect(tagWithId(html, id ?? "")).toMatch(/class="sr-only"/);
		expect(textOfId(html, id ?? "")).toBe(reason);
	});

	it("prints no visible reason: the hidden span is its only copy", () => {
		expect(countText(html, reason)).toBe(1);
	});

	it("wraps the button in a focusable tooltip trigger", () => {
		const wrapper = html.match(
			/<span[^>]*data-slot="button-with-reason"[^>]*>\s*<button/,
		)?.[0];
		expect(wrapper).toBeDefined();
		expect(wrapper).toMatch(/tabindex="0"/);
		expect(wrapper).toMatch(/data-state="closed"/);
	});
});

describe("a button with no reason", () => {
	const plain = renderToString(<Button data-testid="go">Go</Button>);

	it("renders the bare button, with no wrapper and no hidden reason", () => {
		expect(plain).toMatch(/^<button/);
		expect(plain).not.toContain("button-with-reason");
		expect(plain).not.toContain("sr-only");
	});
});
