import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderPage, tagOf } from "./render-page";

/*
 * The notice a phone gets on a construction route. The server cannot know the
 * width, so the boundary renders the page there; this swaps the boundary for
 * its notice to render it inside the real shell.
 */
vi.mock("../src/shell/device-boundary", async (importOriginal) => {
	const mod =
		await importOriginal<typeof import("../src/shell/device-boundary")>();
	return {
		...mod,
		DeviceBoundary: () => createElement(mod.DeviceBoundaryNotice),
	};
});

describe("the desktop-only notice on a phone", () => {
	it("keeps the page's top bar, with the menu button, and names the page", async () => {
		const html = await renderPage("/clients");
		expect(html).toContain('data-testid="topbar"');
		expect(html).toContain('data-testid="drawer-open"');
		// The top bar's h1 is the page; the notice's heading is under it.
		expect(html).toMatch(/<h1[^>]*>Clients<\/h1>/);
		expect(html).toMatch(/<h2[^>]*>Clients needs a desktop<\/h2>/);
		expect(tagOf(html, "device-boundary")).toBeDefined();
	});

	it("leads with Copy the link; Send the link, the primary, is last", async () => {
		const html = await renderPage("/clients");
		const copy = html.indexOf('data-testid="device-boundary-copy"');
		expect(copy).toBeGreaterThan(-1);
		// The share button needs navigator.share, so the server leaves it out;
		// when it shows, it follows Copy.
		const share = html.indexOf('data-testid="device-boundary-share"');
		expect(share === -1 || share > copy).toBe(true);
	});
});
