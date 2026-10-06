import { describe, expect, it } from "vitest";
import { ALL_LINKS, linkFor } from "../src/shell/nav";
import { renderPage, tagOf } from "./render-page";

/** The markup of the top bar alone. */
function topbarOf(html: string): string {
	return html.slice(
		html.indexOf('data-testid="topbar"'),
		html.indexOf("</header>"),
	);
}

/** The classes of the first element carrying this data-testid. */
function classesOf(html: string, testid: string): string[] {
	return (tagOf(html, testid).match(/class="([^"]*)"/)?.[1] ?? "").split(" ");
}

describe("on every sidebar page", () => {
	for (const { to, label } of ALL_LINKS) {
		it(`${to}: the global cluster, the drawer button and its own title`, async () => {
			const html = await renderPage(to);
			const header = topbarOf(html);
			// The cluster (d6): command menu, quick create, inbox.
			// The bell and the theme button are gone; the theme lives in the
			// operator menu and the command menu.
			for (const id of ["global-search", "global-inbox"]) {
				expect(tagOf(header, id)).toMatch(/\saria-label="[^"]+"/);
			}
			// The phone's only way into the navigation (ruling 14 merged the bars).
			const drawer = tagOf(header, "drawer-open");
			expect(drawer).toContain('aria-label="Open navigation"');
			expect(drawer).toMatch(/\bmd:hidden\b/);
			// The heading is the sidebar's label, read from nav.ts on every page.
			expect(header.match(/<h1[^>]*>([^<]*)<\/h1>/)?.[1]).toBe(label);

			const title = `${label} · AVEL`;
			expect(html.match(/<title>[^<]*<\/title>/g)).toEqual([
				`<title>${title}</title>`,
			]);
		});
	}
});

describe("the document head", () => {
	it("links the SVG favicon", async () => {
		expect(await renderPage("/missions")).toMatch(
			/<link[^>]*rel="icon"[^>]*type="image\/svg\+xml"[^>]*href="\/favicon\.svg"/,
		);
	});
});

describe("the global cluster", () => {
	it("no longer carries the bell or the theme button", async () => {
		const html = await renderPage("/clients");
		expect(html).not.toContain('data-testid="global-notifications"');
		expect(html).not.toContain('data-testid="global-theme"');
	});
});

describe("the top bar", () => {
	it("is exactly --topbar-height tall and sticks to the canvas top", async () => {
		const bar = classesOf(await renderPage("/clients"), "topbar");
		expect(bar).toContain("h-(--topbar-height)");
		expect(bar).toContain("sticky");
		expect(bar).toContain("top-0");
		expect(bar).not.toContain("min-h-16");
	});

	it("paints the canvas surface, so content scrolls under it unseen", async () => {
		expect(classesOf(await renderPage("/clients"), "topbar")).toContain(
			"bg-card",
		);
	});

	it("shows its border only once the canvas has scrolled", async () => {
		const html = await renderPage("/clients");
		const bar = classesOf(html, "topbar");
		expect(tagOf(html, "topbar")).not.toMatch(/\sdata-scrolled=/);
		expect(bar).toContain("border-transparent");
		expect(bar).toContain("data-scrolled:border-border");
		expect(bar).not.toContain("border-border");
	});

	it("is watched by a sentinel just above it, not a scroll listener", async () => {
		const html = await renderPage("/clients");
		const sentinel = html.indexOf('data-testid="page-sentinel"');
		expect(sentinel).toBeGreaterThan(-1);
		expect(sentinel).toBeLessThan(html.indexOf('data-testid="topbar"'));
		expect(tagOf(html, "page-sentinel")).toContain('aria-hidden="true"');
	});

	it("puts page actions left of the cluster, divided by a hairline", async () => {
		const html = await renderPage("/clients");
		const actions = html.indexOf('data-testid="topbar-actions"');
		const cluster = html.indexOf('data-testid="global-actions"');
		const divider = html
			.slice(actions, cluster)
			.match(/<[a-z]+[^>]*data-slot="separator"[^>]*>/)?.[0];
		expect(actions).toBeGreaterThan(-1);
		expect(cluster).toBeGreaterThan(actions);
		expect(divider).toMatch(/data-orientation="vertical"/);
	});

	for (const [path, id] of [
		["/clients", "clients-new"],
		["/missions", "missions-new"],
	] as const) {
		it(`${path}: its action is small, with a leading plus`, async () => {
			const html = await renderPage(path);
			expect(tagOf(html, id)).toContain('data-size="sm"');
			const start = html.indexOf(`data-testid="${id}"`);
			const inner = html.slice(start, html.indexOf("</button>", start));
			expect(inner).toMatch(/^[^>]*>\s*<svg[^>]*lucide-plus/);
		});
	}

	it("reserves no action slot and no divider on a page without actions", async () => {
		const html = await renderPage("/");
		expect(html).not.toContain('data-testid="topbar-actions"');
		expect(topbarOf(html)).not.toContain('data-slot="separator"');
	});

	it("keeps a canvas page's definition: canvas lays out only the body", async () => {
		const { purpose } = linkFor("/");
		const header = topbarOf(await renderPage("/"));
		expect(header).toMatch(/data-testid="topbar-definition"/);
		expect(header).toContain(`>${purpose}</p>`);
	});

	it("sets its title and definition in the type scale", async () => {
		const html = await renderPage("/clients");
		expect(topbarOf(html)).toMatch(/<h1 class="type-h2\b/);
		const definition = classesOf(html, "topbar-definition");
		expect(definition).toContain("type-small");
		expect(definition).toContain("text-text-subtle");
		expect(definition.join(" ")).not.toMatch(/\btext-(?:sm|lg|xs)\b/);
	});
});

describe("one content width", () => {
	const GUTTER = ["px-4", "md:px-6", "lg:px-8"];

	it("starts the title and the body on the same gutter, next to the sidebar", async () => {
		const html = await renderPage("/clients");
		const bar = classesOf(html, "topbar-row");
		const body = classesOf(html, "page-body");
		for (const cls of GUTTER) {
			expect(bar).toContain(cls);
			expect(body).toContain(cls);
		}
		// Centring either one pushes the title away from the sidebar on any
		// canvas wider than the cap.
		expect(bar).not.toContain("mx-auto");
		expect(body).not.toContain("mx-auto");
	});

	it("spans the canvas with the bar and caps only the body", async () => {
		const html = await renderPage("/clients");
		const bar = classesOf(html, "topbar-row");
		const body = classesOf(html, "page-body");
		expect(bar).toContain("w-full");
		expect(bar.some((c) => c.startsWith("max-w-"))).toBe(false);
		expect(body).toContain("max-w-(--content-max)");
	});

	it("gives a canvas page the same full-width bar", async () => {
		const bar = classesOf(await renderPage("/"), "topbar-row");
		for (const cls of [...GUTTER, "w-full"]) expect(bar).toContain(cls);
	});

	it("keeps vertical spacing on the 8px rhythm", async () => {
		const body = classesOf(await renderPage("/clients"), "page-body");
		const steps = body
			.map((c) => c.match(/^(?:p[ytb]?|gap)-(\d+)$/)?.[1])
			.filter((n): n is string => n !== undefined)
			.map(Number);
		expect(steps.length).toBeGreaterThan(0);
		for (const step of steps) expect(step % 2).toBe(0);
	});
});
