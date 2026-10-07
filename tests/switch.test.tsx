import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Switch } from "@/components/ui/switch";
import { TooltipProvider } from "@/components/ui/tooltip";
import { tagOf } from "./render-page";

/*
 * Switch's disabledReason behaves as Button's does (AVEL-DESIGN.md ruling
 * 11): the switch is truly disabled, a focusable wrapper carries the tooltip,
 * and the reason is in the markup, named by aria-describedby.
 */

const render = (node: React.ReactNode) =>
	renderToString(<TooltipProvider>{node}</TooltipProvider>);

const REASON = "Attaching needs the operator's skill routes.";

describe("Switch with a disabledReason", () => {
	const html = render(
		<Switch data-testid="sw" checked disabledReason={REASON} />,
	);

	it("is disabled, even with no disabled prop", () => {
		expect(tagOf(html, "sw")).toMatch(/\sdisabled=""/);
	});

	it("sits in a focusable wrapper that names the same reason", () => {
		const wrapper = html.match(
			/<span[^>]*data-slot="button-with-reason"[^>]*>/,
		)?.[0];
		expect(wrapper).toBeDefined();
		expect(wrapper).toContain('tabindex="0"');
		expect(html.indexOf("button-with-reason")).toBeLessThan(
			html.indexOf('data-testid="sw"'),
		);
	});

	it("links the reason to the switch by aria-describedby", () => {
		const id = tagOf(html, "sw").match(/aria-describedby="([^"]+)"/)?.[1];
		expect(id).toBeDefined();
		expect(html).toContain(
			`id="${id}" data-slot="button-reason" class="sr-only">${REASON.replace("'", "&#x27;")}<`,
		);
	});

	it("keeps its checked state, so the page shows what is attached", () => {
		expect(tagOf(html, "sw")).toContain('data-state="checked"');
	});
});

describe("Switch without a reason", () => {
	it("renders as before: no wrapper, no describedby, enabled", () => {
		const html = render(<Switch data-testid="sw" />);
		expect(html).not.toContain("button-with-reason");
		expect(tagOf(html, "sw")).not.toContain("aria-describedby");
		expect(tagOf(html, "sw")).not.toMatch(/\sdisabled=""/);
	});

	it("still disables with plain disabled, and adds no reason", () => {
		const html = render(<Switch data-testid="sw" disabled />);
		expect(tagOf(html, "sw")).toMatch(/\sdisabled=""/);
		expect(html).not.toContain("button-with-reason");
	});
});
