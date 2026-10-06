import { describe, expect, it } from "vitest";
import { ALL_LINKS } from "../src/shell/nav";
import { renderPage, tagOf } from "./render-page";

// TanStack's default not-found renders a bare <p>Not Found</p>. These pin
// that it never appears on a real page, and that an unknown address gets the
// designed page instead. Signed in, so the shell and its outlet render.

/** TanStack's bare default, as markup. */
const BARE = />Not Found</;

describe("no real page shows a not-found", () => {
	for (const to of ["/", ...ALL_LINKS.map((link) => link.to)]) {
		it(`${to}: no "Not Found" anywhere in the server's HTML`, async () => {
			const html = await renderPage(to);
			expect(html).not.toMatch(BARE);
			expect(html).not.toContain('data-testid="not-found"');
		});
	}
});

describe("an address no route matches", () => {
	it("gets the designed page in the canvas, never the bare text", async () => {
		const html = await renderPage("/no-such-page");
		expect(html).not.toMatch(BARE);
		expect(html).toContain('data-testid="app-shell"');
		const canvas = html.slice(html.indexOf('data-testid="canvas-scroll"'));
		expect(canvas).toContain('data-testid="not-found"');
		expect(canvas).toContain("This page doesn&#x27;t exist");
	});

	it("titles itself in the top bar and offers a way home", async () => {
		const html = await renderPage("/no-such-page");
		expect(html).toMatch(/<h1[^>]*>Page not found<\/h1>/);
		expect(tagOf(html, "not-found-home")).toMatch(/^<a[^>]*href="\/"/);
	});
});
